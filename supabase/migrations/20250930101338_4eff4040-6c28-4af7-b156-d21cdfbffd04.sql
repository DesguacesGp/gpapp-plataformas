-- Create pricing configuration table
CREATE TABLE public.pricing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL UNIQUE,
  margin_percentage NUMERIC NOT NULL DEFAULT 30 CHECK (margin_percentage >= 0 AND margin_percentage <= 1000),
  shipping_cost NUMERIC NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
  vat_percentage NUMERIC NOT NULL DEFAULT 21 CHECK (vat_percentage >= 0 AND vat_percentage <= 100),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users
CREATE POLICY "Allow all operations on pricing_config"
ON public.pricing_config
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_pricing_config_updated_at
BEFORE UPDATE ON public.pricing_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default pricing configurations for existing categories
INSERT INTO public.pricing_config (category, margin_percentage, shipping_cost, vat_percentage)
SELECT DISTINCT category, 30, 5.99, 21
FROM public.vauner_products
WHERE category IS NOT NULL
ON CONFLICT (category) DO NOTHING;