import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IparluxProduct {
  sku: string;
  description: string;
  stock: number;
  price: number;
  has_image: boolean;
  image_gif_url?: string;
  image_jpg_url?: string;
  category?: string;
  raw_data?: any;
  referencia?: string;
}

// Helper function to connect to FTP using basic TCP socket
async function ftpConnect(host: string, user: string, password: string): Promise<Deno.Conn> {
  console.log(`🔌 Opening TCP connection to ${host}:21...`);
  const conn = await Deno.connect({ hostname: host, port: 21 });
  
  // Read welcome message
  const welcomeBuffer = new Uint8Array(1024);
  const welcomeLen = await conn.read(welcomeBuffer);
  const welcome = new TextDecoder().decode(welcomeBuffer.subarray(0, welcomeLen || 0));
  console.log('📨 Server welcome:', welcome.trim());
  
  if (!welcome.includes('220')) {
    throw new Error(`FTP server did not send welcome message: ${welcome}`);
  }
  
  // Send USER command
  const userCmd = `USER ${user}\r\n`;
  await conn.write(new TextEncoder().encode(userCmd));
  console.log(`📤 Sent: USER ${user}`);
  
  const userBuffer = new Uint8Array(1024);
  const userLen = await conn.read(userBuffer);
  const userResponse = new TextDecoder().decode(userBuffer.subarray(0, userLen || 0));
  console.log('📨 USER response:', userResponse.trim());
  
  if (!userResponse.includes('331')) {
    throw new Error(`FTP USER command failed: ${userResponse.trim()}`);
  }
  
  // Send PASS command
  const passCmd = `PASS ${password}\r\n`;
  await conn.write(new TextEncoder().encode(passCmd));
  console.log('📤 Sent: PASS ******');
  
  const passBuffer = new Uint8Array(1024);
  const passLen = await conn.read(passBuffer);
  const passResponse = new TextDecoder().decode(passBuffer.subarray(0, passLen || 0));
  console.log('📨 PASS response:', passResponse.trim());
  
  if (!passResponse.includes('230')) {
    throw new Error(`FTP login failed: ${passResponse.trim()}`);
  }
  
  console.log('✅ FTP authentication successful');
  return conn;
}

async function ftpList(conn: Deno.Conn): Promise<string[]> {
  // Enter passive mode
  const pasvCmd = 'PASV\r\n';
  await conn.write(new TextEncoder().encode(pasvCmd));
  
  const pasvBuffer = new Uint8Array(1024);
  await conn.read(pasvBuffer);
  const pasvResponse = new TextDecoder().decode(pasvBuffer);
  console.log('📨 PASV response:', pasvResponse.substring(0, 150));
  
  // Extract IP and port from PASV response
  // Format: 227 Entering Passive Mode (h1,h2,h3,h4,p1,p2)
  const match = pasvResponse.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
  if (!match) {
    throw new Error('Failed to parse PASV response');
  }
  
  const dataHost = `${match[1]}.${match[2]}.${match[3]}.${match[4]}`;
  const dataPort = parseInt(match[5]) * 256 + parseInt(match[6]);
  console.log(`📡 Data connection: ${dataHost}:${dataPort}`);
  
  // Connect to data port
  const dataConn = await Deno.connect({ hostname: dataHost, port: dataPort });
  
  // Send LIST command
  const listCmd = 'LIST\r\n';
  await conn.write(new TextEncoder().encode(listCmd));
  
  // Read list response
  const chunks: Uint8Array[] = [];
  const buffer = new Uint8Array(4096);
  
  while (true) {
    const n = await dataConn.read(buffer);
    if (n === null) break;
    chunks.push(buffer.slice(0, n));
  }
  
  dataConn.close();
  
  // Read completion message from control connection
  const completeBuffer = new Uint8Array(1024);
  await conn.read(completeBuffer);
  
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  
  const listOutput = new TextDecoder().decode(combined);
  const files = listOutput.split('\n')
    .filter(line => line.trim())
    .map(line => {
      const parts = line.trim().split(/\s+/);
      return parts[parts.length - 1];
    });
  
  return files;
}

