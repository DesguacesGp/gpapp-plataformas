import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Normalize brand/model names for better matching
function normalize(text: string): string {
  if (!text) return ''
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') // Remove all non-alphanumeric
    .trim()
}

// Calculate año_hasta based on the next generation
function calculateYearRange(
  currentYear: string,
  nextYear: string | null
): { año_desde: string; año_hasta: string } {
  // Parse current year (format: YYYY.MM)
  const [year, month] = currentYear.split('.').map(Number)
  
  if (!nextYear) {
    // No next generation, use current date as hasta
    const now = new Date()
    return {
      año_desde: currentYear,
      año_hasta: `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}`
    }
  }
  
  // Parse next year and subtract one month
  const [nextYearNum, nextMonthNum] = nextYear.split('.').map(Number)
  let hastaYear = nextYearNum
  let hastaMonth = nextMonthNum - 1
  
  if (hastaMonth === 0) {
    hastaMonth = 12
    hastaYear -= 1
  }
  
  return {
    año_desde: currentYear,
    año_hasta: `${hastaYear}.${String(hastaMonth).padStart(2, '0')}`
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const { productIds } = await req.json()
    
    // Get products that need year matching
    let query = supabaseClient
      .from('vauner_products')
      .select('id, marca, modelo')
      .not('marca', 'is', null)
      .not('modelo', 'is', null)

    if (productIds && productIds.length > 0) {
      query = query.in('id', productIds)
    }

    const { data: products, error: productsError } = await query

    if (productsError) throw productsError
    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No products to match', matched: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Matching years for ${products.length} products`)

    // Get all vehicle models
    const { data: models, error: modelsError } = await supabaseClient
      .from('vehicle_models')
      .select('*')
      .order('marca')
      .order('gama')
      .order('año_desde')

    if (modelsError) throw modelsError

    // Group models by marca and gama for easier lookup
    const modelsByMarcaGama = new Map<string, any[]>()
    
    for (const model of models || []) {
      const key = `${normalize(model.marca)}|${normalize(model.gama)}`
      if (!modelsByMarcaGama.has(key)) {
        modelsByMarcaGama.set(key, [])
      }
      modelsByMarcaGama.get(key)!.push(model)
    }

    let matched = 0
    let unmatched = 0

    // Match each product
    for (const product of products) {
      const normalizedMarca = normalize(product.marca)
      const normalizedModelo = normalize(product.modelo)
      
      const key = `${normalizedMarca}|${normalizedModelo}`
      const matchingModels = modelsByMarcaGama.get(key)
      
      if (!matchingModels || matchingModels.length === 0) {
        console.log(`No match found for ${product.marca} ${product.modelo}`)
        unmatched++
        continue
      }

      // Sort by año_desde to get chronological order
      matchingModels.sort((a, b) => a.año_desde.localeCompare(b.año_desde))

      // If there's only one generation, use it
      // If there are multiple, use the first (oldest) generation
      const firstGeneration = matchingModels[0]
      const secondGeneration = matchingModels[1] || null

      const { año_desde, año_hasta } = calculateYearRange(
        firstGeneration.año_desde,
        secondGeneration?.año_desde || null
      )

      // Update the product
      const { error: updateError } = await supabaseClient
        .from('vauner_products')
        .update({ año_desde, año_hasta })
        .eq('id', product.id)

      if (updateError) {
        console.error(`Error updating product ${product.id}:`, updateError)
      } else {
        matched++
        console.log(`Matched ${product.marca} ${product.modelo}: ${año_desde} - ${año_hasta}`)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Matched ${matched} products, ${unmatched} unmatched`,
        matched,
        unmatched,
        total: products.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in match-vehicle-years:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
