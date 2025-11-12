
-- Migration: 20250929064746
-- Tabla para almacenar productos importados de Vauner
CREATE TABLE public.vauner_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  price NUMERIC(10, 2) NOT NULL,
  has_image BOOLEAN NOT NULL DEFAULT false,
  category TEXT,
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_vauner_products_sku ON public.vauner_products(sku);
CREATE INDEX idx_vauner_products_category ON public.vauner_products(category);
CREATE INDEX idx_vauner_products_has_image ON public.vauner_products(has_image);

-- Habilitar Row Level Security
ALTER TABLE public.vauner_products ENABLE ROW LEVEL SECURITY;

-- Políticas RLS: permitir lectura/escritura completa (panel administrativo interno)
CREATE POLICY "Allow all operations on vauner_products"
ON public.vauner_products
FOR ALL
USING (true)
WITH CHECK (true);

-- Función para actualizar timestamps automáticamente
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger para actualizar updated_at
CREATE TRIGGER update_vauner_products_updated_at
BEFORE UPDATE ON public.vauner_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Tabla para configuración de Vauner (credenciales y settings)
CREATE TABLE public.vauner_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key TEXT NOT NULL UNIQUE,
  config_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.vauner_config ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para config
CREATE POLICY "Allow all operations on vauner_config"
ON public.vauner_config
FOR ALL
USING (true)
WITH CHECK (true);

-- Trigger para vauner_config
CREATE TRIGGER update_vauner_config_updated_at
BEFORE UPDATE ON public.vauner_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Migration: 20250929071856
-- Add new columns to vauner_products for processed content
ALTER TABLE vauner_products 
ADD COLUMN IF NOT EXISTS translated_title TEXT,
ADD COLUMN IF NOT EXISTS bullet_points TEXT[];

-- Add index for faster querying
CREATE INDEX IF NOT EXISTS idx_vauner_products_translated 
ON vauner_products(translated_title) 
WHERE translated_title IS NOT NULL;

-- Migration: 20250930050343
-- Add new columns to vauner_products table
ALTER TABLE public.vauner_products 
ADD COLUMN IF NOT EXISTS articulo TEXT,
ADD COLUMN IF NOT EXISTS marca TEXT,
ADD COLUMN IF NOT EXISTS modelo TEXT;

-- Migration: 20250930053022
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

