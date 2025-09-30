import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { csvData } = await req.json()
    
    if (!csvData) {
      throw new Error('CSV data is required')
    }

    // Parse CSV data - format: marca;gama;desde;hasta;id_marca;id_gama
    const lines = csvData.split('\n')
    const models = []
    
    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      
      const values = line.split(';').map((s: string) => s.trim())
      if (values.length < 6) continue
      
      const [marca, gama, desde, hasta, id_marca, id_gama] = values
      
      if (marca && gama && desde) {
        models.push({
          marca: marca.replace('﻿', ''), // Remove BOM if present
          gama,
          año_desde: desde,
          id_marca: parseInt(id_marca),
          id_gama: parseInt(id_gama)
        })
      }
    }

    console.log(`Parsed ${models.length} vehicle models`)

    // Group by marca+gama to identify generations
    const modelGroups = new Map<string, any[]>()
    for (const model of models) {
      const key = `${model.marca}|${model.gama}`
      if (!modelGroups.has(key)) {
        modelGroups.set(key, [])
      }
      modelGroups.get(key)!.push(model)
    }

    // Sort each group by año_desde and calculate año_hasta
    for (const [key, group] of modelGroups) {
      group.sort((a, b) => a.año_desde.localeCompare(b.año_desde))
      
      for (let i = 0; i < group.length; i++) {
        const current = group[i]
        const next = group[i + 1]
        
        if (next) {
          // Calculate año_hasta as one month before next generation
          const [nextYear, nextMonth] = next.año_desde.split('.').map(Number)
          let hastaYear = nextYear
          let hastaMonth = nextMonth - 1
          
          if (hastaMonth === 0) {
            hastaMonth = 12
            hastaYear -= 1
          }
          
          current.año_hasta = `${hastaYear}.${String(hastaMonth).padStart(2, '0')}`
        }
        // If no next generation, año_hasta stays undefined (will be null in DB)
      }
    }

    console.log(`Calculated año_hasta for models with multiple generations`)

    // Clear existing data
    const { error: deleteError } = await supabaseClient
      .from('vehicle_models')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (deleteError) {
      console.error('Error clearing vehicle_models:', deleteError)
      throw deleteError
    }

    // Insert in batches of 500
    const batchSize = 500
    let inserted = 0
    
    for (let i = 0; i < models.length; i += batchSize) {
      const batch = models.slice(i, i + batchSize)
      
      const { error: insertError } = await supabaseClient
        .from('vehicle_models')
        .insert(batch)
      
      if (insertError) {
        console.error('Error inserting batch:', insertError)
        throw insertError
      }
      
      inserted += batch.length
      console.log(`Inserted ${inserted}/${models.length} models`)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully imported ${inserted} vehicle models`,
        count: inserted
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in import-vehicle-models:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
