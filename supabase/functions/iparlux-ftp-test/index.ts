import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function ftpConnect(host: string, user: string, password: string): Promise<Deno.Conn> {
  console.log(`🔌 Opening TCP connection to ${host}:21...`);
  const conn = await Deno.connect({ hostname: host, port: 21 });
  
  const welcomeBuffer = new Uint8Array(1024);
  const welcomeLen = await conn.read(welcomeBuffer);
  const welcome = new TextDecoder().decode(welcomeBuffer.subarray(0, welcomeLen || 0));
  console.log('📨 Server welcome:', welcome.trim());
  
  if (!welcome.includes('220')) {
    throw new Error(`FTP server did not send welcome message: ${welcome}`);
  }
  
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
  const pasvCmd = 'PASV\r\n';
  await conn.write(new TextEncoder().encode(pasvCmd));
  
  const pasvBuffer = new Uint8Array(1024);
  await conn.read(pasvBuffer);
  const pasvResponse = new TextDecoder().decode(pasvBuffer);
  
  const match = pasvResponse.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
  if (!match) {
    throw new Error('Failed to parse PASV response');
  }
  
  const dataHost = `${match[1]}.${match[2]}.${match[3]}.${match[4]}`;
  const dataPort = parseInt(match[5]) * 256 + parseInt(match[6]);
  
  const dataConn = await Deno.connect({ hostname: dataHost, port: dataPort });
  
  const listCmd = 'LIST\r\n';
  await conn.write(new TextEncoder().encode(listCmd));
  
  const chunks: Uint8Array[] = [];
  const buffer = new Uint8Array(4096);
  
  while (true) {
    const n = await dataConn.read(buffer);
    if (n === null) break;
    chunks.push(buffer.slice(0, n));
  }
  
  dataConn.close();
  
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 Testing FTP connection...');
    
    const ftpHost = Deno.env.get('IPARLUX_FTP_HOST')?.trim() || 'ftpclientes.iparlux.es';
    const ftpUser = Deno.env.get('IPARLUX_FTP_USER')?.trim() || '';
    const ftpPassword = Deno.env.get('IPARLUX_FTP_PASSWORD')?.trim() || '';

    if (!ftpUser || !ftpPassword) {
      throw new Error('FTP credentials not configured');
    }

    console.log(`📡 Connecting to: ${ftpHost}`);
    console.log(`👤 User: ${ftpUser}`);

    let conn: Deno.Conn | null = null;
    
    try {
      conn = await ftpConnect(ftpHost, ftpUser, ftpPassword);
      
      console.log('📂 Listing files...');
      const files = await ftpList(conn);
      console.log(`📂 Found ${files.length} files`);

      conn.close();

      return new Response(
        JSON.stringify({
          success: true,
          message: `✅ Conexión FTP exitosa. ${files.length} archivos encontrados`,
          files: files
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (ftpError) {
      if (conn) {
        try {
          conn.close();
        } catch (e) {
          console.error('Error closing connection:', e);
        }
      }
      throw ftpError;
    }

  } catch (error: any) {
    console.error('❌ FTP test error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        message: `❌ Error FTP: ${error.message}`
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
