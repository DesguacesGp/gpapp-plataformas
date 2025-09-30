import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
  'PUNHO': 'Maneta',
  'VW': 'Volkswagen',
  'C/C': 'Manual',
  'P/P': 'Para pintar'
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

    const { productIds, queueId } = await req.json()
    console.log(`Processing batch - ProductIds: ${productIds?.length}, QueueId: ${queueId}`)
    
    // If queueId provided, update queue status to processing
    if (queueId) {
      await supabaseClient
        .from('processing_queue')
        .update({ 
          status: 'processing',
          started_at: new Date().toISOString()
        })
        .eq('id', queueId)
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured')
    }
    console.log('Lovable AI API Key configured:', LOVABLE_API_KEY ? 'Yes (length: ' + LOVABLE_API_KEY.length + ')' : 'No')

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

        // Retry logic for rate limits
        let aiResponse
        let retries = 0
        const maxRetries = 3
        
        while (retries <= maxRetries) {
          // Call Lovable AI Gateway with Gemini model to process the product
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
                content: `Eres un experto en traducción de productos de automoción del portugués al español y en generación de títulos SEO optimizados para Amazon y eBay.

IMPORTANTE: Las piezas son AFTERMARKET OEM EQUIVALENTE, NO son originales de fábrica. Debes ser honesto y usar términos como "Compatible OEM", "Calidad OEM", "OEM Equivalente", "Aftermarket Premium", pero NUNCA "Original" o "Original de fábrica".

INFORMACIÓN CLAVE SOBRE LATERALIDAD:
- Cuando el producto es "Derecho" = Lado COPILOTO
- Cuando el producto es "Izquierdo" = Lado CONDUCTOR
- Esta información es CRÍTICA y debe aparecer tanto en el título como en los bullet points para ayudar al cliente a elegir la pieza correcta

INFORMACIÓN SOBRE PLEGABILIDAD DE RETROVISORES:
- SOLO los retrovisores con "REB" (Abatible) son PLEGABLES ELECTRÓNICAMENTE
- Los retrovisores SIN "REB" son PLEGABLES MANUALMENTE
- P/P significa "Para pintar" y NO tiene relación con plegabilidad

INFORMACIÓN ESPECÍFICA PARA PILOTOS/ILUMINACIÓN:
- TODOS los pilotos de la categoría "iluminacion" son SIN PORTALAMPARAS
- DEBES incluir "Sin Portalamparas" tanto en el título como en uno de los bullet points
- Esto es CRÍTICO para que el cliente sepa que debe usar las lámparas de su vehículo original

Tu tarea es:
1. Traducir la descripción del producto del portugués al español (ya tiene algunas traducciones aplicadas).

2. Generar un título SEO LARGO Y DESCRIPTIVO (MÍNIMO 150 caracteres, óptimo 180-200 caracteres) siguiendo estas reglas:
   - Estructura: TIPO_PIEZA + Posición_CON_LADO + MARCA + MODELO + Años_Compatibilidad + Características_Técnicas + Compatible_OEM
   - El patrón "AÑO-*" significa "desde ese año en adelante"
   - DEBE incluir: tipo de pieza, posición clara (ej: "Derecho Lado Copiloto" o "Izquierdo Lado Conductor"), marca, modelo, años
   - AÑADIR keywords relevantes: "Compatible OEM", "Calidad OEM", "Alta Calidad", "Nuevo", "Aftermarket Premium", "Recambio", etc.
   - Repetir marca y modelo si es necesario para llegar a 150+ caracteres
   - Incluir características técnicas específicas (eléctrico, térmico, con sensor, etc.)
   
   Ejemplos de títulos OPTIMIZADOS:
   * "Faro Delantero Derecho Lado Copiloto Ford Focus desde 2004 - Recambio Alta Calidad Compatible OEM - Faro Eléctrico Nuevo Aftermarket Premium Ford Focus 04+"
   * "Piloto Lateral Izquierdo Lado Conductor Blanco Renault Modus desde 2004 - Luz Lateral Compatible OEM Renault Modus 2004+ Alta Calidad Nuevo Recambio"
   * "Maneta Exterior Derecha Lado Copiloto Mercedes Clase E W213 desde 2020 - Maneta Puerta Aftermarket Mercedes Benz E W213 2020+ Compatible OEM Nueva"

3. Generar exactamente 5 bullet points optimizados para Amazon/eBay:
   - Cada bullet debe tener entre 150-200 caracteres
   - Primera letra en mayúscula, sin punto final
   - Incluir keywords naturalmente repetidas
   - SIEMPRE mencionar el lado cuando aplique: "Derecho (Lado Copiloto)" o "Izquierdo (Lado Conductor)"
   - Destacar compatibilidad OEM, calidad equivalente, características técnicas, facilidad de instalación
   - Usar emojis sutiles si es apropiado (✓, ⭐, 🚗)
   - SER HONESTO: mencionar que es aftermarket/compatible OEM, no original
   
   Ejemplo de bullet points:
   * "✓ Compatible Ford Focus desde 2004+ - Pieza DERECHA para lado COPILOTO - Recambio aftermarket calidad OEM equivalente que garantiza ajuste perfecto y funcionamiento óptimo"
   * "⭐ Faro delantero derecho lado copiloto con tecnología eléctrica avanzada - Iluminación potente y duradera para máxima seguridad y visibilidad en carretera"
   * "🚗 Instalación fácil y rápida sin modificaciones - Compatible con sistema eléctrico del vehículo, plug and play directo, no requiere herramientas especiales"
   * "✓ Fabricado con materiales de alta resistencia UV y golpes - Óptica de policarbonato resistente y carcasa duradera que soporta condiciones climáticas extremas"
   * "⭐ Calidad OEM equivalente testada - Cumple normativas europeas homologación, aftermarket premium testado para asegurar durabilidad y rendimiento superior"

4. EXTRAER información estructurada del producto (CRÍTICO - ANALIZA CUIDADOSAMENTE):
   
   a) articulo: El TIPO DE PIEZA en español (ej: "Faro", "Piloto", "Retrovisor", "Elevalunas", "Parachoques", "Cerradura", "Paragolpes", "Aleta", "Cristal", "Maneta", etc.)
      - Debe ser un nombre genérico del tipo de pieza
      - En español, sin abreviaturas
   
   b) marca: La MARCA del vehículo (ej: "Ford", "Volkswagen", "Seat", "Renault", "Fiat", "Citroen", "Nissan", "Audi", "Mercedes", "BMW", etc.)
      - Solo el nombre de la marca, sin modelos
      - Primera letra en mayúscula
   
   c) modelo: El MODELO específico del vehículo (ej: "Focus", "Golf", "Leon", "Modus", "Ducato", "Micra", "A6", "Clase E", etc.)
      - Solo el nombre del modelo
      - Sin años ni generaciones
   
   d) año_desde: El año de inicio extraído de la descripción (formato: YYYY)
      - Busca patrones como "97-*", "2010-*", "05-", "desde 2004", etc. en la descripción o SKU
      - Convierte años de 2 dígitos a 4 dígitos (97 → 1997, 05 → 2005)
      - Si es menor a 80, asume 2000s (05 → 2005), si es 80 o mayor asume 1900s (97 → 1997)
      - Si encuentras rango como "2010-2015", usa el primer año (2010)

Si no puedes determinar algún campo con alta seguridad, devuelve null para ese campo.

Responde SOLO con un JSON válido en este formato exacto:
{
  "translated_title": "título SEO largo y descriptivo (150-200 caracteres)",
  "bullet_points": ["bullet 1 (150-200 chars)", "bullet 2", "bullet 3", "bullet 4", "bullet 5"],
  "articulo": "tipo de pieza o null",
  "marca": "marca del vehículo o null",
  "modelo": "modelo del vehículo o null",
  "año_desde": "YYYY o null"
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
            max_tokens: 2000,
            temperature: 0.7
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
            const waitTime = Math.pow(2, retries) * 5000 // 10s, 20s, 40s
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
        console.log(`AI Response for ${product.sku} - Tokens used:`, {
          prompt: aiData.usage?.prompt_tokens,
          completion: aiData.usage?.completion_tokens,
          reasoning: aiData.usage?.completion_tokens_details?.reasoning_tokens,
          total: aiData.usage?.total_tokens
        })
        
        const content = aiData.choices?.[0]?.message?.content

        if (!content) {
          console.error(`No content from AI for ${product.sku}. Finish reason:`, aiData.choices?.[0]?.finish_reason)
          console.error(`Full AI response:`, JSON.stringify(aiData))
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
            bullet_points: processedData.bullet_points,
            articulo: processedData.articulo || null,
            marca: processedData.marca || null,
            modelo: processedData.modelo || null,
            año_desde: processedData.año_desde || null
          })
          .eq('id', product.id)

        if (updateError) {
          console.error(`Failed to update product ${product.sku}:`, updateError)
          processedCount.failed++
        } else {
          console.log(`Successfully processed ${product.sku}`)
          processedCount.success++
        }

        // Add delay to respect rate limits (2500ms between requests)
        await new Promise(resolve => setTimeout(resolve, 2500))

      } catch (error) {
        console.error(`Error processing product ${product.sku}:`, error)
        processedCount.failed++
      }
    }

    // Update queue status and check if there are more products to process
    const { count: remainingCount } = await supabaseClient
      .from('vauner_products')
      .select('*', { count: 'exact', head: true })
      .is('translated_title', null)
    
    console.log(`Batch complete. Processed: ${processedCount.success}, Failed: ${processedCount.failed}, Remaining: ${remainingCount || 0}`)
    
    // Update current queue entry
    if (queueId) {
      await supabaseClient
        .from('processing_queue')
        .update({ 
          status: remainingCount && remainingCount > 0 ? 'completed' : 'completed',
          processed_count: processedCount.success,
          completed_at: new Date().toISOString()
        })
        .eq('id', queueId)
    }
    
    // If there are more products, create a new queue entry and trigger immediately
    if (remainingCount && remainingCount > 0) {
      console.log('More products remaining, creating new queue entry and triggering next batch...')
      
      // Get next batch of product IDs
      const { data: nextBatch } = await supabaseClient
        .from('vauner_products')
        .select('id')
        .is('translated_title', null)
        .limit(50)
      
      if (nextBatch && nextBatch.length > 0) {
        const nextProductIds = nextBatch.map(p => p.id)
        
        // Create new queue entry
        const { data: newQueue } = await supabaseClient
          .from('processing_queue')
          .insert({
            status: 'pending',
            batch_size: nextProductIds.length,
            total_count: remainingCount
          })
          .select()
          .single()
        
        // Trigger next batch immediately in background
        const triggerNextBatch = async () => {
          try {
            console.log('Triggering next batch with queue ID:', newQueue?.id)
            const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-products`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ 
                productIds: nextProductIds,
                queueId: newQueue?.id
              })
            })
            
            if (response.ok) {
              console.log('Next batch triggered successfully')
            } else {
              const errorText = await response.text()
              console.error('Failed to trigger next batch:', response.status, errorText)
              
              // Mark queue as error
              if (newQueue?.id) {
                await supabaseClient
                  .from('processing_queue')
                  .update({ 
                    status: 'error',
                    error_message: `Failed to trigger: ${response.status}`
                  })
                  .eq('id', newQueue.id)
              }
            }
          } catch (error) {
            console.error('Error triggering next batch:', error)
            
            // Mark queue as error
            if (newQueue?.id) {
              await supabaseClient
                .from('processing_queue')
                .update({ 
                  status: 'error',
                  error_message: error instanceof Error ? error.message : 'Unknown error'
                })
                .eq('id', newQueue.id)
            }
          }
        }
        
        // Trigger in background without awaiting
        triggerNextBatch()
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Procesados ${processedCount.success} productos correctamente, ${processedCount.failed} fallidos. ${remainingCount || 0} pendientes.`,
        processed: processedCount.success,
        failed: processedCount.failed,
        remaining: remainingCount || 0
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