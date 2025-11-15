📌 FASE 2 — Propuesta detallada de helpers Vauner basados 100% en código original

Helper: api.ts
Resumen del propósito
Centralizar la autenticación contra Vauner, la descarga de categorías/productos habilitados y la inserción masiva en vauner_products, preservando traducciones existentes y respondiendo cuando no hay categorías activas.

Listado exacto de funciones a crear

authenticate (bloque que construye authUrl, hace fetch y valida guid/resp).

fetchCategoriesWithGuid (usa categoriesUrl y valida respuesta autorizada).

getEnabledCategoriesFromDb (consulta category_config y maneja errores).

handleNoEnabledCategories (devuelve la respuesta JSON con corsHeaders).

filterTargetCategories (filtra availableCategories contra targetCategoryIds).

fetchCategoryProducts (recorre categorías, construye productsUrl, valida y transforma detalle).

upsertProductsBatch (mantiene batchSize, preserva traducciones al usar existingMap).

Lógica original y referencias

Construcción y validación de autenticación vía authenticate.php con encodeURIComponent y verificación de guid/resp autorizado.

Descarga de categorías con getcat.php y verificación de resp === 'Authorized'.

Consulta a category_config con enabled = true y manejo de error retornando inmediatamente si la lista está vacía.

Filtrado de categorías disponibles con targetCategoryIds y log de cantidades.

Iteración por cada categoría: descarga de productos, filtrado por imágenes válidas (includes('service/image.php')), mapeo a estructura local y preservación de raw_data.image.

Obtención de traducciones previas (translated_title, bullet_points) y upsert en lotes de 500 preservando campos existentes mediante spread condicional.

Dependencias necesarias

fetch, Response, encodeURIComponent, encodeURIComponent (ya usados en el bloque).

supabaseClient previamente instanciado en la función que invoca al helper; requiere acceso a tablas category_config y vauner_products.

corsHeaders y tipo VaunerProduct definidos en el archivo original (no visibles en el fragmento, deben importarse sin alteración).

Constantes críticas

batchSize = 500 para evitar timeouts al hacer upsert.

Uso exacto de la ruta service/image.php como heurística de imagen válida.

Notas sobre comportamiento que NO debe alterarse

Mantener los console.log estratégicos para trazabilidad (auth, categorías, productos, preservación de traducciones).

Preservar traducciones existentes al hacer upsert usando spread condicional; no sobrescribir campos traducidos si ya existen.

Responder inmediatamente cuando no hay categorías habilitadas con el mensaje exacto en español.

Fragmentos exactos a copiar tal cual

const categoryProducts = productsData.detail
  .filter((product: any) => {
    const hasImage = product.image && product.image !== "0" && product.image.includes('service/image.php')
    return hasImage
  })
  .map((product: any) => ({
    sku: product.cod_artigo || product['cod artigo'],
    description: product.descricao || product.deSCricaO,
    stock: parseInt(product.Stock) || 0,
    price: parseFloat(product.valor) || 0,
    has_image: true,
    category: categoryName,
    raw_data: {
      image: product.image
    }
  }))​:codex-file-citation[codex-file-citation]{line_range_start=108 line_range_end=125 path=docs/vauner/original_codeoriginal_code_api_images_queue_ai.md git_url="https://github.com/DesguacesGp/gpapp-supa-connect/blob/main/docs/vauner/original_codeoriginal_code_api_images_queue_ai.md#L108-L125"}​
const { error: batchError } = await supabaseClient
  .from('vauner_products')
  .upsert(
    batch.map((p: any) => {
      const existing = existingMap.get(p.sku)
      return {
        sku: p.sku,
        description: p.description,
        stock: p.stock,
        price: p.price,
        has_image: p.has_image,
        category: p.category,
        raw_data: p.raw_data,
        ...(existing?.translated_title && { translated_title: existing.translated_title }),
        ...(existing?.bullet_points && { bullet_points: existing.bullet_points })
      }
    })
  )​:codex-file-citation[codex-file-citation]{line_range_start=149 line_range_end=165 path=docs/vauner/original_codeoriginal_code_api_images_queue_ai.md git_url="https://github.com/DesguacesGp/gpapp-supa-connect/blob/main/docs/vauner/original_codeoriginal_code_api_images_queue_ai.md#L149-L165"}​
