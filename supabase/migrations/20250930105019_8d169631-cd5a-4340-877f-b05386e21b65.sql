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