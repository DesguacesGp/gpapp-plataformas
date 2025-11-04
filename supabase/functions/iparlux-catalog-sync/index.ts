import { Client } from "https://deno.land/x/mysql/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IparluxProduct {
  sku: string;
  description: string;
  category?: string;
  price: number;
  stock: number;
  referencia?: string;
  marca?: string;
  modelo?: string;
  año_desde?: string;
  año_hasta?: string;
  image_gif_url?: string;
  image_jpg_url?: string;
  has_image: boolean;
  raw_data?: any;
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
      console.log('🔄 Starting Iparlux MySQL catalog sync...');

      // Get MySQL credentials
      const mysqlHost = Deno.env.get('IPARLUX_MYSQL_HOST')?.trim() || 'iparlux.es';
      const mysqlDatabase = Deno.env.get('IPARLUX_MYSQL_DATABASE')?.trim() || 'catalogo_iparlux';
      const mysqlUser = Deno.env.get('IPARLUX_MYSQL_USER')?.trim() || 'catalogo_iparlux';
      const mysqlPassword = Deno.env.get('IPARLUX_MYSQL_PASSWORD')?.trim() || '';
      const imageBaseUrl = Deno.env.get('IPARLUX_IMAGE_BASE_URL') || 'http://www.iparlux.es/imagenes/catalogo';

      if (!mysqlPassword) {
        throw new Error('MySQL password not configured');
      }

      console.log(`📊 MySQL Host: ${mysqlHost}`);
      console.log(`📊 Database: ${mysqlDatabase}`);
      console.log(`📊 User: ${mysqlUser}`);

      let mysqlClient: Client | null = null;

      try {
        // Connect to MySQL
        console.log('🔌 Connecting to MySQL...');
        mysqlClient = await new Client().connect({
          hostname: mysqlHost,
          username: mysqlUser,
          password: mysqlPassword,
          db: mysqlDatabase,
          port: 3306,
        });

        console.log('✅ MySQL connection established');

        // First, let's explore the database structure
        console.log('🔍 Exploring database tables...');
        const tablesResult = await mysqlClient.query('SHOW TABLES');
        console.log('📋 Tables result (direct array):', JSON.stringify(tablesResult, null, 2));

        if (!tablesResult || tablesResult.length === 0) {
          throw new Error('No tables found in database. Please verify database permissions and that tables exist.');
        }

        // Try to find the products table
        const availableTables: string[] = [];
        
        // MySQL library returns data directly in the array, not in .rows
        for (const row of tablesResult) {
          console.log('📦 Processing row:', row);
          // MySQL returns tables as: { "Tables_in_catalogo_iparlux": "catalogo_iparlux" }
          let tableName = '';
          
          if (typeof row === 'string') {
            tableName = row;
          } else if (Array.isArray(row)) {
            tableName = row[0];
          } else if (typeof row === 'object') {
            const values = Object.values(row);
            tableName = values[0] as string;
          }
          
          if (tableName) {
            availableTables.push(tableName);
            console.log(`📌 Found table: ${tableName}`);
          }
        }

        console.log('📋 All available tables:', availableTables);

        // We know the table is called "catalogo_iparlux" from logs
        const productsTable = 'catalogo_iparlux';
        
        if (!availableTables.includes(productsTable)) {
          throw new Error(`Table "${productsTable}" not found. Available tables: ${availableTables.join(', ')}`);
        }

        console.log(`✅ Using confirmed table: ${productsTable}`);

        // Get table structure
        console.log('📋 Exploring table structure...');
        const structureResult = await mysqlClient.query(`DESCRIBE ${productsTable}`);
        console.log('📋 Table structure:', JSON.stringify(structureResult, null, 2));
        console.log('📋 Structure type:', typeof structureResult, 'isArray:', Array.isArray(structureResult));

        // Fetch sample products first
        console.log('📦 Fetching sample products (10)...');
        const sampleResult = await mysqlClient.query(`SELECT * FROM ${productsTable} LIMIT 10`);
        console.log('📦 Sample result type:', typeof sampleResult, 'isArray:', Array.isArray(sampleResult));
        console.log('📦 Sample result length:', sampleResult?.length);
        console.log('📦 Sample result keys:', Object.keys(sampleResult || {}));
        console.log('📦 Sample products:', JSON.stringify(sampleResult, null, 2));

        // Fetch products (limit to 1000 for initial test)
        console.log('📥 Fetching products from MySQL...');
        const productsResult = await mysqlClient.query(`SELECT * FROM ${productsTable} LIMIT 1000`);
        console.log('📊 Products result type:', typeof productsResult, 'isArray:', Array.isArray(productsResult));
        console.log('📊 Products result length:', productsResult?.length);
        console.log('📊 Products result keys:', Object.keys(productsResult || {}));
        
        // Check if it's an array or if data is in a property
        let productsArray = productsResult;
        if (!Array.isArray(productsResult) && productsResult?.rows) {
          console.log('📊 Found .rows property, using that instead');
          productsArray = productsResult.rows;
        }
        
        if (!productsArray || productsArray.length === 0) {
          console.error('❌ No products found. Result:', JSON.stringify(productsResult, null, 2));
          throw new Error('No products found in MySQL table');
        }

        console.log(`✅ Retrieved ${productsArray.length} products from MySQL`);

        // Transform MySQL data to our format
        const products: IparluxProduct[] = [];
        let skipped = 0;

        for (const row of productsArray) {
          try {
            // Map fields (adjust based on actual column names)
            const sku = row.referencia || row.codigo || row.sku || row.id;
            const description = row.descripcion || row.nombre || row.description || '';
            
            if (!sku || !description) {
              skipped++;
              continue;
            }

            const product: IparluxProduct = {
              sku: String(sku),
              description: String(description),
              category: row.categoria || row.familia || null,
              price: parseFloat(row.precio || row.pvp || row.price || '0'),
              stock: 0, // Stock comes from FTP, not MySQL
              referencia: String(sku),
              marca: row.marca || row.brand || null,
              modelo: row.modelo || row.model || null,
              año_desde: row.ano_desde || row.año_desde || row.year_from || null,
              año_hasta: row.ano_hasta || row.año_hasta || row.year_to || null,
              image_gif_url: `${imageBaseUrl}/${sku}.gif`,
              image_jpg_url: `${imageBaseUrl}/${sku}.jpg`,
              has_image: true,
              raw_data: {
                source: 'iparlux_mysql',
                import_date: new Date().toISOString(),
                ...row
              }
            };

            products.push(product);
          } catch (err) {
            console.error('Error processing product row:', err, row);
            skipped++;
          }
        }

        console.log(`✅ Processed ${products.length} products (skipped ${skipped})`);

        if (products.length === 0) {
          throw new Error('No valid products after transformation');
        }

        // Upsert products to Supabase in batches
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
          console.log(`✅ Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(products.length / batchSize)} completed (${successCount} products)`);
        }

        await mysqlClient.close();

        return new Response(
          JSON.stringify({
            success: true,
            message: `✅ Importados ${successCount} productos desde MySQL`,
            stats: {
              total: successCount,
              skipped,
              table: productsTable
            }
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );

      } catch (mysqlError) {
        if (mysqlClient) {
          try {
            await mysqlClient.close();
          } catch (e) {
            console.error('Error closing MySQL connection:', e);
          }
        }
        console.error('❌ MySQL Error:', mysqlError);
        throw mysqlError;
      }
    }

    if (action === 'test_connection') {
      console.log('🔍 Testing MySQL connection...');

      const mysqlHost = Deno.env.get('IPARLUX_MYSQL_HOST')?.trim() || 'iparlux.es';
      const mysqlDatabase = Deno.env.get('IPARLUX_MYSQL_DATABASE')?.trim() || 'catalogo_iparlux';
      const mysqlUser = Deno.env.get('IPARLUX_MYSQL_USER')?.trim() || 'catalogo_iparlux';
      const mysqlPassword = Deno.env.get('IPARLUX_MYSQL_PASSWORD')?.trim() || '';

      try {
        const mysqlClient = await new Client().connect({
          hostname: mysqlHost,
          username: mysqlUser,
          password: mysqlPassword,
          db: mysqlDatabase,
          port: 3306,
        });

        console.log('✅ MySQL connection successful');

        const tablesResult = await mysqlClient.query('SHOW TABLES');
        const tablesList = tablesResult.rows?.map((row: any) => Object.values(row)[0]) || [];

        await mysqlClient.close();

        return new Response(
          JSON.stringify({
            success: true,
            message: '✅ Conexión MySQL exitosa',
            tables: tablesList
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } catch (error) {
        console.error('❌ MySQL connection test failed:', error);
        throw error;
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid action' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('❌ Error in iparlux-catalog-sync:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error',
        message: `❌ Error: ${error.message || 'Unknown error'}`
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
