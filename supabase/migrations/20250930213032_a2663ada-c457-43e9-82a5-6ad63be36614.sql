-- Add heartbeat tracking to processing_queue
ALTER TABLE processing_queue 
ADD COLUMN IF NOT EXISTS last_heartbeat timestamp with time zone;

-- Create a table to track auto-recovery events
CREATE TABLE IF NOT EXISTS processing_recovery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_type text NOT NULL,
  queue_id uuid REFERENCES processing_queue(id),
  products_remaining integer,
  message text,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on recovery log
ALTER TABLE processing_recovery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on processing_recovery_log"
ON processing_recovery_log
FOR ALL
USING (true)
WITH CHECK (true);

-- Enable pg_cron and pg_net extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create cron job to run resume-processing every 2 minutes
SELECT cron.schedule(
  'auto-resume-processing',
  '*/2 * * * *', -- Every 2 minutes
  $$
  SELECT
    net.http_post(
        url:='https://ucylyiemqzhsbjbkewxt.supabase.co/functions/v1/resume-processing',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjeWx5aWVtcXpoc2JqYmtld3h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNTkwNTcsImV4cCI6MjA3NDczNTA1N30.MLmeeXUF-Gfo5lGCkWtDawu1Npf_jeG2nQcAMxyeBc8"}'::jsonb,
        body:=concat('{"triggered_by": "cron", "time": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);