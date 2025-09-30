import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Normalize text for comparison
function normalize(text: string): string {
  if (!text) return ''
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim()
}

// Calculate similarity between two strings (simple approach)
function similarity(a: string, b: string): number {
  const normA = normalize(a)
  const normB = normalize(b)
  
  if (normA === normB) return 1.0
  
  // Check if one contains the other
  if (normA.includes(normB) || normB.includes(normA)) return 0.8
  
  // Simple character overlap check
  const setA = new Set(normA.split(''))
  const setB = new Set(normB.split(''))
  const intersection = new Set([...setA].filter(x => setB.has(x)))
  const union = new Set([...setA, ...setB])
  
  return intersection.size / union.size
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

    console.log('Starting equivalence analysis...')

    // Get unique brands from products
    const { data: products, error: productsError } = await supabaseClient
      .from('vauner_products')
      .select('marca, modelo')
      .not('marca', 'is', null)
      .not('modelo', 'is', null)

    if (productsError) throw productsError

    // Get all vehicle models
    const { data: models, error: modelsError } = await supabaseClient
      .from('vehicle_models')
      .select('marca, gama')

    if (modelsError) throw modelsError

    // Extract unique brands from both sources
    const vaunerBrands = new Set(products?.map(p => p.marca) || [])
    const referenceBrands = new Set(models?.map(m => m.marca) || [])

    let brandsAdded = 0
    let modelsAdded = 0

    // Analyze brand equivalences
    for (const vaunerBrand of vaunerBrands) {
      if (!vaunerBrand) continue

      for (const refBrand of referenceBrands) {
        if (!refBrand) continue

        const score = similarity(vaunerBrand, refBrand)
        
        if (score >= 0.7) {
          // Check if equivalence already exists
          const { data: existing } = await supabaseClient
            .from('brand_equivalences')
            .select('id')
            .eq('vauner_brand', vaunerBrand)
            .eq('reference_brand', refBrand)
            .single()

          if (!existing) {
            const confidence = score >= 0.95 ? 'high' : score >= 0.85 ? 'medium' : 'low'
            
            const { error: insertError } = await supabaseClient
              .from('brand_equivalences')
              .insert({
                vauner_brand: vaunerBrand,
                reference_brand: refBrand,
                confidence_level: confidence,
                is_active: score >= 0.95, // Auto-activate only high confidence
                created_by: 'auto',
              })

            if (!insertError) {
              brandsAdded++
              console.log(`Added brand equivalence: ${vaunerBrand} <-> ${refBrand} (${confidence})`)
            }
          }
        }
      }
    }

    // Analyze model equivalences (simplified - only for exact brand matches)
    const brandPairs = new Map<string, string>()
    
    // Get active brand equivalences
    const { data: activeEquivalences } = await supabaseClient
      .from('brand_equivalences')
      .select('vauner_brand, reference_brand')
      .eq('is_active', true)

    activeEquivalences?.forEach(eq => {
      brandPairs.set(eq.vauner_brand, eq.reference_brand)
    })

    // Group products by brand
    const productsByBrand = new Map<string, Set<string>>()
    products?.forEach(p => {
      if (!p.marca || !p.modelo) return
      if (!productsByBrand.has(p.marca)) {
        productsByBrand.set(p.marca, new Set())
      }
      productsByBrand.get(p.marca)!.add(p.modelo)
    })

    // Group models by brand
    const modelsByBrand = new Map<string, Set<string>>()
    models?.forEach(m => {
      if (!m.marca || !m.gama) return
      if (!modelsByBrand.has(m.marca)) {
        modelsByBrand.set(m.marca, new Set())
      }
      modelsByBrand.get(m.marca)!.add(m.gama)
    })

    // Match models for brands with active equivalences
    for (const [vaunerBrand, refBrand] of brandPairs.entries()) {
      const vaunerModels = productsByBrand.get(vaunerBrand) || new Set()
      const refModels = modelsByBrand.get(refBrand) || new Set()

      for (const vaunerModel of vaunerModels) {
        for (const refModel of refModels) {
          const score = similarity(vaunerModel, refModel)
          
          if (score >= 0.7) {
            // Check if equivalence already exists
            const { data: existing } = await supabaseClient
              .from('model_equivalences')
              .select('id')
              .eq('vauner_brand', vaunerBrand)
              .eq('vauner_model', vaunerModel)
              .eq('reference_brand', refBrand)
              .eq('reference_model', refModel)
              .single()

            if (!existing) {
              const confidence = score >= 0.95 ? 'high' : score >= 0.85 ? 'medium' : 'low'
              
              const { error: insertError } = await supabaseClient
                .from('model_equivalences')
                .insert({
                  vauner_brand: vaunerBrand,
                  vauner_model: vaunerModel,
                  reference_brand: refBrand,
                  reference_model: refModel,
                  confidence_level: confidence,
                  is_active: score >= 0.95,
                  created_by: 'auto',
                })

              if (!insertError) {
                modelsAdded++
                console.log(`Added model equivalence: ${vaunerBrand} ${vaunerModel} <-> ${refBrand} ${refModel} (${confidence})`)
              }
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        brands_found: brandsAdded,
        models_found: modelsAdded,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in analyze-equivalences:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
