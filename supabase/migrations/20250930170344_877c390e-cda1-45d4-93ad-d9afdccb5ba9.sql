-- Add new columns to vauner_products table
ALTER TABLE public.vauner_products 
ADD COLUMN IF NOT EXISTS articulo TEXT,
ADD COLUMN IF NOT EXISTS marca TEXT,
ADD COLUMN IF NOT EXISTS modelo TEXT;