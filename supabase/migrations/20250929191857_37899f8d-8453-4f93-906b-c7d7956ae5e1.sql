-- Add new columns to vauner_products for processed content
ALTER TABLE vauner_products 
ADD COLUMN IF NOT EXISTS translated_title TEXT,
ADD COLUMN IF NOT EXISTS bullet_points TEXT[];

-- Add index for faster querying
CREATE INDEX IF NOT EXISTS idx_vauner_products_translated 
ON vauner_products(translated_title) 
WHERE translated_title IS NOT NULL;