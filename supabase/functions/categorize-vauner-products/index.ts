import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🏷️ Starting product categorization...');

    // Get all active mapping rules ordered by priority
    const { data: mappingRules, error: mappingError } = await supabase
      .from('vauner_category_mapping')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: true });

    if (mappingError) {
      throw new Error(`Error fetching mapping rules: ${mappingError.message}`);
    }

    console.log(`📋 Found ${mappingRules.length} active mapping rules`);

    // Get total count of products
    const { count: totalCount, error: countError } = await supabase
      .from('vauner_products')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw new Error(`Error counting products: ${countError.message}`);
    }

    console.log(`📊 Total products in database: ${totalCount}`);

    // Fetch all products in batches
    const batchSize = 1000;
    let allProducts: any[] = [];

    for (let offset = 0; offset < totalCount; offset += batchSize) {
      const { data: batch, error: batchError } = await supabase
        .from('vauner_products')
        .select('id, sku, category, articulo, description')
        .range(offset, offset + batchSize - 1);

      if (batchError) {
        throw new Error(`Error fetching batch at offset ${offset}: ${batchError.message}`);
      }

      allProducts = allProducts.concat(batch || []);
      console.log(`📥 Fetched batch ${Math.floor(offset / batchSize) + 1}/${Math.ceil(totalCount / batchSize)}, total loaded: ${allProducts.length}`);
    }

    console.log(`📦 Processing ${allProducts.length} products...`);

    let categorizedCount = 0;
    let uncategorizedCount = 0;
    const updates: any[] = [];

    // Process each product
    for (const product of allProducts) {
      let matched = false;

      // Try to match with mapping rules
      for (const rule of mappingRules) {
        // Check if category matches
        if (rule.original_category !== product.category) {
          continue;
        }

        // Check articulo pattern if exists
        if (rule.articulo_pattern) {
          const articuloPattern = rule.articulo_pattern.replace(/%/g, '.*');
          const articuloRegex = new RegExp(articuloPattern, 'i');
          
          if (!product.articulo || !articuloRegex.test(product.articulo)) {
            continue;
          }
        }

        // Check description pattern if exists
        if (rule.description_pattern) {
          const descriptionPattern = rule.description_pattern.replace(/%/g, '.*');
          const descriptionRegex = new RegExp(descriptionPattern, 'i');
          
          if (!product.description || !descriptionRegex.test(product.description)) {
            continue;
          }
        }

        // Match found!
        updates.push({
          id: product.id,
          categoria: rule.nueva_categoria,
          subcategoria: rule.nueva_subcategoria
        });

        categorizedCount++;
        matched = true;
        break; // Stop at first match (highest priority)
      }

      if (!matched) {
        // Mark as uncategorized
        updates.push({
          id: product.id,
          categoria: 'Sin clasificar',
          subcategoria: 'Sin clasificar'
        });
        uncategorizedCount++;
      }
    }

    // Batch update products
    console.log(`💾 Updating ${updates.length} products in batches...`);
    const batchSize = 500;
    
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      
      for (const update of batch) {
        const { error: updateError } = await supabase
          .from('vauner_products')
          .update({
            categoria: update.categoria,
            subcategoria: update.subcategoria
          })
          .eq('id', update.id);

        if (updateError) {
          console.error(`Error updating product ${update.id}:`, updateError);
        }
      }
      
      console.log(`✅ Updated batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(updates.length / batchSize)}`);
    }

    const stats = {
      total: allProducts.length,
      categorized: categorizedCount,
      uncategorized: uncategorizedCount,
      success: true
    };

    console.log('✅ Categorization completed:', stats);

    return new Response(
      JSON.stringify(stats),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ Error in categorize-vauner-products:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});