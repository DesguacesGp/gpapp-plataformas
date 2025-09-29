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
      // In a real implementation, you would call the Vauner API here
      // For now, we'll simulate with mock data
      console.log('Syncing products for categories:', categories)
      
      // Example API call structure (commented out - implement based on actual Vauner API):
      /*
      const response = await fetch(`${vaunerUrl}/api/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${vaunerGuid}`
        },
        body: JSON.stringify({
          user: vaunerUser,
          password: vaunerPassword,
          categories: categories
        })
      })
      
      const products = await response.json()
      */

      // Mock data for demonstration
      const mockProducts: VaunerProduct[] = [
        {
          sku: 'VAU-001',
          description: 'PILOTO DELANTERO DERECHO CITROEN XANTIA 93-',
          stock: 15,
          price: 45.50,
          has_image: true,
          category: categories && categories.length > 0 ? categories[0] : 'Iluminación',
          raw_data: { original: 'CITROEN XANTIA 93-*FAROLIM FRT DRT' }
        },
        {
          sku: 'VAU-002',
          description: 'RETROVISOR IZQUIERDO RENAULT CLIO 05-09',
          stock: 8,
          price: 32.00,
          has_image: true,
          category: categories && categories.length > 0 ? categories[0] : 'Espejos',
          raw_data: { original: 'RENAULT CLIO 05-09 RETROVISOR ESQ' }
        },
        {
          sku: 'VAU-003',
          description: 'PARAGOLPES TRASERO VOLKSWAGEN GOLF VI 08-13',
          stock: 5,
          price: 125.00,
          has_image: false,
          category: categories && categories.length > 0 ? categories[0] : 'Carrocería',
          raw_data: { original: 'VW GOLF VI 08-13 PARACHOQUE TRAS' }
        }
      ]

      // Upsert products to database
      const { data: upsertedProducts, error: upsertError } = await supabaseClient
        .from('vauner_products')
        .upsert(
          mockProducts.map(p => ({
            sku: p.sku,
            description: p.description,
            stock: p.stock,
            price: p.price,
            has_image: p.has_image,
            category: p.category,
            raw_data: p.raw_data
          })),
          { onConflict: 'sku' }
        )
        .select()

      if (upsertError) {
        console.error('Error upserting products:', upsertError)
        throw upsertError
      }

      console.log('Products synced successfully:', upsertedProducts?.length)

      return new Response(
        JSON.stringify({ 
          success: true, 
          productsCount: upsertedProducts?.length || 0,
          message: 'Productos sincronizados correctamente' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'test_connection') {
      // Test connection to Vauner API
      console.log('Testing Vauner connection with:', { vaunerUrl, vaunerUser })
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Conexión configurada correctamente',
          credentials: {
            url: vaunerUrl,
            user: vaunerUser,
            hasPassword: !!vaunerPassword,
            hasGuid: !!vaunerGuid
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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