-- Migration: 20250930054227
-- Create table for brand equivalences
CREATE TABLE public.brand_equivalences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vauner_brand TEXT NOT NULL,
  reference_brand TEXT NOT NULL,
  confidence_level TEXT NOT NULL CHECK (confidence_level IN ('high', 'medium', 'low')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT NOT NULL CHECK (created_by IN ('manual', 'auto')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(vauner_brand, reference_brand)
);

-- Create table for model equivalences
CREATE TABLE public.model_equivalences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vauner_model TEXT NOT NULL,
  reference_model TEXT NOT NULL,
  vauner_brand TEXT NOT NULL,
  reference_brand TEXT NOT NULL,
  confidence_level TEXT NOT NULL CHECK (confidence_level IN ('high', 'medium', 'low')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT NOT NULL CHECK (created_by IN ('manual', 'auto')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(vauner_brand, vauner_model, reference_brand, reference_model)
);

-- Enable RLS
ALTER TABLE public.brand_equivalences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_equivalences ENABLE ROW LEVEL SECURITY;

-- Create policies for brand_equivalences
CREATE POLICY "Allow all operations on brand_equivalences" 
ON public.brand_equivalences 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create policies for model_equivalences
CREATE POLICY "Allow all operations on model_equivalences" 
ON public.model_equivalences 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Add triggers for updated_at
CREATE TRIGGER update_brand_equivalences_updated_at
BEFORE UPDATE ON public.brand_equivalences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_model_equivalences_updated_at
BEFORE UPDATE ON public.model_equivalences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Migration: 20250930061242
-- Add año_hasta column to vehicle_models table
ALTER TABLE vehicle_models ADD COLUMN IF NOT EXISTS año_hasta TEXT;

-- Migration: 20250930080618
-- Enable realtime for vauner_products table
ALTER PUBLICATION supabase_realtime ADD TABLE public.vauner_products;

-- Migration: 20250930080711
-- Set REPLICA IDENTITY FULL for vauner_products to include old values in realtime updates
ALTER TABLE public.vauner_products REPLICA IDENTITY FULL;

-- Migration: 20250930084137
-- Create processing queue table for managing automatic product processing
CREATE TABLE IF NOT EXISTS public.processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  batch_size INTEGER NOT NULL DEFAULT 50,
  processed_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  last_product_id UUID,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.processing_queue ENABLE ROW LEVEL SECURITY;

-- Allow all operations (since this is admin functionality)
CREATE POLICY "Allow all operations on processing_queue"
ON public.processing_queue
FOR ALL
USING (true)
WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_processing_queue_updated_at
BEFORE UPDATE ON public.processing_queue
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_processing_queue_status ON public.processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_processing_queue_created_at ON public.processing_queue(created_at DESC);

-- Migration: 20250930093031
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

-- Migration: 20250930101337
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

-- Migration: 20250930105019
-- Create category_config table for dynamic category management
CREATE TABLE public.category_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_code TEXT NOT NULL UNIQUE,
  category_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.category_config ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (since this is admin functionality)
CREATE POLICY "Allow all operations on category_config"
ON public.category_config
FOR ALL
USING (true)
WITH CHECK (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_category_config_updated_at
BEFORE UPDATE ON public.category_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default categories (the ones currently hardcoded)
INSERT INTO public.category_config (category_code, category_name, enabled) VALUES
  ('106', 'ELEVADORES-PUNHOS-COMANDOS-FECHADURAS', true),
  ('105', 'ESPELHOS RETROVISORES', true),
  ('103', 'ILUMINACAO(FAROLINS)-VIATURAS EUROPEIAS', true);

-- Migration: 20251001100124
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

-- Migration: 20251001102745
-- Add requires_manual_review field to amazon_product_config
ALTER TABLE amazon_product_config 
ADD COLUMN requires_manual_review boolean DEFAULT false;

-- Migration: 20251015104704
-- Create storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for the product-images bucket
CREATE POLICY "Public can view product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY "Service role can insert product images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Service role can update product images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'product-images');

CREATE POLICY "Service role can delete product images"
ON storage.objects FOR DELETE
USING (bucket_id = 'product-images');

-- Add processed_image_url column to vauner_products
ALTER TABLE public.vauner_products
ADD COLUMN IF NOT EXISTS processed_image_url text;

-- Migration: 20251015113327
-- Create function to get image statistics efficiently
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
AS $$
  SELECT 
    COUNT(*) FILTER (WHERE processed_image_url IS NOT NULL) as processed_count,
    COUNT(*) FILTER (WHERE processed_image_url IS NULL AND raw_data->>'image' IS NOT NULL) as pending_count,
    COUNT(*) FILTER (WHERE raw_data->>'image' IS NULL) as none_count,
    COUNT(*) as total_count
  FROM vauner_products;
$$;

-- Migration: 20251015113401
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

-- Migration: 20251015113440
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

-- Migration: 20251015171919
-- Create vehicle_compatibility table to store parsed CSV data
CREATE TABLE public.vehicle_compatibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vauner_sku TEXT NOT NULL,
  
  -- Parsed vehicle data from CSV MODELO column
  -- Example: "ALFA ROMEO 147 (00->04)" -> marca: "ALFA ROMEO", modelo: "147", año_desde: "2000", año_hasta: "2004"
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  año_desde TEXT,
  año_hasta TEXT,
  
  -- Cross-reference data from CSV
  referencia_oem TEXT,
  referencia_alkar TEXT,
  referencia_jumasa TEXT,
  referencia_geimex TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  -- Unique constraint
  UNIQUE(vauner_sku, marca, modelo, año_desde, año_hasta)
);

-- Indexes for fast queries
CREATE INDEX idx_vehicle_compatibility_sku ON public.vehicle_compatibility(vauner_sku);
CREATE INDEX idx_vehicle_compatibility_marca_modelo ON public.vehicle_compatibility(marca, modelo);
CREATE INDEX idx_vehicle_compatibility_años ON public.vehicle_compatibility(año_desde, año_hasta);

-- Enable RLS
ALTER TABLE public.vehicle_compatibility ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow all operations
CREATE POLICY "Allow all operations on vehicle_compatibility" 
  ON public.vehicle_compatibility 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_vehicle_compatibility_updated_at
  BEFORE UPDATE ON public.vehicle_compatibility
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Migration: 20251015180740
-- 1. Actualizar años del modelo PRINCIPAL (primer registro por created_at en vehicle_compatibility)
WITH principal_model AS (
  SELECT DISTINCT ON (vauner_sku)
    vauner_sku,
    año_desde,
    año_hasta,
    marca,
    modelo
  FROM vehicle_compatibility
  ORDER BY vauner_sku, created_at ASC
)
UPDATE vauner_products vp
SET 
  año_desde = pm.año_desde,
  año_hasta = pm.año_hasta,
  marca = pm.marca,
  modelo = pm.modelo
FROM principal_model pm
WHERE vp.sku = pm.vauner_sku;

-- 2. Añadir columna para imagen de compatibilidad
ALTER TABLE vauner_products
ADD COLUMN IF NOT EXISTS compatibility_image_url TEXT;

-- Migration: 20251015192554
-- Create function to sync product compatibility data
CREATE OR REPLACE FUNCTION public.sync_product_compatibility()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.vauner_products
  SET 
    marca = NEW.marca,
    modelo = NEW.modelo,
    año_desde = NEW.año_desde,
    año_hasta = NEW.año_hasta,
    updated_at = now()
  WHERE sku = NEW.vauner_sku;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to automatically sync compatibility data
CREATE TRIGGER sync_compatibility_trigger
AFTER INSERT OR UPDATE ON public.vehicle_compatibility
FOR EACH ROW
EXECUTE FUNCTION public.sync_product_compatibility();

-- Retroactively update all existing products from compatibility data
UPDATE public.vauner_products p
SET 
  marca = vc.marca,
  modelo = vc.modelo,
  año_desde = vc.año_desde,
  año_hasta = vc.año_hasta,
  updated_at = now()
FROM public.vehicle_compatibility vc
WHERE p.sku = vc.vauner_sku;

-- Migration: 20251104101547
-- Create iparlux_products table
CREATE TABLE IF NOT EXISTS public.iparlux_products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sku text NOT NULL UNIQUE,
  description text NOT NULL,
  stock integer NOT NULL DEFAULT 0,
  price numeric NOT NULL,
  has_image boolean NOT NULL DEFAULT false,
  category text,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Iparlux specific fields
  referencia text,
  image_gif_url text,
  image_jpg_url text,
  processed_image_url text,
  
  -- Vehicle compatibility (if provided by Iparlux)
  marca text,
  modelo text,
  año_desde text,
  año_hasta text
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_iparlux_products_sku ON public.iparlux_products(sku);
CREATE INDEX IF NOT EXISTS idx_iparlux_products_category ON public.iparlux_products(category);
CREATE INDEX IF NOT EXISTS idx_iparlux_products_has_image ON public.iparlux_products(has_image);

-- Enable RLS
ALTER TABLE public.iparlux_products ENABLE ROW LEVEL SECURITY;

-- RLS Policy (public read access)
CREATE POLICY "Allow all operations on iparlux_products"
  ON public.iparlux_products
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_iparlux_products_updated_at
  BEFORE UPDATE ON public.iparlux_products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Migration: 20251106115450
-- Add categoria and subcategoria columns to vauner_products
ALTER TABLE public.vauner_products 
ADD COLUMN categoria text,
ADD COLUMN subcategoria text;

-- Create vauner_category_mapping configuration table
CREATE TABLE public.vauner_category_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_category text NOT NULL,
  articulo_pattern text,
  description_pattern text,
  nueva_categoria text NOT NULL,
  nueva_subcategoria text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on vauner_category_mapping
ALTER TABLE public.vauner_category_mapping ENABLE ROW LEVEL SECURITY;

-- Create policy for vauner_category_mapping
CREATE POLICY "Allow all operations on vauner_category_mapping"
ON public.vauner_category_mapping
FOR ALL
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_vauner_category_mapping_updated_at
BEFORE UPDATE ON public.vauner_category_mapping
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial mapping rules based on the plan
INSERT INTO public.vauner_category_mapping (original_category, articulo_pattern, description_pattern, nueva_categoria, nueva_subcategoria, priority) VALUES
-- ESPELHOS RETROVISORES mappings
('ESPELHOS RETROVISORES', '%Carcasa%', NULL, 'Espejos Retrovisores', 'Carcasas de Retrovisor', 10),
('ESPELHOS RETROVISORES', '%Cristal%', NULL, 'Espejos Retrovisores', 'Cristales de Retrovisor', 10),
('ESPELHOS RETROVISORES', 'Retrovisor', NULL, 'Espejos Retrovisores', 'Retrovisor Completo', 10),
('ESPELHOS RETROVISORES', 'Retrovisor Completo', NULL, 'Espejos Retrovisores', 'Retrovisor Completo', 10),
('ESPELHOS RETROVISORES', NULL, NULL, 'Espejos Retrovisores', 'Espejos Interiores', 999),

-- ILUMINACAO mappings
('ILUMINACAO', '%Piloto Lateral%', NULL, 'Iluminacion', 'Pilotos laterales', 10),
('ILUMINACAO', '%Intermitente Lateral%', NULL, 'Iluminacion', 'Pilotos laterales', 10),
('ILUMINACAO', '%Piloto Trasero%', NULL, 'Iluminacion', 'Pilotos delanteros', 20),
('ILUMINACAO', '%Piloto Delantero%', NULL, 'Iluminacion', 'Pilotos delanteros', 10),
('ILUMINACAO', '%Matrícula%', NULL, 'Iluminacion', 'Pilotos de matricula', 10),
('ILUMINACAO', '%Matricula%', NULL, 'Iluminacion', 'Pilotos de matricula', 10),
('ILUMINACAO', '%Antiniebla%', NULL, 'Iluminacion', 'Faros antiniebla', 10),
('ILUMINACAO', '%Faro%', NULL, 'Iluminacion', 'Faros delanteros', 10),
('ILUMINACAO', NULL, '%retrovisor%', 'Iluminacion', 'Pilotos retrovisor', 15),

-- ELEVADORES-PUNHOS-COMANDOS-FECHADURAS mappings
('ELEVADORES-PUNHOS-COMANDOS-FECHADURAS', '%Elevalunas%', '%FRT%', 'Carroceria Lateral', 'Elevalunas delanteros', 10),
('ELEVADORES-PUNHOS-COMANDOS-FECHADURAS', '%Elevalunas%', '%TRAS%', 'Carroceria Lateral', 'Elevalunas traseros', 10),
('ELEVADORES-PUNHOS-COMANDOS-FECHADURAS', '%Elevalunas%', NULL, 'Carroceria Lateral', 'Elevalunas', 20),
('ELEVADORES-PUNHOS-COMANDOS-FECHADURAS', '%Mando%', NULL, 'Carroceria Lateral', 'Mando elevalunas', 10),
('ELEVADORES-PUNHOS-COMANDOS-FECHADURAS', '%Cerradura%', NULL, 'Carroceria Lateral', 'Cerraduras', 10),
('ELEVADORES-PUNHOS-COMANDOS-FECHADURAS', '%Maneta%', NULL, 'Carroceria Lateral', 'Manetas de Puerta', 10),
('ELEVADORES-PUNHOS-COMANDOS-FECHADURAS', NULL, NULL, 'Carroceria Lateral', 'Otros', 999);

-- Create index for better performance
CREATE INDEX idx_vauner_products_categoria ON public.vauner_products(categoria);
CREATE INDEX idx_vauner_products_subcategoria ON public.vauner_products(subcategoria);
CREATE INDEX idx_vauner_category_mapping_priority ON public.vauner_category_mapping(priority);