Riesgos o ambigüedades detectadas

El fragmento no muestra la declaración de VaunerProduct, corsHeaders ni del propio supabaseClient; cualquier helper debe recibirlos sin redefinirlos.

Falta contexto sobre manejo de allProducts acumulado (se declara pero no se utiliza en el bloque visible), lo cual podría implicar lógica adicional fuera del fragmento.

Debe mantenerse el orden exacto de autenticación → categorías → filtros DB → productos, ya que alterar la secuencia rompería la relación con el GUID.

Checklist de validación para implementación en Lovable

 Verificar que authenticate devuelve un GUID válido y authData.resp === 'Authorized'.

 Confirmar que categoriesData.resp es 'Authorized' antes de procesar.

 Garantizar que la consulta a category_config filtra por enabled = true y controla errores.

 Mantener la respuesta JSON y encabezados cuando no hay categorías habilitadas.

 Verificar que el filtrado de imágenes siga usando includes('service/image.php').

 Confirmar que el upsert preserva translated_title y bullet_points cuando existan.

Helper: images.ts
Resumen del propósito
Descargar la imagen desde Vauner, normalizarla a un lienzo 1000×1000 con escala al 85%, convertir a JPEG y subirla a product-images, devolviendo la URL pública.

Listado exacto de funciones a crear

processImageRequest (cuerpo principal que maneja CORS, parsea payload y orquesta el flujo).

downloadImage (descarga con User-Agent específico y valida imageResponse.ok).

decodeAndResizeImage (usa decode, verifica encodeJPEG y aplica escala 85% con cálculo de offsets).

uploadToStorageAndGetUrl (sube con upsert: true y obtiene publicUrl).

Lógica original y referencias

Creación del cliente Supabase usando SUPABASE_SERVICE_ROLE_KEY.

Registros de trazas (Processing image, Vauner URL, etc.) y validación de descarga.

Escalado obligatorio a 85% del lienzo 1000×1000 y centrado calculando offsetX/offsetY.

Conversión a JPEG al 90%, subida a product-images con upsert: true y obtención de URL pública.

Manejo de errores devolviendo JSON con success: false y mensaje derivado de Error.

Dependencias necesarias

createClient desde @supabase/supabase-js@2.

decode e Image desde imagescript@1.2.15.

Acceso a SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY vía Deno.env.

Constantes críticas

canvasSize = 1000 y factor del 85% (Math.round(canvasSize * 0.85)).

Encabezados corsHeaders con lista exacta de headers permitidos.

Notas sobre comportamiento que NO debe alterarse

Mantener la verificación if (!('encodeJPEG' in image)) para descartar GIFs animados.

Conservar User-Agent personalizado en la descarga para evitar bloqueos. 

Responder con métricas (dimensions, url, sku) exactas en el JSON de éxito.

Fragmentos exactos a copiar tal cual

const fullImageUrl = `${vaunerBaseUrl}/${vaunerImageUrl}`
const imageResponse = await fetch(fullImageUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
})​:codex-file-citation[codex-file-citation]{line_range_start=203 line_range_end=209 path=docs/vauner/original_codeoriginal_code_api_images_queue_ai.md git_url="https://github.com/DesguacesGp/gpapp-supa-connect/blob/main/docs/vauner/original_codeoriginal_code_api_images_queue_ai.md#L203-L209"}​
const canvas = new Image(canvasSize, canvasSize)
canvas.fill(0xFFFFFFFF)
const offsetX = Math.round((canvasSize - scaledWidth) / 2)
const offsetY = Math.round((canvasSize - scaledHeight) / 2)
canvas.composite(image, offsetX, offsetY)​:codex-file-citation[codex-file-citation]{line_range_start=245 line_range_end=255 path=docs/vauner/original_codeoriginal_code_api_images_queue_ai.md git_url="https://github.com/DesguacesGp/gpapp-supa-connect/blob/main/docs/vauner/original_codeoriginal_code_api_images_queue_ai.md#L245-L255"}​
Riesgos o ambigüedades detectadas

