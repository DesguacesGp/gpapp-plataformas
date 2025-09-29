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