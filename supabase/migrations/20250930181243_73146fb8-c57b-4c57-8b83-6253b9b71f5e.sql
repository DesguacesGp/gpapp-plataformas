-- Add año_hasta column to vehicle_models table
ALTER TABLE vehicle_models ADD COLUMN IF NOT EXISTS año_hasta TEXT;