Dependencia de SUPABASE_SERVICE_ROLE_KEY; si el helper se usa fuera de Edge Function, se debe proveer vía parámetros o configuración sin exponer la clave.

No hay fallback si decode falla más allá del try/catch global; al modularizar debe preservarse la misma propagación de errores.

Checklist de validación

 Confirmar que la imagen resultante mantiene dimensiones 1000×1000 y JPEG 90%.

 Validar que el helper mantiene upsert: true al subir la imagen. 

 Asegurar que se retorna la URL pública obtenida de getPublicUrl.

Helper: queue.ts
Resumen del propósito
Gestionar colas de procesamiento con heartbeat, selección determinística de SKUs con OEM, ejecución en background, control de reintentos y reanudación automática de lotes pendientes o estancados.

Listado exacto de funciones a crear

updateHeartbeat, startHeartbeat, stopHeartbeat (ya definidos en origen, deben exportarse tal cual).

collectOemSkus (consulta vehicle_compatibility y filtra en vauner_products).

loadQueueBatch (obtiene estado de processing_queue, calcula offset, batchSize y carga productos).

markQueueProcessing (actualiza estado a processing, inicia heartbeat).

processInBackground (bloque completo con mapa de compatibilidad, llamada a IA y actualizaciones parciales/finales).

resumeProcessing (segmento procedente de resume-processing que detecta trabajos estancados y crea nuevos lotes).

Lógica original y referencias

Heartbeat cada 20s actualizando last_heartbeat y limpiando con stopHeartbeat.

Obtención de SKUs con OEM (referencia_oem no nula) y ordenación alfabética para paginación determinística.

Manejo de queueId: lectura de processed_count, slicing de oemSkuList, finalización temprana si skuBatch vacío, carga de productos del catálogo y flag forceReprocess.

Respuesta inmediata (success: true) mientras el trabajo continúa en background.

Procesamiento en background: carga de compatibilidad, creación de mapa, preparación de prompt, aplicación del diccionario, reintentos con backoff, parseo del JSON y actualizaciones a vauner_products.

Guardado de progreso cada 5 productos, actualización final de la cola, creación de nueva cola si hay pendientes y disparo inmediato del siguiente lote.

Manejo de errores del background: marca la cola como failed y detiene heartbeat.

Reanudación externa: detección de trabajos estancados (sin heartbeat >5 min), marcaje como error y registro en processing_recovery_log; triggering de colas pendientes y creación de nuevos lotes si no hay trabajos activos.

Dependencias necesarias

setInterval, clearInterval, fetch, Response.

Cliente Supabase con acceso a processing_queue, vauner_products, vehicle_compatibility, processing_recovery_log.

OPENAI_API_KEY, Deno.env, SUPABASE_SERVICE_ROLE_KEY.

DICTIONARY compartido con helper de IA (evaluar punto único de importación).

Constantes críticas

HEARTBEAT_INTERVAL = 20000.

batchSize = 25 (cuando se reanuda por cola).

processedCount guardado cada 5 productos y uso obligatorio de conteo absoluto (offset + procesados).

forceReprocess preserva la lógica condicional de conteo restante. 

Notas sobre comportamiento que NO debe alterarse

Mantener logs con emojis y mensajes, especialmente para la trazabilidad de colas y errores.

Respetar reintentos (máx. 3) y espera exponencial tanto para OpenAI (×1000 ms) como para Lovable (×3000 ms) dentro del procesamiento.

No modificar la lógica de creación de nuevas colas con processed_count como offset; es crítica para continuidad.

Mantener la detección de trabajos estancados basándose en last_heartbeat y la ventana de 5 minutos.

Fragmentos exactos a copiar tal cual