async function ftpDownload(conn: Deno.Conn, filename: string): Promise<string> {
  // Enter passive mode
  const pasvCmd = 'PASV\r\n';
  await conn.write(new TextEncoder().encode(pasvCmd));
  
  const pasvBuffer = new Uint8Array(1024);
  await conn.read(pasvBuffer);
  const pasvResponse = new TextDecoder().decode(pasvBuffer);
  
  // Extract IP and port from PASV response
  const match = pasvResponse.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
  if (!match) {
    throw new Error('Failed to parse PASV response for download');
  }
  
  const dataHost = `${match[1]}.${match[2]}.${match[3]}.${match[4]}`;
  const dataPort = parseInt(match[5]) * 256 + parseInt(match[6]);
  
  // Connect to data port
  const dataConn = await Deno.connect({ hostname: dataHost, port: dataPort });
  
  // Send RETR command
  const retrCmd = `RETR ${filename}\r\n`;
  await conn.write(new TextEncoder().encode(retrCmd));
  
  // Read status
  const statusBuffer = new Uint8Array(1024);
  await conn.read(statusBuffer);
  const statusResponse = new TextDecoder().decode(statusBuffer);
  console.log('📨 RETR response:', statusResponse.substring(0, 100));
  
  // Read file data
  const chunks: Uint8Array[] = [];
  const buffer = new Uint8Array(8192);
  
  while (true) {
    const n = await dataConn.read(buffer);
    if (n === null) break;
    chunks.push(buffer.slice(0, n));
  }
  
  dataConn.close();
  
  // Read completion message
  const completeBuffer = new Uint8Array(1024);
  await conn.read(completeBuffer);
  const completeResponse = new TextDecoder().decode(completeBuffer);
  console.log('📨 Transfer complete:', completeResponse.substring(0, 100));
  
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  
  return new TextDecoder().decode(combined);
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action } = await req.json();

    if (action === 'sync_catalog') {
      console.log('🔄 Starting Iparlux catalog sync...');
      
      // Get FTP configuration from environment
      const ftpHost = Deno.env.get('IPARLUX_FTP_HOST')?.trim() || 'ftpclientes.iparlux.es';
      const ftpUser = Deno.env.get('IPARLUX_FTP_USER')?.trim() || '';
      const ftpPassword = Deno.env.get('IPARLUX_FTP_PASSWORD')?.trim() || '';
      const imageBaseUrl = Deno.env.get('IPARLUX_IMAGE_BASE_URL') || 'http://www.iparlux.es/imagenes/catalogo';

      // Validate credentials
      if (!ftpUser || !ftpPassword) {
        throw new Error('FTP credentials not configured. Please check IPARLUX_FTP_USER and IPARLUX_FTP_PASSWORD secrets.');
      }

      console.log(`📡 Connecting to FTP: ${ftpHost}`);
      console.log(`👤 User: "${ftpUser}" (length: ${ftpUser.length})`);
      console.log(`🔑 Password: "${ftpPassword.substring(0, 3)}***" (length: ${ftpPassword.length})`);

      let conn: Deno.Conn | null = null;
      
      try {
        // Connect to FTP
        conn = await ftpConnect(ftpHost, ftpUser, ftpPassword);
        
        // List files
        console.log('📂 Listing files...');
        const files = await ftpList(conn);
        console.log(`📂 Found ${files.length} files:`, files.join(', '));

        // Look for catalog file
        let catalogFileName = '';
        const patterns = ['stock', 'catalogo', 'producto', '.csv', '.txt'];
        
        for (const file of files) {
          const fileLower = file.toLowerCase();
          if (patterns.some(pattern => fileLower.includes(pattern))) {
            catalogFileName = file;
            console.log(`📄 Found catalog file: ${file}`);
            break;
          }
        }

        if (!catalogFileName) {
          // Try common default names
          const commonNames = ['stock.txt', 'STOCK.TXT', 'catalogo.csv', 'CATALOGO.CSV'];
          for (const name of commonNames) {
            if (files.includes(name)) {
              catalogFileName = name;
              break;
            }
          }
        }

        if (!catalogFileName) {
          throw new Error(`No catalog file found in FTP. Available files: ${files.join(', ')}`);
        }

        console.log(`📥 Downloading catalog file: ${catalogFileName}`);
        const fileContent = await ftpDownload(conn, catalogFileName);
        console.log(`📋 Downloaded ${fileContent.length} characters`);

        // Parse the file content
        const fileLines = fileContent.split('\n');
        console.log(`📋 Processing ${fileLines.length} lines...`);

        const products: IparluxProduct[] = [];
        let skippedLines = 0;

        // Detect delimiter
        const firstDataLine = fileLines[1] || fileLines[0];
        let delimiter = ';';
        if (firstDataLine.includes('|')) delimiter = '|';
        else if (firstDataLine.includes('\t')) delimiter = '\t';
        else if (firstDataLine.includes(',') && !firstDataLine.includes(';')) delimiter = ',';

        console.log(`🔍 Detected delimiter: "${delimiter}"`);

        // Skip header line and process data
        for (let i = 1; i < fileLines.length; i++) {
          const line = fileLines[i].trim();
          if (!line) continue;

          try {
            const fields = line.split(delimiter).map(f => f.trim());
            
            if (fields.length < 3) {
              skippedLines++;
              continue;
            }

            const sku = fields[0] || '';
            const description = fields[1] || '';
            let stock = 0;
            let price = 0;

            // Try to find numeric fields for stock and price
            for (let j = 2; j < Math.min(fields.length, 5); j++) {
              const cleaned = fields[j].replace(',', '.');
              const num = parseFloat(cleaned);
              if (!isNaN(num)) {
                if (num > 100) {
                  if (price === 0) price = num;
                } else {
                  if (stock === 0) stock = Math.floor(num);
                }
              }
            }

            if (!sku || !description) {
              skippedLines++;
              continue;
            }

            products.push({
              sku,
              referencia: sku,
              description,
              stock,
              price,
              has_image: true,
              image_gif_url: `${imageBaseUrl}/${sku}.gif`,
              image_jpg_url: `${imageBaseUrl}/${sku}.jpg`,
              raw_data: {
                source: 'iparlux_ftp',
                import_date: new Date().toISOString(),
                raw_line: line,
                file_name: catalogFileName
              }
            });
          } catch (err) {
            console.error(`Error parsing line ${i}:`, err);
            skippedLines++;
          }
        }

        console.log(`✅ Parsed ${products.length} products (skipped ${skippedLines} lines)`);

        if (products.length === 0) {
          throw new Error('No valid products found in catalog file');
        }

        // Upsert products in batches
        const batchSize = 100;
        let successCount = 0;

        for (let i = 0; i < products.length; i += batchSize) {
          const batch = products.slice(i, i + batchSize);
          
          const { error } = await supabaseClient
            .from('iparlux_products')
            .upsert(batch, { onConflict: 'sku' });

          if (error) {
            console.error('❌ Error upserting batch:', error);
            throw error;
          }

          successCount += batch.length;
          console.log(`✅ Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(products.length / batchSize)} (${successCount} products)`);
        }

        // Close FTP connection
        conn.close();

        return new Response(
          JSON.stringify({
            success: true,
            message: `✅ Sincronizados ${successCount} productos de Iparlux`,
            stats: {
              total: successCount,
              skipped: skippedLines,
              file: catalogFileName
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (ftpError) {
        if (conn) {
          try {
            conn.close();
          } catch (e) {
            console.error('Error closing FTP connection:', e);
          }
        }
        console.error('❌ FTP Error:', ftpError);
        throw new Error(`FTP Error: ${ftpError instanceof Error ? ftpError.message : 'Unknown error'}`);
      }
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use: sync_catalog' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in iparlux-sync:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});