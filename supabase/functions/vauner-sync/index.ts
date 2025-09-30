import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface VaunerProduct {
  sku: string;
  description: string;
  stock: number;
  price: number;
  has_image: boolean;
  category?: string;
  raw_data?: any;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { action, categories } = await req.json()

    console.log('Vauner sync request:', { action, categories })

    // Get Vauner credentials from config table
    const { data: configData, error: configError } = await supabaseClient
      .from('vauner_config')
      .select('config_key, config_value')
      .in('config_key', ['vauner_user', 'vauner_password', 'vauner_guid', 'vauner_url'])

    if (configError) {
      console.error('Error fetching config:', configError)
      throw configError
    }

    const config = configData.reduce((acc, item) => {
      acc[item.config_key] = item.config_value
      return acc
    }, {} as Record<string, string>)

    const vaunerUrl = config.vauner_url || 'https://www.vauner.pt'
    const vaunerUser = config.vauner_user
    const vaunerPassword = config.vauner_password
    const vaunerGuid = config.vauner_guid

    if (!vaunerUser || !vaunerPassword || !vaunerGuid) {
      throw new Error('Vauner credentials not configured. Please set them in the config table.')
    }

    if (action === 'sync_products') {
      console.log('Syncing products - Starting authentication...')
      
      try {
        // Step 1: Authenticate with Vauner API
        const authUrl = `${vaunerUrl}/service/authenticate.php?user=${encodeURIComponent(vaunerUser)}&password=${encodeURIComponent(vaunerPassword)}`
        console.log('Auth URL:', authUrl)
        
        const authResponse = await fetch(authUrl)
        if (!authResponse.ok) {
          throw new Error(`Authentication failed with status: ${authResponse.status}`)
        }
        
        const authData = await authResponse.json()
        console.log('Auth response:', JSON.stringify(authData))
        
        const guid = authData.guid
        
        if (!guid) {
          throw new Error(`No GUID received. Response: ${JSON.stringify(authData)}`)
        }
        
        if (authData.resp !== 'Authorized') {
          throw new Error(`Authorization failed: ${authData.resp}`)
        }
        
        console.log('Authentication successful, GUID received')
        
        // Step 2: Get all categories first
        const categoriesUrl = `${vaunerUrl}/service/getcat.php?guid=${encodeURIComponent(guid)}&type=C`
        console.log('Fetching categories from:', categoriesUrl)
        
        const categoriesResponse = await fetch(categoriesUrl)
        if (!categoriesResponse.ok) {
          throw new Error(`Failed to fetch categories: ${categoriesResponse.status}`)
        }
        
        const categoriesData = await categoriesResponse.json()
        console.log('Categories response:', JSON.stringify(categoriesData).substring(0, 200))
        
        if (categoriesData.resp !== 'Authorized') {
          throw new Error('Categories fetch not authorized')
        }
        
        // Step 3: Fetch products for specific categories only
        const allProducts: VaunerProduct[] = []
        const availableCategories = categoriesData.detail || []
        
        // Only fetch products for categories 106, 105, 103
        const targetCategoryIds = ['106', '105', '103']
        const categoriesToFetch = availableCategories.filter((cat: any) => 
          targetCategoryIds.includes(cat.CODIGO)
        )
        
        console.log(`Found ${categoriesToFetch.length} target categories out of ${availableCategories.length} total categories`)
        
        for (const category of categoriesToFetch) {
          const categoryId = category.CODIGO
          const categoryName = category.descricao
          
          const productsUrl = `${vaunerUrl}/service/getproductbycat.php?guid=${encodeURIComponent(guid)}&catId=${encodeURIComponent(categoryId)}`
          console.log(`Fetching products for category ${categoryId} (${categoryName})`)
          
          const productsResponse = await fetch(productsUrl)
          if (!productsResponse.ok) {
            console.error(`Failed to fetch products for ${categoryId}: ${productsResponse.status}`)
            continue
          }
          
          const productsData = await productsResponse.json()
          
          if (productsData.resp !== 'Authorized') {
            console.error(`Products fetch not authorized for category ${categoryId}`)
            continue
          }
          
          // Transform Vauner API response to our format (only products with images)
          if (productsData.detail && Array.isArray(productsData.detail)) {
            console.log(`Total products in category ${categoryId}: ${productsData.detail.length}`)
            
            // Log sample of image values for debugging
            const sampleProducts = productsData.detail.slice(0, 5)
            console.log('Sample image values:', sampleProducts.map((p: any) => ({
              sku: p.cod_artigo,
              image: p.image,
              imageType: typeof p.image
            })))
            
            const categoryProducts = productsData.detail
              .filter((product: any) => {
                // Products with images have a URL like "service/image.php?id=..."
                // Products without images have "0" or empty
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
                raw_data: null // Don't store raw_data to reduce size
              }))
            
            console.log(`Found ${categoryProducts.length} products with images in category ${categoryId}`)
            
            // Get existing products to preserve translated fields
            const skusInBatch = categoryProducts.map((p: any) => p.sku)
            const { data: existingProducts } = await supabaseClient
              .from('vauner_products')
              .select('sku, translated_title, bullet_points')
              .in('sku', skusInBatch)
            
            const existingMap = new Map(
              (existingProducts || []).map(p => [p.sku, { 
                translated_title: p.translated_title, 
                bullet_points: p.bullet_points 
              }])
            )
            
            console.log(`Found ${existingMap.size} existing products to preserve translations`)
            
            // Insert products in batches of 500 to avoid timeouts
            const batchSize = 500
            for (let i = 0; i < categoryProducts.length; i += batchSize) {
              const batch = categoryProducts.slice(i, i + batchSize)
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
                      // Preserve existing translations if they exist
                      ...(existing?.translated_title && { translated_title: existing.translated_title }),
                      ...(existing?.bullet_points && { bullet_points: existing.bullet_points })
                    }
                  }),
                  { onConflict: 'sku' }
                )
              
              if (batchError) {
                console.error(`Error inserting batch ${i}-${i+batchSize}:`, batchError)
              } else {
                console.log(`Upserted batch ${i}-${i+batchSize} (${batch.length} products)`)
              }
            }
            
            allProducts.push(...categoryProducts)
          }
        }
        
        console.log(`Total products with images: ${allProducts.length}`)
        
        if (allProducts.length === 0) {
          return new Response(
            JSON.stringify({ 
              success: true, 
              productsCount: 0,
              message: 'No se encontraron productos con imágenes en las categorías consultadas' 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Step 4: Automatically process unprocessed products with AI
        console.log('Checking for unprocessed products...')
        const { data: unprocessedProducts, error: unprocessedError } = await supabaseClient
          .from('vauner_products')
          .select('id')
          .is('translated_title', null)
          .limit(100) // Process up to 100 products at a time
        
        if (unprocessedError) {
          console.error('Error fetching unprocessed products:', unprocessedError)
        } else if (unprocessedProducts && unprocessedProducts.length > 0) {
          console.log(`Found ${unprocessedProducts.length} unprocessed products, starting AI processing...`)
          
          // Invoke process-products function asynchronously
          const productIds = unprocessedProducts.map(p => p.id)
          
          // Call process-products function (don't await, let it run in background)
          fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-products`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ productIds })
          }).then(response => {
            if (response.ok) {
              console.log('AI processing started successfully')
            } else {
              console.error('Failed to start AI processing:', response.status)
            }
          }).catch(err => {
            console.error('Error calling process-products:', err)
          })
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              productsCount: allProducts.length,
              unprocessedCount: unprocessedProducts.length,
              message: `${allProducts.length} productos sincronizados. Procesando ${unprocessedProducts.length} productos nuevos con IA automáticamente...` 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            productsCount: allProducts.length,
            message: `${allProducts.length} productos sincronizados. Todos los productos ya están procesados.` 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (apiError) {
        console.error('API Error:', apiError)
        throw apiError
      }
    }

    if (action === 'test_connection') {
      console.log('Testing Vauner connection...')
      
      try {
        // Try to authenticate with Vauner API
        const authUrl = `${vaunerUrl}/service/authenticate.php?user=${encodeURIComponent(vaunerUser)}&password=${encodeURIComponent(vaunerPassword)}`
        console.log('Testing auth URL:', authUrl)
        
        const authResponse = await fetch(authUrl)
        
        if (!authResponse.ok) {
          throw new Error(`API returned status ${authResponse.status}`)
        }
        
        const authData = await authResponse.json()
        console.log('Test auth response:', JSON.stringify(authData))
        
        if (!authData.guid) {
          throw new Error(`No GUID received from API. Response: ${JSON.stringify(authData)}`)
        }
        
        if (authData.resp !== 'Authorized') {
          throw new Error(`Authorization failed: ${authData.resp}`)
        }
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Conexión exitosa con Vauner API',
            credentials: {
              url: vaunerUrl,
              user: vaunerUser,
              authorized: true,
              guidReceived: true
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (testError) {
        console.error('Connection test failed:', testError)
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'Error al conectar con Vauner API',
            error: testError instanceof Error ? testError.message : 'Unknown error',
            credentials: {
              url: vaunerUrl,
              user: vaunerUser,
              hasPassword: !!vaunerPassword,
              hasGuid: !!vaunerGuid
            }
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in vauner-sync:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