async function updateHeartbeat(supabaseClient: any, queueId: string) {
  try {
    await supabaseClient
      .from('processing_queue')
      .update({ last_heartbeat: new Date().toISOString() })
      .eq('id', queueId)
  } catch (error) {
    console.error('Failed to update heartbeat:', error)
  }
}​:codex-file-citation[codex-file-citation]{line_range_start=329 line_range_end=338 path=docs/vauner/original_codeoriginal_code_api_images_queue_ai.md git_url="https://github.com/DesguacesGp/gpapp-supa-connect/blob/main/docs/vauner/original_codeoriginal_code_api_images_queue_ai.md#L329-L338"}​
const { data: skusWithOem, error: oemError } = await supabaseClient
  .from('vehicle_compatibility')
  .select('vauner_sku')
  .not('referencia_oem', 'is', null)
  .neq('referencia_oem', '')​:codex-file-citation[codex-file-citation]{line_range_start=406 line_range_end=411 path=docs/vauner/original_codeoriginal_code_api_images_queue_ai.md git_url="https://github.com/DesguacesGp/gpapp-supa-connect/blob/main/docs/vauner/original_codeoriginal_code_api_images_queue_ai.md#L406-L411"}​
const compatibilityMap = new Map()
compatibilityData?.forEach(compat => {
  if (!compatibilityMap.has(compat.vauner_sku)) {
    compatibilityMap.set(compat.vauner_sku, [])
  }
  compatibilityMap.get(compat.vauner_sku).push(compat)
})​:codex-file-citation[codex-file-citation]{line_range_start=546 line_range_end=553 path=docs/vauner/original_codeoriginal_code_api_images_queue_ai.md git_url="https://github.com/DesguacesGp/gpapp-supa-connect/blob/main/docs/vauner/original_codeoriginal_code_api_images_queue_ai.md#L546-L553"}​
Riesgos o ambigüedades detectadas

Dentro de processInBackground el bucle usa for (const product of products) aunque el listado cargado es productsToProcess; se debe verificar en la implementación original para evitar pérdida de datos (riesgo de variable fuera de alcance).

OPENAI_API_KEY no aparece definido en el fragmento; el helper debe recibirlo externamente sin alteración.

DICTIONARY aparece tanto en queue.ts como en ai.ts; es crítico consolidarlo sin cambios de contenido.

El uso del SUPABASE_SERVICE_ROLE_KEY en fetchs internos debe mantenerse pero protegerse durante el refactor para no exponer la clave.

Checklist de validación

 Comprobar que oemSkuList está ordenado alfabéticamente antes de hacer slicing. 

 Confirmar que el helper guarda progreso cada 5 productos y actualiza processed_count absoluto. 

 Validar que se marca status: 'completed' con processed_count final y completed_at.

 Asegurar que al detectar remanentes se crea nueva entrada con processed_count como offset y se dispara el siguiente lote. 

 Mantener la lógica de detección de colas estancadas (>5 min) y registro en processing_recovery_log.

 Verificar que la reanudación evita lanzar un nuevo trabajo si ya existe uno status = 'processing'.

Helper: ai.ts
Resumen del propósito
Reutilizar la preparación del prompt de OpenAI con diccionario de reemplazos, manejar reintentos, parsear JSON resultante y orquestar la extracción adicional con Lovable para campos articulo, marca, modelo, año_desde.

Listado exacto de funciones a crear

applyDictionaryReplacements (usa DICTIONARY, maneja caracteres especiales y word boundaries).

buildCompatibilityPrompt (concatena instrucciones con datos de compatibilidad).

callOpenAiWithRetries (estructura reintentos max 3 con backoff exponencial y manejo de estados 429/500).

parseOpenAiResponse (parsea JSON, registra uso de tokens y arma updateData).

callLovableExtractor (usa ai.gateway.lovable.dev con prompt estrictamente definido).

Lógica original y referencias

Diccionario de traducciones (duplicado en dos secciones) con claves/valores exactos; debe mantenerse idéntico. 

Construcción del prompt con instrucciones detalladas (título ≥150 caracteres, bullets con reglas, datos estructurados).

Manejo de reintentos OpenAI (hasta 3, espera Math.pow(2, retries) * 1000).

Parseo del contenido JSON devuelto y ensamblado de updateData, con condición para no sobreescribir año_desde cuando hay compatibilidad CSV. 

Integración con Lovable: selección de productos faltantes, bucle con reintentos exponenciales (6s, 12s, 24s) y parseo estricto de JSON. 

Dependencias necesarias

fetch para OpenAI y Lovable, JSON.parse, console.log.

OPENAI_API_KEY, LOVABLE_API_KEY.

compatibilityMap y producto actual (recibidos desde helper de cola).

supabaseClient para actualizaciones y consultas de productos.

Constantes críticas

