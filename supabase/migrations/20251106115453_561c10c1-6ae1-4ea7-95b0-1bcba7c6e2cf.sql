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