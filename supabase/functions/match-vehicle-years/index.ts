import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Extract year from Vauner description (e.g., "AUDI A1 10-*" -> "2010")
function extractYearFromDescription(description: string): string | null {
  if (!description) return null
  
  // Look for patterns like "10-", "15-", etc. at the end
  const yearMatch = description.match(/\s(\d{2})-/)
  if (yearMatch) {
    const shortYear = yearMatch[1]
    // Convert to full year (10 -> 2010, 95 -> 1995)
    const fullYear = parseInt(shortYear) < 50 ? `20${shortYear}` : `19${shortYear}`
    return fullYear
  }
  
  return null
}

// Normalize text for matching (remove accents, spaces, special chars)
function normalize(text: string): string {
  if (!text) return ''
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^A-Z0-9]/g, '') // Remove all non-alphanumeric
    .trim()
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
      .select('id, marca, modelo, description')
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

    // Get brand equivalences
    const { data: brandEquivalences, error: brandError } = await supabaseClient
      .from('brand_equivalences')
      .select('vauner_brand, reference_brand')
      .eq('is_active', true)

    if (brandError) throw brandError

    // Create brand mapping
    const brandMap = new Map<string, string>()
    for (const equiv of brandEquivalences || []) {
      brandMap.set(normalize(equiv.vauner_brand), equiv.reference_brand)
    }

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
      const key = `${model.marca}|${normalize(model.gama)}`
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
      // Step 1: Extract year from description
      const productYear = extractYearFromDescription(product.description)
      
      if (!productYear) {
        console.log(`Could not extract year from description for ${product.marca} ${product.modelo}`)
        noYear++
        continue
      }

      // Step 2: Normalize brand using equivalences
      const normalizedVaunerBrand = normalize(product.marca)
      const referenceBrand = brandMap.get(normalizedVaunerBrand)
      
      if (!referenceBrand) {
        console.log(`No brand equivalence found for ${product.marca}`)
        unmatched++
        continue
      }

      // Step 3: Look for matching model
      const normalizedModelo = normalize(product.modelo)
      const key = `${referenceBrand}|${normalizedModelo}`
      const matchingModels = modelsByMarcaGama.get(key)
      
      if (!matchingModels || matchingModels.length === 0) {
        console.log(`No model match found for ${referenceBrand} ${product.modelo}`)
        unmatched++
        continue
      }

      // Step 4: Find the generation that matches the product year
      // Sort by año_desde
      matchingModels.sort((a, b) => a.año_desde.localeCompare(b.año_desde))

      let matchedGeneration = null
      let nextGeneration = null

      for (let i = 0; i < matchingModels.length; i++) {
        const gen = matchingModels[i]
        const genYear = gen.año_desde.split('.')[0]
        
        // If this generation starts in or before the product year
        if (parseInt(genYear) <= parseInt(productYear)) {
          matchedGeneration = gen
          nextGeneration = matchingModels[i + 1] || null
        } else {
          break
        }
      }

      if (!matchedGeneration) {
        console.log(`No generation match for ${product.marca} ${product.modelo} year ${productYear}`)
        unmatched++
        continue
      }

      // Step 5: Calculate año_desde and año_hasta
      const año_desde = productYear
      let año_hasta = null

      if (nextGeneration) {
        // Calculate one month before next generation
        const [nextYear, nextMonth] = nextGeneration.año_desde.split('.').map(Number)
        let hastaYear = nextYear
        let hastaMonth = nextMonth - 1
        
        if (hastaMonth === 0) {
          hastaMonth = 12
          hastaYear -= 1
        }
        
        año_hasta = `${hastaYear}.${String(hastaMonth).padStart(2, '0')}`
      }

      // Update the product
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
        console.log(`Matched ${product.marca} ${product.modelo}: ${año_desde}${año_hasta ? ` - ${año_hasta}` : ' (sin siguiente generación)'}`)
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