El prompt textual completo (system y user) debe copiarse literalmente, incluyendo mayúsculas, emojis y reglas.

maxRetries = 3 y esquema de espera Math.pow(2, retries) * 1000 (OpenAI) y * 3000 (Lovable).

Notas sobre comportamiento que NO debe alterarse

Mantener el log de uso de tokens (aiData.usage).

Respetar la prioridad de datos de compatibilidad CSV para año_desde (solo actualizar si no existe).

No modificar el formato de respuesta esperado (JSON sin texto adicional).

Fragmentos exactos a copiar tal cual

const specialCharsEntries = Object.entries(DICTIONARY).filter(([key]) => /[\/\*\.]/.test(key))
const normalEntries = Object.entries(DICTIONARY).filter(([key]) => !/[\/\*\.]/.test(key))

for (const [key, value] of specialCharsEntries) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(escapedKey, 'gi')
  translatedDesc = translatedDesc.replace(regex, value)
}​:codex-file-citation[codex-file-citation]{line_range_start=636 line_range_end=651 path=docs/vauner/original_codeoriginal_code_api_images_queue_ai.md git_url="https://github.com/DesguacesGp/gpapp-supa-connect/blob/main/docs/vauner/original_codeoriginal_code_api_images_queue_ai.md#L636-L651"}​
if (productCompatibility.length === 0 && processedData.año_desde) {
  updateData.año_desde = processedData.año_desde
}​:codex-file-citation[codex-file-citation]{line_range_start=844 line_range_end=847 path=docs/vauner/original_codeoriginal_code_api_images_queue_ai.md git_url="https://github.com/DesguacesGp/gpapp-supa-connect/blob/main/docs/vauner/original_codeoriginal_code_api_images_queue_ai.md#L844-L847"}​
Riesgos o ambigüedades detectadas

El prompt contiene saltos de línea y backticks específicos; cualquier cambio puede alterar la respuesta del modelo.

El diccionario está duplicado; al centralizarlo se debe evitar divergencias (quizá moverlo a helper compartido pero sin modificar entradas).

Falta definición explícita de OPENAI_API_KEY; se debe inyectar desde configuración sin exponerlo.

Checklist de validación

 Confirmar que applyDictionaryReplacements mantiene el orden (especiales primero, luego normales).

 Asegurar que los prompts (system/user) coinciden al 100% con el original, sin espacios extra. 

 Validar que los manejos de estado 429/500 conservan los mensajes originales en logs. 

 Verificar que el JSON parseado del AI se aplica exactamente a los campos de vauner_products y respeta la regla de año_desde.

 En Lovable, comprobar que maxRetries y espera exponencial siguen la secuencia 6s/12s/24s. 

Helper: categories.ts
Resumen del propósito
Encapsular la lectura de categorías habilitadas en base de datos y el filtrado de categorías disponibles provenientes de Vauner antes de descargar productos.

Listado exacto de funciones a crear

getEnabledCategories (consulta category_config y maneja el error).

validateEnabledCategories (retorna la respuesta temprana si la lista está vacía).

filterCategoriesToFetch (usa availableCategories.filter con targetCategoryIds.includes).

Lógica original y referencias

Selección de category_code y category_name, filtrando enabled = true.

Construcción de targetCategoryIds y comparación con availableCategories proveniente de Vauner. 

Dependencias necesarias

supabaseClient con acceso a category_config.

corsHeaders y Response para mantener la salida en caso de lista vacía.

Constantes críticas

Mensaje de error "No hay categorías habilitadas. Por favor, configura las categorías en Ajustes.".

Notas sobre comportamiento que NO debe alterarse

Mantener el retorno temprano (no continuar con sincronización si no hay categorías).

Mantener los logs de conteo (Found ${categoriesToFetch.length} target categories...).

Fragmentos exactos a copiar tal cual

const categoriesToFetch = availableCategories.filter((cat: any) =>
  targetCategoryIds.includes(cat.CODIGO)
)​:codex-file-citation[codex-file-citation]{line_range_start=69 line_range_end=74 path=docs/vauner/original_codeoriginal_code_api_images_queue_ai.md git_url="https://github.com/DesguacesGp/gpapp-supa-connect/blob/main/docs/vauner/original_codeoriginal_code_api_images_queue_ai.md#L69-L74"}​
Riesgos o ambigüedades detectadas

