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

    // Parse CSV data (expecting semicolon-separated values)
    const lines = csvData.split('\n')
    const headers = lines[0].split(';')
    
    const models = []
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      
      const values = line.split(';')
      if (values.length < 5) continue
      
      models.push({
        marca: values[0]?.replace('﻿', '').trim(), // Remove BOM if present
        gama: values[1]?.trim(),
        año_desde: values[2]?.trim(),
        id_marca: parseInt(values[4]?.trim()),
        id_gama: parseInt(values[5]?.trim())
      })
    }

    console.log(`Parsed ${models.length} vehicle models`)

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
