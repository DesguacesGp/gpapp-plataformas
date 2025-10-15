-- Fix search path for get_image_statistics function
DROP FUNCTION IF EXISTS get_image_statistics();

CREATE OR REPLACE FUNCTION get_image_statistics()
RETURNS TABLE (
  processed_count BIGINT,
  pending_count BIGINT,
  none_count BIGINT,
  total_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT 
    COUNT(*) FILTER (WHERE processed_image_url IS NOT NULL) as processed_count,
    COUNT(*) FILTER (WHERE processed_image_url IS NULL AND raw_data->>'image' IS NOT NULL) as pending_count,
    COUNT(*) FILTER (WHERE raw_data->>'image' IS NULL) as none_count,
    COUNT(*) as total_count
  FROM vauner_products;
$$;