availableCategories proviene de categoriesData.detail; se debe asegurar que el helper reciba la estructura intacta.

Al modularizar, el helper debe seguir retornando estructuras compatibles con el flujo existente (no cambiar a otro formato).

Checklist de validación

 Confirmar que la consulta category_config conserva exactamente las columnas y el filtro enabled.

 Verificar que el mensaje de ausencia se devuelve con success: false.

 Asegurar que categoriesToFetch usa los mismos category_code del listado habilitado. 

Helper: compatibility.ts
Resumen del propósito
Construir y administrar la información de compatibilidad OEM/Equivalentes para integrarla en los prompts de IA y en la lógica de reanudación de procesos.

Listado exacto de funciones a crear

loadCompatibilityData (consulta a vehicle_compatibility por lista de SKUs y arma compatibilityMap).

buildCompatibilityMetadata (genera principalModel, secondaryModels, referencias OEM y equivalentes, string allModelsForTitle).

buildCompatibilityPrompt (texto multilinea con instrucciones para IA).

checkPendingCompatibilityProducts (conteo de productos con OEM sin procesar usando .or('translated_title...')).

Lógica original y referencias

Agrupación de datos en compatibilityMap y ordenamiento por created_at.

Extracción de referencias OEM y equivalentes (ALKAR, JUMASA, GEIMEX) únicas. 

Formato del prompt con instrucciones críticas para título, bullet y campos estructurados. 

En la reanudación, conteo de productos pendientes basado en SKUs con OEM y verificación de campos nulos. 

Dependencias necesarias

supabaseClient sobre tablas vehicle_compatibility y vauner_products.

Set, Map para agrupaciones.

Acceso al listado oemSkuList.

Constantes críticas

Texto del prompt de compatibilidad y la regla de no generar año_desde/año_hasta si ya proviene del CSV. 

Uso explícito de nombres de equivalencias (ALKAR, JUMASA, GEIMEX).

Notas sobre comportamiento que NO debe alterarse

Mantener la unión de modelos secundarios con ' y ' y el formato Modelo (año_desde-año_hasta) o solo inicio si no existe año_hasta.

Preservar la lógica de Set para referencias únicas.

Conservar el conteo exacto en la reanudación (translated_title.is.null, articulo.is.null, ...).

Fragmentos exactos a copiar tal cual

const allOemRefs = [...new Set(
  sortedCompat.map(c => c.referencia_oem).filter(Boolean)
)].join(', ')​:codex-file-citation[codex-file-citation]{line_range_start=585 line_range_end=588 path=docs/vauner/original_codeoriginal_code_api_images_queue_ai.md git_url="https://github.com/DesguacesGp/gpapp-supa-connect/blob/main/docs/vauner/original_codeoriginal_code_api_images_queue_ai.md#L585-L588"}​
const { count: remainingCount } = await supabaseClient
  .from('vauner_products')
  .select('sku', { count: 'exact', head: true })
  .in('sku', oemSkuList)
  .or('translated_title.is.null,articulo.is.null,marca.is.null,modelo.is.null')​:codex-file-citation[codex-file-citation]{line_range_start=1188 line_range_end=1194 path=docs/vauner/original_codeoriginal_code_api_images_queue_ai.md git_url="https://github.com/DesguacesGp/gpapp-supa-connect/blob/main/docs/vauner/original_codeoriginal_code_api_images_queue_ai.md#L1188-L1194"}​
Riesgos o ambigüedades detectadas

Los campos año_desde/año_hasta provienen del CSV; cualquier helper debe respetar la prioridad del dataset original.

El fragmento supone que las columnas referencia_alkar, referencia_jumasa, referencia_geimex siempre existen; al modularizar se debe proteger contra undefined.

Checklist de validación

 Verificar que compatibilityMap agrupa por vauner_sku.

 Confirmar que los modelos se ordenan por created_at antes de identificar principal/secundarios. 

 Mantener la concatenación de referencias equivalentes con prefijos ALKAR, JUMASA, GEIMEX.

 Validar que el conteo de pendientes usa la cláusula .or exacta. 

