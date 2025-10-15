import "https://deno.land/x/xhr@0.1.0/mod.ts";
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

    const { productId } = await req.json()
    console.log(`📊 Generating compatibility image for product: ${productId}`)
    
    // Get product and compatibility data
    const { data: product, error: productError } = await supabaseClient
      .from('vauner_products')
      .select('*')
      .eq('id', productId)
      .single()

    if (productError || !product) {
      console.error('Product not found:', productError)
      return new Response(
        JSON.stringify({ error: 'Product not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: compatibility, error: compatError } = await supabaseClient
      .from('vehicle_compatibility')
      .select('*')
      .eq('vauner_sku', product.sku)
      .order('created_at', { ascending: true })

    if (compatError || !compatibility || compatibility.length === 0) {
      console.error('No compatibility data found:', compatError)
      return new Response(
        JSON.stringify({ error: 'No compatibility data found for this product' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${compatibility.length} compatibility entries for ${product.sku}`)

    // Build table rows for the prompt
    const tableRows = compatibility.map(c => {
      const refs = []
      if (c.referencia_oem) refs.push(`OEM: ${c.referencia_oem}`)
      if (c.referencia_alkar) refs.push(`ALKAR: ${c.referencia_alkar}`)
      if (c.referencia_geimex) refs.push(`GEIMEX: ${c.referencia_geimex}`)
      if (c.referencia_jumasa) refs.push(`JUMASA: ${c.referencia_jumasa}`)
      
      return {
        marca: c.marca,
        modelo: c.modelo,
        años: `${c.año_desde}-${c.año_hasta || 'actual'}`,
        referencias: refs.join(' | ') || 'N/A'
      }
    })

    // Generate image prompt
    const imagePrompt = `Crea una tabla profesional y limpia con fondo blanco para publicación en Amazon:

TÍTULO CENTRADO Y EN NEGRITA:
"Tabla de Compatibilidad - ${product.articulo || 'Pieza'} para ${product.marca} ${product.modelo}"
SKU: ${product.sku}

TABLA DE DATOS:
╔═══════════════╦═══════════════════════════╦════════════════╦═══════════════════════════════════════════════╗
║     MARCA     ║          MODELO           ║      AÑOS      ║              REFERENCIAS                      ║
╠═══════════════╬═══════════════════════════╬════════════════╬═══════════════════════════════════════════════╣
${tableRows.map(row => 
`║ ${row.marca.padEnd(13)} ║ ${row.modelo.padEnd(25)} ║ ${row.años.padEnd(14)} ║ ${row.referencias.padEnd(45)} ║`
).join('\n╠═══════════════╬═══════════════════════════╬════════════════╬═══════════════════════════════════════════════╣\n')}
╚═══════════════╩═══════════════════════════╩════════════════╩═══════════════════════════════════════════════╝

REQUISITOS DE DISEÑO:
- **DIMENSIONES: 1000x1000px** (requisito de Amazon)
- **FORMATO: JPEG con calidad 90%** (optimizado para web)
- Fondo blanco limpio (#FFFFFF)
- Bordes de tabla en negro sólido (#000000) con grosor 3px
- Header de la tabla con fondo gris claro (#F0F0F0)
- Texto en negro (#000000), fuente sans-serif profesional (Arial o Helvetica)
- Headers en negrita y centrados
- Contenido de celdas:
  * MARCA, MODELO, AÑOS: centrados
  * REFERENCIAS: alineadas a la izquierda con padding
- Espaciado generoso: padding 15px en cada celda
- Tamaño de fuente: título 22px, headers 14px, contenido 12px
- Dimensiones de imagen: 1000x1000px
- Estilo profesional y limpio, optimizado para Amazon
- Añadir sombra sutil a la tabla para darle profundidad
- El título debe destacar sobre la tabla con margen superior e inferior adecuado

CRÍTICO: La tabla debe ser perfectamente legible y profesional, apta para usar como imagen de producto en Amazon.`

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured')
    }
    
    console.log('Calling Lovable AI to generate compatibility table image...')
    
    // Call Lovable AI to generate image
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [
          {
            role: 'user',
            content: imagePrompt
          }
        ],
        modalities: ['image', 'text']
      })
    })

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text()
      console.error(`AI API error: ${aiResponse.status}`, errorText)
      throw new Error(`AI API error: ${aiResponse.status}`)
    }

    const aiData = await aiResponse.json()
    const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url
    
    if (!imageUrl) {
      console.error('No image generated in AI response:', JSON.stringify(aiData))
      throw new Error('No image generated by AI')
    }

    console.log('Image generated successfully, uploading to storage...')

    // Convert base64 to blob and upload to Supabase Storage as JPEG
    const base64Data = imageUrl.split(',')[1]
    const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
    
    const fileName = `compatibility-tables/${product.sku}-compatible.jpg`
    
    const { error: uploadError } = await supabaseClient
      .storage
      .from('product-images')
      .upload(fileName, buffer, {
        contentType: 'image/jpeg',
        upsert: true
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      throw uploadError
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseClient
      .storage
      .from('product-images')
      .getPublicUrl(fileName)

    console.log('Image uploaded successfully:', publicUrl)

    // Update product with compatibility image URL
    const { error: updateError } = await supabaseClient
      .from('vauner_products')
      .update({ compatibility_image_url: publicUrl })
      .eq('id', productId)

    if (updateError) {
      console.error('Failed to update product with image URL:', updateError)
      throw updateError
    }

    console.log(`✅ Compatibility image generated for ${product.sku}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        imageUrl: publicUrl,
        message: 'Compatibility image generated successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error generating compatibility image:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
