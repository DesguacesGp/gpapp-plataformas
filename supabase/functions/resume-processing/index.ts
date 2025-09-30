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

    console.log('🔍 Checking for stalled processing jobs...')

    // Find stalled jobs (processing for more than 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    
    const { data: stalledJobs, error: stalledError } = await supabaseClient
      .from('processing_queue')
      .select('*')
      .eq('status', 'processing')
      .lt('started_at', fiveMinutesAgo)

    if (stalledError) throw stalledError

    if (stalledJobs && stalledJobs.length > 0) {
      console.log(`⚠️  Found ${stalledJobs.length} stalled jobs, marking as error...`)
      
      // Mark stalled jobs as error
      for (const job of stalledJobs) {
        await supabaseClient
          .from('processing_queue')
          .update({
            status: 'error',
            error_message: 'Job stalled for more than 5 minutes',
            completed_at: new Date().toISOString()
          })
          .eq('id', job.id)
      }
    }

    // Check if there are products pending and no active processing
    const { count: remainingCount } = await supabaseClient
      .from('vauner_products')
      .select('*', { count: 'exact', head: true })
      .is('translated_title', null)

    console.log(`📊 Remaining products to process: ${remainingCount || 0}`)

    if (!remainingCount || remainingCount === 0) {
      console.log('✅ No products pending processing')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No products pending processing',
          stalled_jobs: stalledJobs?.length || 0,
          remaining: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if there's already an active processing job
    const { data: activeJobs } = await supabaseClient
      .from('processing_queue')
      .select('*')
      .eq('status', 'processing')

    if (activeJobs && activeJobs.length > 0) {
      console.log('⏳ There is already an active processing job running')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Processing already in progress',
          stalled_jobs: stalledJobs?.length || 0,
          remaining: remainingCount,
          active_jobs: activeJobs.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create new queue entry and trigger processing
    console.log('🚀 Creating new queue entry to resume processing...')
    
    const { data: newQueue } = await supabaseClient
      .from('processing_queue')
      .insert({
        status: 'pending',
        batch_size: 10,
        total_count: remainingCount
      })
      .select()
      .single()

    if (!newQueue) {
      throw new Error('Failed to create queue entry')
    }

    // Trigger process-products
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-products`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        queueId: newQueue.id
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to trigger process-products: ${response.status} - ${errorText}`)
    }

    console.log('✅ Processing resumed successfully')

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Processing resumed successfully',
        stalled_jobs: stalledJobs?.length || 0,
        remaining: remainingCount,
        queue_id: newQueue.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error in resume-processing:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
