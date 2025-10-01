-- Create amazon_product_config table to store Amazon-specific product configuration
CREATE TABLE public.amazon_product_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.vauner_products(id) ON DELETE CASCADE,
  feed_product_type TEXT NOT NULL,
  recommended_browse_node TEXT,
  
  -- Mirror specific attributes
  mirror_position TEXT,
  mirror_heated BOOLEAN DEFAULT false,
  mirror_folding BOOLEAN DEFAULT false,
  mirror_turn_signal BOOLEAN DEFAULT false,
  
  -- Light assembly specific attributes
  light_type TEXT,
  light_placement TEXT,
  
  -- Window regulator specific attributes
  window_side TEXT,
  window_doors TEXT,
  window_mechanism TEXT,
  
  -- Door handle/lock specific attributes
  door_placement TEXT,
  door_material TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(product_id)
);

-- Enable Row Level Security
ALTER TABLE public.amazon_product_config ENABLE ROW LEVEL SECURITY;

-- Create policy for full access
CREATE POLICY "Allow all operations on amazon_product_config" 
ON public.amazon_product_config 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_amazon_product_config_updated_at
BEFORE UPDATE ON public.amazon_product_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_amazon_product_config_product_id ON public.amazon_product_config(product_id);
CREATE INDEX idx_amazon_product_config_feed_type ON public.amazon_product_config(feed_product_type);