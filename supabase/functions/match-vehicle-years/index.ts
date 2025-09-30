import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Extract year from Vauner description (e.g., "AUDI A1 10-*" -> "2010")
function extractYearFromDescription(description: string): string | null {
  if (!description) return null
  
  // Match patterns like "10-*", "10-15", "2010-*", "2010-2015"
  const yearMatch = description.match(/\b(\d{2,4})-/i)
  if (!yearMatch) return null
  
  let year = yearMatch[1]
  
  // Convert 2-digit year to 4-digit (assume 19xx for 80-99, 20xx for 00-79)
  if (year.length === 2) {
    const num = parseInt(year)
    year = num >= 80 ? `19${year}` : `20${year}`
  }
  
  return year
}

// Normalize brand name for matching
function normalizeBrand(brand: string): string {
  if (!brand) return ''
  return brand.toUpperCase().trim()
}

// Normalize model name for matching
function normalizeModel(model: string): string {
  if (!model) return ''
  return model.toUpperCase().trim()
}

// Calculate año_hasta based on next generation
function calculateYearRange(
  productYear: string,
  generations: any[]
): { año_desde: string; año_hasta: string | null } {
  // Find the generation that matches the product's year
  const productYearNum = parseInt(productYear)
  
  // Find closest generation that starts at or before product year
  let matchingGenIndex = -1
  let closestDiff = Infinity
  
  for (let i = 0; i < generations.length; i++) {
    const genYear = parseInt(generations[i].año_desde.split('.')[0])
    const diff = productYearNum - genYear
    
    // We want the generation that starts at or just before the product year
    if (diff >= 0 && diff < closestDiff) {
      closestDiff = diff
      matchingGenIndex = i
    }
  }
  
  if (matchingGenIndex === -1) {
    // No suitable generation found
    return { año_desde: productYear, año_hasta: null }
  }
  
  const matchingGen = generations[matchingGenIndex]
  const nextGen = generations[matchingGenIndex + 1]
  
  if (!nextGen) {
    // No next generation, leave año_hasta empty
    return {
      año_desde: productYear,
      año_hasta: null
    }
  }
  
  // Calculate año_hasta: one month before next generation
  const [nextYear, nextMonth] = nextGen.año_desde.split('.').map(Number)
  let hastaYear = nextYear
  let hastaMonth = nextMonth - 1
  
  if (hastaMonth === 0) {
    hastaMonth = 12
    hastaYear -= 1
  }
  
  return {
    año_desde: productYear,
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
    
    // Get brand equivalences
    const { data: brandEquivalences, error: brandEqError } = await supabaseClient
      .from('brand_equivalences')
      .select('vauner_brand, reference_brand')
      .eq('is_active', true)

    if (brandEqError) throw brandEqError

    // Create brand mapping
    const brandMap = new Map<string, string>()
    for (const eq of brandEquivalences || []) {
      brandMap.set(normalizeBrand(eq.vauner_brand), eq.reference_brand)
    }

    console.log(`Loaded ${brandMap.size} brand equivalences`)
    
    // Get products that need year matching
    let query = supabaseClient
      .from('vauner_products')
      .select('id, marca, modelo, description, sku')
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

    // Group models by marca and gama
    const modelsByMarcaGama = new Map<string, any[]>()
    
    for (const model of models || []) {
      const key = `${model.marca}|${normalizeModel(model.gama)}`
      if (!modelsByMarcaGama.has(key)) {
        modelsByMarcaGama.set(key, [])
      }
      modelsByMarcaGama.get(key)!.push(model)
    }

    let matched = 0
    let unmatched = 0
    let noYear = 0

    // Match each product
    for (const product of products) {
      try {
        // Step 1: Extract year from description
        const productYear = extractYearFromDescription(product.description || product.sku || '')
        
        if (!productYear) {
          console.log(`No year found in description for ${product.sku}`)
          noYear++
          continue
        }

        // Step 2: Normalize and map brand
        const normalizedVaunerBrand = normalizeBrand(product.marca)
        const referenceBrand = brandMap.get(normalizedVaunerBrand)
        
        if (!referenceBrand) {
          console.log(`No brand equivalence for: ${product.marca}`)
          unmatched++
          continue
        }

        // Step 3: Normalize model
        const normalizedModelo = normalizeModel(product.modelo)
        
        // Step 4: Find matching generations
        const key = `${referenceBrand}|${normalizedModelo}`
        const matchingGenerations = modelsByMarcaGama.get(key)
        
        if (!matchingGenerations || matchingGenerations.length === 0) {
          console.log(`No model match for ${referenceBrand} ${normalizedModelo}`)
          unmatched++
          continue
        }

        // Sort generations chronologically
        matchingGenerations.sort((a, b) => a.año_desde.localeCompare(b.año_desde))

        // Step 5: Calculate year range
        const { año_desde, año_hasta } = calculateYearRange(productYear, matchingGenerations)

        // Step 6: Update product
        const updateData: any = { año_desde }
        if (año_hasta) {
          updateData.año_hasta = año_hasta
        }

        const { error: updateError } = await supabaseClient
          .from('vauner_products')
          .update(updateData)
          .eq('id', product.id)

        if (updateError) {
          console.error(`Error updating product ${product.id}:`, updateError)
        } else {
          matched++
          console.log(`✓ ${product.sku}: ${año_desde}${año_hasta ? ` - ${año_hasta}` : ' (sin siguiente generación)'}`)
        }
      } catch (error) {
        console.error(`Error processing product ${product.id}:`, error)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Matched ${matched} products. No year: ${noYear}, No match: ${unmatched}`,
        matched,
        unmatched,
        noYear,
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
