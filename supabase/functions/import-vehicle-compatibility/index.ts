import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedVehicle {
  marca: string;
  modelo: string;
  año_desde: string | null;
  año_hasta: string | null;
}

// Convert 2-digit year to 4-digit year
function parseYear(year: string): string | null {
  if (!year || year === '') return null;
  
  // If already 4 digits, return as-is
  if (year.length === 4) return year;
  
  // If 2 digits
  if (year.length === 2) {
    const num = parseInt(year);
    // 00-29 → 2000-2029
    // 30-99 → 1930-1999
    return num <= 29 ? `20${year}` : `19${year}`;
  }
  
  return year;
}

// Parse MODELO column: "ALFA ROMEO 147 (00->04)" → { marca, modelo, año_desde, año_hasta }
function parseModelo(modeloString: string): ParsedVehicle {
  // Pattern: "MARCA MODELO (YY->YY)" or "MARCA MODELO (YYYY->YYYY)"
  const match = modeloString.match(/^(.+?)\s+(.+?)\s*\((\d{2,4})->(\d{2,4})?\)$/);
  
  if (match) {
    const [_, marca, modelo, desde, hasta] = match;
    return {
      marca: marca.trim().toUpperCase(),
      modelo: modelo.trim(),
      año_desde: parseYear(desde),
      año_hasta: hasta ? parseYear(hasta) : null
    };
  }
  
  // Pattern without year range: "MARCA MODELO"
  const simpleMatch = modeloString.match(/^(.+?)\s+(.+)$/);
  if (simpleMatch) {
    return {
      marca: simpleMatch[1].trim().toUpperCase(),
      modelo: simpleMatch[2].trim(),
      año_desde: null,
      año_hasta: null
    };
  }
  
  // Fallback: treat entire string as marca
  return {
    marca: modeloString.trim().toUpperCase(),
    modelo: '',
    año_desde: null,
    año_hasta: null
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 Starting vehicle compatibility import');
    
    const { csv } = await req.json();
    
    if (!csv || typeof csv !== 'string') {
      throw new Error('CSV data is required');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse CSV
    const lines = csv.split('\n').filter(line => line.trim());
    
    // Auto-detect delimiter (comma or semicolon)
    const delimiter = lines[0].includes(';') ? ';' : ',';
    console.log(`📋 Using delimiter: "${delimiter}"`);
    
    const headers = lines[0].split(delimiter).map(h => h.trim());
    
    console.log(`📊 Found ${lines.length - 1} rows to process`);
    console.log(`📋 Headers: ${headers.join(', ')}`);

    // Find column indices
    const modeloIdx = headers.indexOf('MODELO');
    const referenciaVaunerIdx = headers.indexOf('REFERENCIA VAUNER');
    const referenciaOemIdx = headers.indexOf('REFERENCIA OEM');
    const referenciaAlkarIdx = headers.indexOf('REFERENCIA ALKAR');
    const referenciaJumasaIdx = headers.indexOf('REFERENCIA JUMASA');
    const referenciaGeimexIdx = headers.indexOf('REFERENCIA GEIMEX');

    if (modeloIdx === -1 || referenciaVaunerIdx === -1) {
      throw new Error('Required columns MODELO and REFERENCIA VAUNER not found in CSV');
    }

    let inserted = 0;
    let updated = 0;
    let errors = 0;
    const batch: any[] = [];
    const BATCH_SIZE = 500;

    // Process rows (skip header)
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(delimiter).map(v => v.trim());
        
        const vauner_sku = values[referenciaVaunerIdx];
        const modeloString = values[modeloIdx];
        
        if (!vauner_sku || !modeloString) {
          console.warn(`⚠️ Row ${i}: Missing SKU or MODELO, skipping`);
          errors++;
          continue;
        }

        // Parse MODELO column
        const { marca, modelo, año_desde, año_hasta } = parseModelo(modeloString);

        // Build compatibility record
        const record = {
          vauner_sku,
          marca,
          modelo,
          año_desde,
          año_hasta,
          referencia_oem: referenciaOemIdx !== -1 ? (values[referenciaOemIdx] || null) : null,
          referencia_alkar: referenciaAlkarIdx !== -1 ? (values[referenciaAlkarIdx] || null) : null,
          referencia_jumasa: referenciaJumasaIdx !== -1 ? (values[referenciaJumasaIdx] || null) : null,
          referencia_geimex: referenciaGeimexIdx !== -1 ? (values[referenciaGeimexIdx] || null) : null,
        };

        batch.push(record);

        // Insert batch when full
        if (batch.length >= BATCH_SIZE) {
          console.log(`💾 Inserting batch of ${batch.length} records...`);
          
          const { error } = await supabase
            .from('vehicle_compatibility')
            .upsert(batch, { 
              onConflict: 'vauner_sku,marca,modelo,año_desde,año_hasta',
              ignoreDuplicates: false 
            });

          if (error) {
            console.error('Batch insert error:', error);
            errors += batch.length;
          } else {
            inserted += batch.length;
          }

          batch.length = 0; // Clear batch
        }
      } catch (error) {
        console.error(`Error processing row ${i}:`, error);
        errors++;
      }
    }

    // Insert remaining records
    if (batch.length > 0) {
      console.log(`💾 Inserting final batch of ${batch.length} records...`);
      
      const { error } = await supabase
        .from('vehicle_compatibility')
        .upsert(batch, { 
          onConflict: 'vauner_sku,marca,modelo,año_desde,año_hasta',
          ignoreDuplicates: false 
        });

      if (error) {
        console.error('Final batch insert error:', error);
        errors += batch.length;
      } else {
        inserted += batch.length;
      }
    }

    const stats = { inserted, updated, errors };
    console.log(`✅ Import complete:`, stats);

    return new Response(JSON.stringify(stats), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Import error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
