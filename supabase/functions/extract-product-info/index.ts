import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured')
    }

    // Get products that have translated_title but missing articulo, marca, or modelo
    // Process in batches of 50 to manage memory
    const { data: products, error: fetchError } = await supabaseClient
      .from('vauner_products')
      .select('*')
      .not('translated_title', 'is', null)
      .or('articulo.is.null,marca.is.null,modelo.is.null')
      .limit(50)

    if (fetchError) throw fetchError

    console.log(`Extracting info from ${products.length} products`)

    const processedCount = { success: 0, failed: 0 }

    // Process products one by one to avoid rate limits
    for (const product of products) {
      try {
        console.log(`Extracting info for product: ${product.sku}`)

        // Retry logic for rate limits
        let aiResponse
        let retries = 0
        const maxRetries = 3
        
        while (retries <= maxRetries) {
          // Call AI to extract the information
          aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                {
                  role: 'system',
                  content: `Eres un experto en clasificación de productos de automoción.

Tu tarea es extraer la siguiente información de productos de automoción:

1. articulo: El TIPO DE PIEZA en español (ej: "Faro", "Piloto", "Retrovisor", "Elevalunas", "Parachoques", "Cerradura", "Paragolpes", "Aleta", "Cristal", "Maneta", etc.)
   - Debe ser un nombre genérico del tipo de pieza
   - En español, sin abreviaturas

2. marca: La MARCA del vehículo (ej: "Ford", "Volkswagen", "Seat", "Renault", "Fiat", "Citroen", "Nissan", "Audi", "Mercedes", "BMW", etc.)
   - Solo el nombre de la marca, sin modelos
   - Primera letra en mayúscula

3. modelo: El MODELO específico del vehículo (ej: "Focus", "Golf", "Leon", "Modus", "Ducato", "Micra", "A6", "Clase E", etc.)
   - Solo el nombre del modelo
   - Sin años ni generaciones

4. año_desde: El año de inicio extraído de la descripción (formato: YYYY)
   - Busca patrones como "97-*", "2010-*", "05-", etc. en la descripción
   - Convierte años de 2 dígitos a 4 dígitos (97 → 1997, 05 → 2005)
   - Si es menor a 80, asume 2000s (05 → 2005), si es 80 o mayor asume 1900s (97 → 1997)

Si no puedes determinar algún campo con seguridad, devuelve null para ese campo.

Responde SOLO con un JSON válido en este formato exacto:
{
  "articulo": "tipo de pieza o null",
  "marca": "marca del vehículo o null",
  "modelo": "modelo del vehículo o null",
  "año_desde": "YYYY o null"
}

NO agregues texto adicional, SOLO el JSON.`
                },
                {
                  role: 'user',
                  content: `Extrae la información de este producto:

Título: ${product.translated_title || ''}
Descripción: ${product.description || ''}
SKU: ${product.sku || ''}
Categoría: ${product.category || ''}`
                }
              ],
              temperature: 0.3,
              max_tokens: 200
            }),
          })

          // Handle rate limiting with exponential backoff
          if (aiResponse.status === 429) {
            retries++
            if (retries > maxRetries) {
              console.error(`Max retries reached for ${product.sku} due to rate limiting`)
              processedCount.failed++
              break
            }
            const waitTime = Math.pow(2, retries) * 3000 // 6s, 12s, 24s
            console.log(`Rate limited for ${product.sku}, waiting ${waitTime}ms before retry ${retries}/${maxRetries}`)
            await new Promise(resolve => setTimeout(resolve, waitTime))
            continue
          }

          // If success or other error, break the retry loop
          break
        }

        if (!aiResponse || !aiResponse.ok) {
          const errorText = aiResponse ? await aiResponse.text() : 'No response'
          console.error(`AI API error for ${product.sku}:`, aiResponse?.status, errorText)
          processedCount.failed++
          continue
        }

        const aiData = await aiResponse.json()
        const content = aiData.choices?.[0]?.message?.content

        if (!content) {
          console.error(`No content from AI for ${product.sku}`)
          processedCount.failed++
          continue
        }

        // Parse JSON response
        let extractedData
        try {
          // Remove markdown code blocks if present
          const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          extractedData = JSON.parse(cleanedContent)
        } catch (parseError) {
          console.error(`Failed to parse AI response for ${product.sku}:`, content)
          processedCount.failed++
          continue
        }

        // Update product with extracted data (only update non-null values)
        const updateData: any = {}
        if (extractedData.articulo && !product.articulo) updateData.articulo = extractedData.articulo
        if (extractedData.marca && !product.marca) updateData.marca = extractedData.marca
        if (extractedData.modelo && !product.modelo) updateData.modelo = extractedData.modelo
        if (extractedData.año_desde && !product.año_desde) updateData.año_desde = extractedData.año_desde

        if (Object.keys(updateData).length > 0) {
          const { error: updateError } = await supabaseClient
            .from('vauner_products')
            .update(updateData)
            .eq('id', product.id)

          if (updateError) {
            console.error(`Failed to update product ${product.sku}:`, updateError)
            processedCount.failed++
          } else {
            console.log(`Successfully extracted info for ${product.sku}:`, updateData)
            processedCount.success++
          }
        } else {
          console.log(`No new info to update for ${product.sku}`)
          processedCount.success++
        }

        // Add delay to respect rate limits (3000ms between requests)
        await new Promise(resolve => setTimeout(resolve, 3000))

      } catch (error) {
        console.error(`Error processing product ${product.sku}:`, error)
        processedCount.failed++
      }
    }

    // Check if there are more products to process
    const { count: remainingCount } = await supabaseClient
      .from('vauner_products')
      .select('*', { count: 'exact', head: true })
      .not('translated_title', 'is', null)
      .or('articulo.is.null,marca.is.null,modelo.is.null')

    const hasMore = (remainingCount || 0) > 0

    return new Response(
      JSON.stringify({
        success: true,
        message: `Extraída información de ${processedCount.success} productos correctamente, ${processedCount.failed} fallidos`,
        processed: processedCount.success,
        failed: processedCount.failed,
        remaining: remainingCount || 0,
        hasMore
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in extract-product-info:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
