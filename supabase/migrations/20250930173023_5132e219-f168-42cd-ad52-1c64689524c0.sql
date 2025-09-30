-- Create vehicle_models reference table
CREATE TABLE IF NOT EXISTS public.vehicle_models (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  marca text NOT NULL,
  gama text NOT NULL,
  año_desde text NOT NULL,
  id_marca integer NOT NULL,
  id_gama integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add indexes for faster matching
CREATE INDEX idx_vehicle_models_marca ON public.vehicle_models(marca);
CREATE INDEX idx_vehicle_models_gama ON public.vehicle_models(gama);
CREATE INDEX idx_vehicle_models_marca_gama ON public.vehicle_models(marca, gama);

-- Add año_desde and año_hasta columns to vauner_products
ALTER TABLE public.vauner_products 
ADD COLUMN IF NOT EXISTS año_desde text,
ADD COLUMN IF NOT EXISTS año_hasta text;

-- Enable RLS on vehicle_models table
ALTER TABLE public.vehicle_models ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations on vehicle_models
CREATE POLICY "Allow all operations on vehicle_models"
ON public.vehicle_models
FOR ALL
USING (true)
WITH CHECK (true);

-- Create trigger for vehicle_models updated_at
CREATE TRIGGER update_vehicle_models_updated_at
BEFORE UPDATE ON public.vehicle_models
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();