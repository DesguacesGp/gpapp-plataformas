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
      const ftpHost = Deno.env.get('IPARLUX_FTP_HOST') || 'ftpclientes.iparlux.es';
      const ftpUser = Deno.env.get('IPARLUX_FTP_USER') || '';
      const ftpPassword = Deno.env.get('IPARLUX_FTP_PASSWORD') || '';
      const imageBaseUrl = Deno.env.get('IPARLUX_IMAGE_BASE_URL') || 'http://www.iparlux.es/imagenes/catalogo';

      console.log(`📡 Connecting to FTP: ${ftpHost}`);

      // Connect to FTP server
      const ftpUrl = `ftp://${ftpUser}:${ftpPassword}@${ftpHost}`;
      
      try {
        // List files in FTP directory
        const listResponse = await fetch(ftpUrl);
        
        if (!listResponse.ok) {
          throw new Error(`FTP connection failed: ${listResponse.status}`);
        }

        const listContent = await listResponse.text();
        console.log('📂 FTP directory listing:', listContent.substring(0, 500));

        // Look for catalog file (common names: stock.txt, catalogo.csv, productos.txt, etc.)
        const lines = listContent.split('\n');
        let catalogFileName = '';
        
        for (const line of lines) {
          const lower = line.toLowerCase();
          if (lower.includes('stock') || lower.includes('catalogo') || lower.includes('producto') || lower.includes('.csv') || lower.includes('.txt')) {
            // Extract filename from FTP listing
            const parts = line.trim().split(/\s+/);
            catalogFileName = parts[parts.length - 1];
            break;
          }
        }

        if (!catalogFileName) {
          // Try common default names
          const commonNames = ['stock.txt', 'STOCK.TXT', 'catalogo.csv', 'CATALOGO.CSV', 'productos.txt', 'PRODUCTOS.TXT'];
          for (const name of commonNames) {
            try {
              const testUrl = `${ftpUrl}/${name}`;
              const testResponse = await fetch(testUrl);
              if (testResponse.ok) {
                catalogFileName = name;
                break;
              }
            } catch (e) {
              console.log(`File ${name} not found, trying next...`);
            }
          }
        }

        if (!catalogFileName) {
          throw new Error('No catalog file found in FTP. Available files: ' + listContent);
        }

        console.log('📄 Downloading catalog file:', catalogFileName);

        // Download the catalog file
        const fileUrl = `${ftpUrl}/${catalogFileName}`;
        const fileResponse = await fetch(fileUrl);
        
        if (!fileResponse.ok) {
          throw new Error(`Failed to download catalog: ${fileResponse.status}`);
        }

        const fileContent = await fileResponse.text();
        console.log(`📋 File size: ${fileContent.length} characters`);

        // Parse the file content
        const fileLines = fileContent.split('\n');
        console.log(`📋 Processing ${fileLines.length} lines...`);

        const products: IparluxProduct[] = [];
        let skippedLines = 0;

        // Detect delimiter (could be ;, |, tab, comma)
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
            
            // Flexible field mapping - adjust indices based on actual file format
            // Common formats:
            // - SKU;Description;Stock;Price
            // - Reference;Description;Price;Stock;Category
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
                  // Likely a price (usually higher value)
                  if (price === 0) price = num;
                } else {
                  // Likely stock (usually smaller value)
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