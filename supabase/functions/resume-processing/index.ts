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

    const { triggered_by } = await req.json().catch(() => ({ triggered_by: 'manual' }))
    console.log(`🔍 Resume processing triggered by: ${triggered_by}`)

    let recoveryEvents = []

    // Check for stalled jobs using heartbeat
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    
    const { data: stalledJobs, error: stalledError } = await supabaseClient
      .from('processing_queue')
      .select('*')
      .eq('status', 'processing')
      .or(`last_heartbeat.lt.${fiveMinutesAgo},last_heartbeat.is.null`)

    if (stalledError) throw stalledError

    if (stalledJobs && stalledJobs.length > 0) {
      console.log(`⚠️  Found ${stalledJobs.length} stalled jobs (no heartbeat), marking as error...`)
      
      for (const job of stalledJobs) {
        await supabaseClient
          .from('processing_queue')
          .update({
            status: 'error',
            error_message: 'Job stalled - no heartbeat for more than 5 minutes',
            completed_at: new Date().toISOString()
          })
          .eq('id', job.id)

        // Log recovery event
        await supabaseClient
          .from('processing_recovery_log')
          .insert({
            recovery_type: 'stalled_job_detected',
            queue_id: job.id,
            message: `Marked stalled job as error (no heartbeat since ${job.last_heartbeat || job.started_at})`
          })
        
        recoveryEvents.push({ type: 'stalled', queue_id: job.id })
      }
    }

    // Check for pending queue entries that haven't been picked up
    const { data: pendingQueues } = await supabaseClient
      .from('processing_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)

    if (pendingQueues && pendingQueues.length > 0) {
      const pendingQueue = pendingQueues[0]
      console.log(`🎯 Found pending queue entry: ${pendingQueue.id}, triggering processing...`)
      
      // Trigger process-products for this pending queue
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ queueId: pendingQueue.id })
      })

      if (response.ok) {
        console.log('✅ Processing triggered for pending queue')
        
        // Log recovery event
        await supabaseClient
          .from('processing_recovery_log')
          .insert({
            recovery_type: 'pending_queue_resumed',
            queue_id: pendingQueue.id,
            products_remaining: pendingQueue.total_count,
            message: 'Triggered processing for pending queue entry'
          })
        
        recoveryEvents.push({ type: 'pending_resumed', queue_id: pendingQueue.id })
      } else {
        const errorText = await response.text()
        console.error(`Failed to trigger processing: ${response.status} - ${errorText}`)
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Triggered pending queue',
          recovery_events: recoveryEvents,
          stalled_jobs: stalledJobs?.length || 0,
          queue_id: pendingQueue.id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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
          recovery_events: recoveryEvents,
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
          recovery_events: recoveryEvents,
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
      body: JSON.stringify({ queueId: newQueue.id })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to trigger process-products: ${response.status} - ${errorText}`)
    }

    console.log('✅ Processing resumed successfully')

    // Log recovery event
    await supabaseClient
      .from('processing_recovery_log')
      .insert({
        recovery_type: 'new_batch_created',
        queue_id: newQueue.id,
        products_remaining: remainingCount,
        message: 'Created new queue entry and triggered processing'
      })
    
    recoveryEvents.push({ type: 'new_batch', queue_id: newQueue.id })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Processing resumed successfully',
        recovery_events: recoveryEvents,
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
