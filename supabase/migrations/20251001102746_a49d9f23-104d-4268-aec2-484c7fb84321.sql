-- Add requires_manual_review field to amazon_product_config
ALTER TABLE amazon_product_config 
ADD COLUMN requires_manual_review boolean DEFAULT false;