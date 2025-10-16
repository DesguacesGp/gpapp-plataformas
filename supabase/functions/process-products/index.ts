import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Heartbeat interval (20 seconds for faster stalled job detection)
const HEARTBEAT_INTERVAL = 20000
let heartbeatTimer: number | null = null

// Function to update heartbeat
async function updateHeartbeat(supabaseClient: any, queueId: string) {
  try {
    await supabaseClient
      .from('processing_queue')
      .update({ last_heartbeat: new Date().toISOString() })
      .eq('id', queueId)
  } catch (error) {
    console.error('Failed to update heartbeat:', error)
  }
}

// Function to start heartbeat
function startHeartbeat(supabaseClient: any, queueId: string) {
  heartbeatTimer = setInterval(() => {
    updateHeartbeat(supabaseClient, queueId)
  }, HEARTBEAT_INTERVAL) as unknown as number
}

// Function to stop heartbeat
function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
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

    const { productIds, queueId, forceReprocess = false } = await req.json()
    console.log(`Processing batch - QueueId: ${queueId}, ForceReprocess: ${forceReprocess}`)
    
    // CRITICAL: Get SKUs with OEM references from vehicle_compatibility
    const { data: skusWithOem, error: oemError } = await supabaseClient
      .from('vehicle_compatibility')
      .select('vauner_sku')
      .not('referencia_oem', 'is', null)
      .neq('referencia_oem', '')

    if (oemError) {
      console.error('Error fetching SKUs with OEM:', oemError)
      throw oemError
    }

    const oemSkuList = [...new Set(skusWithOem?.map(x => x.vauner_sku) || [])]
    console.log(`📋 Found ${oemSkuList.length} unique SKUs with OEM in compatibility table`)

    // Get next batch of products FROM CATALOG (vauner_products) filtered by OEM
    let productsToProcess = productIds
    let currentQueue = null
    let offset = 0
    
    if (!productsToProcess && queueId) {
      // CRITICAL: Get the full current queue to read processed_count (offset)
      const { data: queue } = await supabaseClient
        .from('processing_queue')
        .select('*')
        .eq('id', queueId)
        .single()
      
      currentQueue = queue
      offset = currentQueue?.processed_count || 0
      console.log(`📍 Continuing from queue ${queueId} with offset: ${offset} products already processed`)
      
      // Build query: select from catalog using id ordering and offset
      // CRITICAL: Order ONLY by id to ensure consistent pagination
      let query = supabaseClient
        .from('vauner_products')
        .select('id')
        .in('sku', oemSkuList)
        .order('id', { ascending: true })
      
      // If NOT force reprocess, filter only products without translated_title
      if (!forceReprocess) {
        query = query.is('translated_title', null)
      }
      
      // Apply offset and limit using range
      const batchSize = 25
      query = query.range(offset, offset + batchSize - 1)
      
      const { data: nextBatch } = await query
      
      productsToProcess = nextBatch?.map(p => p.id) || []
      console.log(`📦 Processing batch of ${productsToProcess.length} products from catalog with OEM (offset: ${offset})`)
      if (forceReprocess) {
        console.log(`🔄 FORCE REPROCESS MODE - Will update all ${oemSkuList.length} catalog products with OEM`)
      }
    }
    
    // If queueId provided, update queue status to processing and start heartbeat
    if (queueId) {
      await supabaseClient
        .from('processing_queue')
        .update({ 
          status: 'processing',
          started_at: new Date().toISOString(),
          last_heartbeat: new Date().toISOString(),
          batch_size: productsToProcess?.length || 0
        })
        .eq('id', queueId)
      
      // Start heartbeat timer
      startHeartbeat(supabaseClient, queueId)
    }

    // Return immediate response
    const response = new Response(
      JSON.stringify({
        success: true,
        message: `Procesamiento iniciado en segundo plano. Se están reprocesando ${productsToProcess?.length || 0} productos con OEM.`,
        batch_size: productsToProcess?.length || 0,
        queue_id: queueId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

    // Define the background processing function
    const processInBackground = async () => {
      try {
        const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
        if (!OPENAI_API_KEY) {
          throw new Error('OPENAI_API_KEY not configured in Supabase secrets')
        }
        console.log('OpenAI API Key configured:', OPENAI_API_KEY ? 'Yes (length: ' + OPENAI_API_KEY.length + ')' : 'No')

        // Get products to process
        const { data: products, error: fetchError } = await supabaseClient
          .from('vauner_products')
          .select('*')
          .in('id', productsToProcess)

        if (fetchError) throw fetchError

        // Load vehicle compatibility data from CSV
        const { data: compatibilityData } = await supabaseClient
          .from('vehicle_compatibility')
          .select('*')
          .in('vauner_sku', products?.map(p => p.sku) || [])

        // Create a map for quick lookup
        const compatibilityMap = new Map()
        compatibilityData?.forEach(compat => {
          if (!compatibilityMap.has(compat.vauner_sku)) {
            compatibilityMap.set(compat.vauner_sku, [])
          }
          compatibilityMap.get(compat.vauner_sku).push(compat)
        })

        console.log(`Loaded compatibility data for ${compatibilityMap.size} products`)

        const processedCount = { success: 0, failed: 0 }

        // Process products one by one to avoid rate limits
        for (const product of products) {
          try {
            console.log(`Processing product: ${product.sku}`)

            // Get compatibility info for this product
            const productCompatibility = compatibilityMap.get(product.sku) || []

            // Prepare compatibility information for prompt
            let compatibilityPrompt = ''
            if (productCompatibility.length > 0) {
              // Sort by created_at to identify principal model (first one)
              const sortedCompat = [...productCompatibility].sort((a, b) => 
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              )
              
              const principalModel = sortedCompat[0]
              const secondaryModels = sortedCompat.slice(1)
              
              // Format all models with years for title
              const allModelsForTitle = sortedCompat.map(c => 
                c.año_hasta 
                  ? `${c.modelo} (${c.año_desde}-${c.año_hasta})`
                  : `${c.modelo} (${c.año_desde})`
              ).join(' y ')
              
              // Get unique OEM references
              const allOemRefs = [...new Set(
                sortedCompat.map(c => c.referencia_oem).filter(Boolean)
              )].join(', ')
              
              // Get unique equivalent references
              const equivalentRefs = []
              const alkarRefs = [...new Set(sortedCompat.map(c => c.referencia_alkar).filter(Boolean))]
              const jumasaRefs = [...new Set(sortedCompat.map(c => c.referencia_jumasa).filter(Boolean))]
              const geimexRefs = [...new Set(sortedCompat.map(c => c.referencia_geimex).filter(Boolean))]
              
              if (alkarRefs.length > 0) equivalentRefs.push(...alkarRefs.map(r => `ALKAR ${r}`))
              if (jumasaRefs.length > 0) equivalentRefs.push(...jumasaRefs.map(r => `JUMASA ${r}`))
              if (geimexRefs.length > 0) equivalentRefs.push(...geimexRefs.map(r => `GEIMEX ${r}`))
              
              const allEquivalentRefs = equivalentRefs.join(', ')
              
              compatibilityPrompt = `

DATOS DE COMPATIBILIDAD DESDE CSV (FUENTE DE VERDAD):
- Marca del vehículo: ${principalModel.marca}
- Modelo PRINCIPAL: ${principalModel.modelo} (${principalModel.año_desde}${principalModel.año_hasta ? `-${principalModel.año_hasta}` : ''})
${secondaryModels.length > 0 ? `- Modelos SECUNDARIOS: ${secondaryModels.map(m => m.año_hasta ? `${m.modelo} (${m.año_desde}-${m.año_hasta})` : `${m.modelo} (${m.año_desde})`).join(', ')}` : ''}
- Referencias OEM: ${allOemRefs || 'No disponibles'}
- Referencias equivalentes: ${allEquivalentRefs || 'No disponibles'}

INSTRUCCIONES CRÍTICAS PARA USAR ESTOS DATOS:

1. TÍTULO:
   - DEBES mencionar el modelo principal: "${principalModel.modelo}"
   - Si hay modelos secundarios, DEBES incluirlos también en el título con sus años específicos
   - Formato sugerido: "para ${principalModel.marca} ${allModelsForTitle}"
   - Ejemplo: "Piloto Trasero Derecho para Skoda Octavia (2004-2008) y Octavia 4P/Combi (2008-2013)"

2. TERCER BULLET POINT (compatibilidad):
   - DEBE mencionar TODOS los modelos con sus años: ${allModelsForTitle}
   - DEBE incluir las referencias OEM si existen: ${allOemRefs}
   - DEBE incluir las referencias equivalentes si existen: ${allEquivalentRefs}
   - Formato sugerido: "🚗 Compatible con ${allModelsForTitle} - Referencias OEM: ${allOemRefs} - Equivalentes: ${allEquivalentRefs} - Instalación directa"

3. CAMPOS ESTRUCTURADOS:
   - marca: "${principalModel.marca}"
   - modelo: "${principalModel.modelo}"
   - Los campos año_desde y año_hasta NO los generes (ya se actualizarán automáticamente desde el CSV)
`
            }
            
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
              // Call OpenAI API with gpt-4o-mini model to process the product
              aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${OPENAI_API_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'gpt-4o-mini',
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
   - Estructura: TIPO_PIEZA + Posición_CON_LADO + "para" + MARCA + MODELO_PRINCIPAL + AÑOS + [MODELOS_SECUNDARIOS] + Características_Técnicas + Referencias_OEM
   - CRÍTICO: Si hay un modelo PRINCIPAL (el primero de la lista), ponlo al inicio después de la marca
   - CRÍTICO: Si hay modelos SECUNDARIOS (2º, 3º, etc.), añádelos después del modelo principal separados por coma: "Ford Focus (2010-2015), C-Max (2012), Kuga (2013-2016)"
   - CRÍTICO: Si hay referencia OEM en los datos de compatibilidad CSV, incluir al final: "Ref OEM: 1234567890"
   - CRÍTICO: SIEMPRE usar "para" entre el artículo y la marca (ej: "Faro para Ford", "Piloto para Volkswagen")
   - CRÍTICO PARA PILOTOS: TODOS los pilotos DEBEN incluir "Sin Portalamparas" en el título
   - El patrón "AÑO-*" significa "desde ese año en adelante"
   - DEBE incluir: tipo de pieza, posición clara (ej: "Derecho Lado Copiloto" o "Izquierdo Lado Conductor"), marca, modelo principal con años, modelos secundarios con años
   - AÑADIR keywords relevantes: "Compatible OEM", "Calidad OEM", "Alta Calidad", "Nuevo", "Aftermarket Premium", "Recambio", etc.
   - Incluir características técnicas específicas (eléctrico, térmico, con sensor, etc.)
   
   Ejemplos de títulos OPTIMIZADOS:
   * "Faro Delantero Derecho Lado Copiloto para Ford Focus (2004-2008), C-Max (2003-2007) - Ref OEM: 1234567 - Recambio Alta Calidad Compatible OEM Faro Eléctrico Nuevo Aftermarket Premium"
   * "Piloto Trasero Izquierdo Lado Conductor Sin Portalamparas para Renault Modus (2004-2012), Clio III (2005-2009) - Ref OEM: 8200000000 - Luz Trasera Compatible OEM Alta Calidad Nuevo Recambio"
   * "Retrovisor Derecho Lado Copiloto para Volkswagen Golf VI (2008-2013), Touran (2010-2015) - Ref OEM: 5K0857410 - Retrovisor Eléctrico Térmico Plegable Aftermarket Compatible OEM"

3. Generar exactamente 5 bullet points optimizados para Amazon/eBay:
   - Cada bullet debe tener entre 150-200 caracteres
   - Primera letra en mayúscula, sin punto final
   - Incluir keywords naturalmente repetidas
   - SIEMPRE mencionar el lado cuando aplique: "Derecho (Lado Copiloto)" o "Izquierdo (Lado Conductor)"
   - CRÍTICO: El PRIMER bullet point DEBE listar TODOS los modelos compatibles con sus años: "Compatible para Ford Focus (2004-2008), C-Max (2003-2007), Kuga (2008-2012)"
   - CRÍTICO: El SEGUNDO bullet point DEBE incluir las referencias equivalentes disponibles: "Referencias equivalentes: OEM 1234567, ALKAR 6789012, JUMASA 9876543"
   - CRÍTICO PARA PILOTOS: UNO de los bullet points DEBE mencionar explícitamente "Sin Portalamparas"
   - Destacar compatibilidad OEM, calidad equivalente, características técnicas, facilidad de instalación
   - Usar emojis sutiles si es apropiado (✓, ⭐, 🚗)
   - SER HONESTO: mencionar que es aftermarket/compatible OEM, no original
   
   Ejemplo de bullet points:
   * "✓ Compatible para Ford Focus (2004-2008), C-Max (2003-2007) y Kuga (2008-2012) - Pieza DERECHA para lado COPILOTO - Recambio aftermarket calidad OEM equivalente que garantiza ajuste perfecto"
   * "⭐ Referencias equivalentes: OEM 1234567890, ALKAR 6789012, JUMASA 9876543, GEIMEX 1357924 - Calidad testada y certificada que cumple normativas europeas de homologación"
   * "🚗 Faro delantero derecho lado copiloto con tecnología eléctrica avanzada - Iluminación potente y duradera para máxima seguridad y visibilidad en carretera"
   * "✓ Instalación fácil y rápida sin modificaciones - Compatible con sistema eléctrico del vehículo, plug and play directo, no requiere herramientas especiales"
   * "⭐ Fabricado con materiales de alta resistencia UV y golpes - Óptica de policarbonato resistante y carcasa duradera que soporta condiciones climáticas extremas"

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
Stock: ${product.stock}${compatibilityPrompt}`
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
                  console.error(`Rate limited for ${product.sku} after ${maxRetries} retries`)
                  throw new Error('Rate limit exceeded')
                }
                const waitTime = Math.pow(2, retries) * 1000
                console.log(`Rate limited. Waiting ${waitTime}ms before retry ${retries}/${maxRetries}...`)
                await new Promise(resolve => setTimeout(resolve, waitTime))
                continue
              }

              // Handle internal server errors
              if (aiResponse.status === 500) {
                const errorText = await aiResponse.text()
                console.error(`AI API error for ${product.sku}: ${aiResponse.status} ${errorText}`)
                throw new Error(`OpenAI API internal error: ${errorText}`)
              }

              // If successful, break retry loop
              if (aiResponse.ok) {
                break
              }

              // For other errors, throw immediately
              const errorText = await aiResponse.text()
              throw new Error(`OpenAI API error ${aiResponse.status}: ${errorText}`)
            }

            if (!aiResponse || !aiResponse.ok) {
              throw new Error('Failed to get valid response from AI')
            }

            const aiData = await aiResponse.json()
            
            // Log token usage for monitoring
            if (aiData.usage) {
              console.log(`AI Response for ${product.sku} - Tokens used:`, {
                prompt: aiData.usage.prompt_tokens,
                completion: aiData.usage.completion_tokens,
                reasoning: aiData.usage.completion_tokens_details?.reasoning_tokens || 0,
                total: aiData.usage.total_tokens
              })
            }

            const content = aiData.choices[0].message.content

            // Parse JSON response
            let processedData
            try {
              processedData = JSON.parse(content)
            } catch (parseError) {
              console.error(`Failed to parse AI response for ${product.sku}:`, content)
              throw new Error('Failed to parse AI response as JSON')
            }

            // Update product with processed data
            const updateData: any = {
              translated_title: processedData.translated_title,
              bullet_points: processedData.bullet_points,
              articulo: processedData.articulo || null,
              marca: processedData.marca || null,
              modelo: processedData.modelo || null
            }

            // Only update año_desde if there's NO compatibility data from CSV
            if (productCompatibility.length === 0 && processedData.año_desde) {
              updateData.año_desde = processedData.año_desde
            }

            const { error: updateError } = await supabaseClient
              .from('vauner_products')
              .update(updateData)
              .eq('id', product.id)

            if (updateError) {
              console.error(`Failed to update product ${product.sku}:`, updateError)
              processedCount.failed++
            } else {
              console.log(`Successfully processed ${product.sku}`)
              processedCount.success++
              
              // CRITICAL: Calculate absolute count (offset + products processed in this batch)
              const absoluteCount = offset + processedCount.success
              
              // Save progress every 5 products to prevent data loss and reduce overhead
              if (queueId && processedCount.success % 5 === 0) {
                await supabaseClient
                  .from('processing_queue')
                  .update({ 
                    processed_count: absoluteCount,  // Absolute count, not relative
                    last_heartbeat: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', queueId)
                
                console.log(`💾 Progress saved - ${absoluteCount} products processed total (offset updated)`)
              }
            }

            // Reduced delay to 1500ms for faster processing (still respects rate limits)
            await new Promise(resolve => setTimeout(resolve, 1500))

          } catch (error) {
            console.error(`Error processing product ${product.sku}:`, error)
            processedCount.failed++
          }
        }

        // Update queue status and check if there are more products to process
        // Build same query to check remaining
        let remainingQuery = supabaseClient
          .from('vauner_products')
          .select('*', { count: 'exact', head: true })
          .in('sku', oemSkuList)
        
        if (!forceReprocess) {
          remainingQuery = remainingQuery.is('translated_title', null)
        }
        
        const { count: remainingCount } = await remainingQuery
        
        console.log(`✅ Batch complete. Processed: ${processedCount.success}, Failed: ${processedCount.failed}, Remaining: ${remainingCount || 0}`)
        if (forceReprocess) {
          console.log(`🔄 Force reprocess completed for this batch`)
        }
        
        // Stop heartbeat
        stopHeartbeat()
        
        // CRITICAL: Calculate absolute count for final update
        const absoluteCount = offset + processedCount.success
        
        // CRITICAL: Save final progress BEFORE creating new queue to ensure atomicity
        if (queueId) {
          const { error: finalUpdateError } = await supabaseClient
            .from('processing_queue')
            .update({ 
              status: 'completed',
              processed_count: absoluteCount,  // Absolute count
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', queueId)
          
          if (finalUpdateError) {
            console.error('⚠️ Failed to save final progress:', finalUpdateError)
          } else {
            console.log(`✅ Final progress saved - ${absoluteCount} products processed total`)
          }
        }
        
        // If there are more products, create a new queue entry AND trigger processing immediately
        if (remainingCount && remainingCount > 0) {
          console.log('More products remaining, creating new queue entry and triggering immediately...')
          
          const { data: newQueue, error: newQueueError } = await supabaseClient
            .from('processing_queue')
            .insert({
              status: 'pending',
              batch_size: 25,
              total_count: remainingCount,
              processed_count: absoluteCount // CRITICAL: Use absolute count as offset for next batch
            })
            .select()
            .single()

          if (newQueueError) {
            console.error('Failed to create new queue entry:', newQueueError)
          } else if (newQueue) {
            console.log(`✅ Created new queue entry: ${newQueue.id}`)
            
            // Trigger next batch immediately without waiting for cron
            try {
              console.log('🚀 Triggering next batch immediately...')
              
              const nextBatchResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-products`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                  queueId: newQueue.id,
                  forceReprocess: forceReprocess
                })
              })
              
              if (nextBatchResponse.ok) {
                console.log('✅ Next batch triggered successfully - continuous processing active')
              } else {
                const errorText = await nextBatchResponse.text()
                console.error(`⚠️ Failed to trigger next batch: ${nextBatchResponse.status} - ${errorText}`)
                console.log('Cron job will pick it up in max 2 minutes as fallback')
              }
            } catch (triggerError) {
              console.error('⚠️ Error triggering next batch:', triggerError)
              console.log('Cron job will pick it up in max 2 minutes as fallback')
            }
          }
        } else {
          console.log('✅ All products processed!')
        }

      } catch (bgError) {
        console.error('❌ Error in background processing:', bgError)
        
        // Stop heartbeat on error
        stopHeartbeat()
        
        if (queueId) {
          await supabaseClient
            .from('processing_queue')
            .update({ 
              status: 'failed',
              error_message: bgError instanceof Error ? bgError.message : 'Unknown error',
              completed_at: new Date().toISOString()
            })
            .eq('id', queueId)
        }
      }
    }

    // Start background processing (no await)
    processInBackground().catch(err => console.error('Background process error:', err))

    // Return immediate response
    return response

  } catch (error) {
    console.error('❌ Error in process-products:', error)
    
    // Stop heartbeat on error
    stopHeartbeat()
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
