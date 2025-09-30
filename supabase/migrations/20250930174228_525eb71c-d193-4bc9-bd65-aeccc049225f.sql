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