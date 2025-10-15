import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decode, Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ProcessImageRequest {
  vaunerImageUrl: string
  sku: string
  vaunerBaseUrl: string
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

    const { vaunerImageUrl, sku, vaunerBaseUrl }: ProcessImageRequest = await req.json()

    console.log(`📸 Processing image for SKU: ${sku}`)
    console.log(`🔗 Vauner URL: ${vaunerBaseUrl}/${vaunerImageUrl}`)

    // Step 1: Download image from Vauner API
    const fullImageUrl = `${vaunerBaseUrl}/${vaunerImageUrl}`
    const imageResponse = await fetch(fullImageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })

    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`)
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    console.log(`✅ Image downloaded: ${imageBuffer.byteLength} bytes`)

    // Step 2: Decode and process image
    let image = await decode(new Uint8Array(imageBuffer))
    
    // Ensure we have an Image object (not GIF)
    if (!('encodeJPEG' in image)) {
      throw new Error('Unsupported image format - cannot process GIF animations')
    }
    

    // Step 3: Create 1000x1000 canvas and scale image to 85%
    const canvasSize = 1000
    const imageSize = Math.round(canvasSize * 0.85) // 850px
    
    console.log(`📐 Original dimensions: ${image.width}x${image.height}`)
    
    // SIEMPRE escalar para que el lado más largo sea exactamente 850px
    let scaledWidth = image.width
    let scaledHeight = image.height
    
    const maxDimension = Math.max(scaledWidth, scaledHeight)
    const scaleFactor = imageSize / maxDimension
    
    scaledWidth = Math.round(scaledWidth * scaleFactor)
    scaledHeight = Math.round(scaledHeight * scaleFactor)
    
    console.log(`🔄 Scaling to 85%: ${scaledWidth}x${scaledHeight} (factor: ${scaleFactor.toFixed(2)}x)`)
    image.resize(scaledWidth, scaledHeight)
    
    // Create white 1000x1000 canvas
    const canvas = new Image(canvasSize, canvasSize)
    canvas.fill(0xFFFFFFFF) // White background
    
    // Center the scaled image on the canvas
    const offsetX = Math.round((canvasSize - scaledWidth) / 2)
    const offsetY = Math.round((canvasSize - scaledHeight) / 2)
    
    console.log(`📍 Centering at: (${offsetX}, ${offsetY})`)
    canvas.composite(image, offsetX, offsetY)

    // Step 4: Convert to JPEG with 90% quality
    const jpegBuffer = await canvas.encodeJPEG(90)
    console.log(`✅ Converted to JPEG: ${jpegBuffer.byteLength} bytes`)

    // Step 5: Upload to Supabase Storage
    const fileName = `${sku}.jpg`
    const { data: uploadData, error: uploadError } = await supabaseClient
      .storage
      .from('product-images')
      .upload(fileName, jpegBuffer, {
        contentType: 'image/jpeg',
        upsert: true // Overwrite if exists
      })

    if (uploadError) {
      console.error('❌ Upload error:', uploadError)
      throw uploadError
    }

    console.log(`✅ Uploaded to storage: ${fileName}`)

    // Step 6: Get public URL
    const { data: urlData } = supabaseClient
      .storage
      .from('product-images')
      .getPublicUrl(fileName)

    const publicUrl = urlData.publicUrl

    console.log(`🌐 Public URL: ${publicUrl}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        url: publicUrl,
        sku: sku,
        dimensions: { width: canvasSize, height: canvasSize }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error processing image:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