Helper: models.ts
Resumen del propósito
Gestionar la extracción y actualización de campos estructurados (articulo, marca, modelo, año_desde) tanto desde la respuesta de OpenAI como del extractor Lovable, asegurando coherencia con datos de compatibilidad.

Listado exacto de funciones a crear

prepareStructuredUpdate (recibe processedData de OpenAI, arma updateData y respeta regla de año_desde).

extractStructuredDataWithLovable (selecciona productos faltantes, invoca IA secundaria y parsea JSON).

handleLovableRateLimit (aplica backoff 6s/12s/24s y contabiliza éxitos/fallos).

Lógica original y referencias

updateData contiene translated_title, bullet_points, articulo, marca, modelo, con año_desde condicionado. 

En la extracción, selección de productos con translated_title pero campos nulos y límite de 10 por lote. 

Prompt para Lovable con instrucciones específicas y formato JSON. 

Manejo de reintentos con Math.pow(2, retries) * 3000 y contabilización de processedCount.

Dependencias necesarias

supabaseClient para leer productos pendientes.

LOVABLE_API_KEY, fetch.

Resultado del helper de compatibilidad para decidir si se actualiza año_desde.

Constantes críticas

Límite de 10 productos por lote para extracción. 

Prompt JSON sin texto extra. 

Notas sobre comportamiento que NO debe alterarse

No modificar el orden de prioridad: primero OpenAI, luego Lovable para completar campos faltantes.

Mantener contadores processedCount.success y failed.

Fragmentos exactos a copiar tal cual

const updateData: any = {
  translated_title: processedData.translated_title,
  bullet_points: processedData.bullet_points,
  articulo: processedData.articulo || null,
  marca: processedData.marca || null,
  modelo: processedData.modelo || null
}​:codex-file-citation[codex-file-citation]{line_range_start=835 line_range_end=842 path=docs/vauner/original_codeoriginal_code_api_images_queue_ai.md git_url="https://github.com/DesguacesGp/gpapp-supa-connect/blob/main/docs/vauner/original_codeoriginal_code_api_images_queue_ai.md#L835-L842"}​
const { data: products, error: fetchError } = await supabaseClient
  .from('vauner_products')
  .select('*')
  .not('translated_title', 'is', null)
  .or('articulo.is.null,marca.is.null,modelo.is.null')
  .limit(10)​:codex-file-citation[codex-file-citation]{line_range_start=1517 line_range_end=1524 path=docs/vauner/original_codeoriginal_code_api_images_queue_ai.md git_url="https://github.com/DesguacesGp/gpapp-supa-connect/blob/main/docs/vauner/original_codeoriginal_code_api_images_queue_ai.md#L1517-L1524"}​
Riesgos o ambigüedades detectadas

La variable processedCount se incrementa en ambos bloques (OpenAI y Lovable); se debe sincronizar para evitar duplicados.

El parseo del JSON de Lovable no se muestra (deberá mantenerse exactamente como en origen fuera del fragmento).

Necesidad de garantizar que la actualización final no sobrescriba datos agregados manualmente.

Checklist de validación

 Verificar que updateData inserta null explícito cuando la IA devuelve valores vacíos. 

 Asegurar que el helper de Lovable respeta el límite de 10 registros y maneja reintentos. 

 Confirmar que los campos resultantes se actualizan en vauner_products sin sobrescribir compatibilidad prioritaria. 

Notas generales y riesgos globales
Duplicación del diccionario: presente en queue.ts y ai.ts; al modularizar debe existir una sola fuente de verdad sin alterar claves/valores.

Variables fuera del fragmento: products en el loop principal y OPENAI_API_KEY deben revisarse en el archivo completo para garantizar disponibilidad post-refactor.

Seguridad: todos los helpers deben recibir claves vía parámetros/configuración; nunca deben exponer SUPABASE_SERVICE_ROLE_KEY directamente en respuestas o logs adicionales.

Orden del pipeline: Autenticación → categorías → productos → IA → extracción estructurada → colas; cualquier helper debe conservar exactamente esa secuencia descrita en los fragmentos.

No se ejecutaron pruebas ni se modificaron archivos en este paso (entregable exclusivamente documental).