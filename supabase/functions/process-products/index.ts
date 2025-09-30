import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DICTIONARY = {
  'DRT': 'Derecho',
  'ESQ': 'Izquierdo',
  'ELECT': 'Eléctrico',
  'LAT': 'Lateral',
  'TERM': 'Térmico',
  'ESP': 'Retrovisor',
  'L/V': 'Elevalunas',
  'FRT': 'Delantero',
  'COMANDO': 'Mando',
  'TRAS': 'Trasero',
  'P/CH': 'Parachoques',
  'G/LAMAS': 'Aleta',
  'V/ESP': 'Cristal Retrovisor',
  'SUP': 'Superior',
  'C/FURO': 'Con antiniebla',
  'S/FURO': 'Sin antiniebla',
  'S/LAMPADA': 'Sin bombilla',
  'ELECTROV.': 'Electroventilador',
  'ELETROV.C/AC': 'Electroventilador con aire ac',
  'INF': 'Inferior',
  'CEN': 'Central',
  'C/LV FAR': 'Con lavafaros',
  'FUMADO': 'Ahumado',
  '*CAPA': 'Carcasa',
  'CONV': 'Convexo',
  'ASF': 'Asférico',
  'REB': 'Abatible',
  'C/CONF': 'Confort',
  'FAROLIM': 'Piloto',
  'VW': 'Volkswagen'
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

    const { productIds } = await req.json()
    console.log(`Processing ${productIds.length} products`)

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured')
    }

    // Get products to process
    const { data: products, error: fetchError } = await supabaseClient
      .from('vauner_products')
      .select('*')
      .in('id', productIds)

    if (fetchError) throw fetchError

    const processedCount = { success: 0, failed: 0 }

    // Process products one by one to avoid rate limits
    for (const product of products) {
      try {
        console.log(`Processing product: ${product.sku}`)
        
        // Apply dictionary replacements
        let translatedDesc = product.description
        
        // First, handle entries with special characters that need exact matching
        const specialCharsEntries = Object.entries(DICTIONARY).filter(([key]) => /[\/\*\.]/.test(key))
        const normalEntries = Object.entries(DICTIONARY).filter(([key]) => !/[\/\*\.]/.test(key))
        
        // Apply special character replacements first (without word boundaries)
        for (const [key, value] of specialCharsEntries) {
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const regex = new RegExp(escapedKey, 'gi')
          translatedDesc = translatedDesc.replace(regex, value)
        }
        
        // Then apply normal replacements with word boundaries
        for (const [key, value] of normalEntries) {
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const regex = new RegExp(`\\b${escapedKey}\\b`, 'gi')
          translatedDesc = translatedDesc.replace(regex, value)
        }

        // Call AI to process the product
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
                content: `Eres un experto en traducción de productos de automoción del portugués al español y en generación de títulos SEO optimizados para Amazon y eBay.

IMPORTANTE: Las piezas son AFTERMARKET OEM EQUIVALENTE, NO son originales de fábrica. Debes ser honesto y usar términos como "Compatible OEM", "Calidad OEM", "OEM Equivalente", "Aftermarket Premium", pero NUNCA "Original" o "Original de fábrica".

Tu tarea es:
1. Traducir la descripción del producto del portugués al español (ya tiene algunas traducciones aplicadas).

2. Generar un título SEO LARGO Y DESCRIPTIVO (MÍNIMO 150 caracteres, óptimo 180-200 caracteres) siguiendo estas reglas:
   - Estructura: TIPO_PIEZA + Posición + MARCA + MODELO + Años_Compatibilidad + Características_Técnicas + Compatible_OEM
   - El patrón "AÑO-*" significa "desde ese año en adelante"
   - DEBE incluir: tipo de pieza, posición (derecho/izquierdo/delantero/trasero), marca, modelo, años de compatibilidad
   - AÑADIR keywords relevantes: "Compatible OEM", "Calidad OEM", "Alta Calidad", "Nuevo", "Aftermarket Premium", "Recambio", etc.
   - Repetir marca y modelo si es necesario para llegar a 150+ caracteres
   - Incluir características técnicas específicas (eléctrico, térmico, con sensor, etc.)
   
   Ejemplos de títulos OPTIMIZADOS:
   * "Faro Delantero Derecho para Ford Focus desde 2004 - Recambio de Alta Calidad Compatible OEM - Faro Eléctrico Nuevo Aftermarket Premium Ford Focus 04 en Adelante"
   * "Piloto Lateral Izquierdo Blanco Renault Modus desde 2004 - Luz Lateral Izquierda Compatible OEM Renault Modus 2004+ Alta Calidad Nuevo Recambio Calidad OEM"
   * "Piloto Trasero Izquierdo Mercedes Clase E W213 desde Marzo 2020 - Luz Trasera Izquierda Aftermarket Mercedes Benz E W213 2020+ Recambio Nuevo Compatible OEM Alta Calidad"

3. Generar exactamente 5 bullet points optimizados para Amazon/eBay:
   - Cada bullet debe tener entre 150-200 caracteres
   - Primera letra en mayúscula, sin punto final
   - Incluir keywords naturalmente repetidas
   - Destacar compatibilidad OEM, calidad equivalente, características técnicas, facilidad de instalación
   - Usar emojis sutiles si es apropiado (✓, ⭐, 🚗)
   - SER HONESTO: mencionar que es aftermarket/compatible OEM, no original
   
   Ejemplo de bullet points:
   * "✓ Compatible con Ford Focus desde 2004 en adelante - Recambio aftermarket de alta calidad OEM equivalente que garantiza un ajuste perfecto y funcionamiento óptimo como el original"
   * "⭐ Faro delantero derecho nuevo con tecnología eléctrica avanzada - Iluminación potente y duradera para máxima seguridad y visibilidad en carretera bajo cualquier condición"
   * "🚗 Instalación fácil y rápida sin modificaciones - Compatible con sistema eléctrico del vehículo, plug and play directo, no requiere herramientas especiales para montaje"
   * "✓ Fabricado con materiales de alta resistencia UV y golpes - Óptica de policarbonato resistente y carcasa duradera que soporta condiciones climáticas extremas sin deterioro"
   * "⭐ Calidad OEM equivalente testada - Cumple con normativas europeas de homologación, aftermarket premium testado para asegurar durabilidad y rendimiento superior durante años"

Responde SOLO con un JSON válido en este formato exacto:
{
  "translated_title": "título SEO largo y descriptivo (150-200 caracteres)",
  "bullet_points": ["bullet 1 (150-200 chars)", "bullet 2", "bullet 3", "bullet 4", "bullet 5"]
}

NO agregues texto adicional, SOLO el JSON.`
              },
              {
                role: 'user',
                content: `Procesa este producto:
SKU: ${product.sku}
Descripción: ${translatedDesc}
Categoría: ${product.category}
Precio: ${product.price}€
Stock: ${product.stock}`
              }
            ],
            temperature: 0.7,
            max_tokens: 1000
          }),
        })

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text()
          console.error(`AI API error for ${product.sku}:`, aiResponse.status, errorText)
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
        let processedData
        try {
          // Remove markdown code blocks if present
          const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          processedData = JSON.parse(cleanedContent)
        } catch (parseError) {
          console.error(`Failed to parse AI response for ${product.sku}:`, content)
          processedCount.failed++
          continue
        }

        // Update product with processed data
        const { error: updateError } = await supabaseClient
          .from('vauner_products')
          .update({
            translated_title: processedData.translated_title,
            bullet_points: processedData.bullet_points
          })
          .eq('id', product.id)

        if (updateError) {
          console.error(`Failed to update product ${product.sku}:`, updateError)
          processedCount.failed++
        } else {
          console.log(`Successfully processed ${product.sku}`)
          processedCount.success++
        }

        // Add delay to respect rate limits (100ms between requests)
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (error) {
        console.error(`Error processing product ${product.sku}:`, error)
        processedCount.failed++
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Procesados ${processedCount.success} productos correctamente, ${processedCount.failed} fallidos`,
        processed: processedCount.success,
        failed: processedCount.failed
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in process-products:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})