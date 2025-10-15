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