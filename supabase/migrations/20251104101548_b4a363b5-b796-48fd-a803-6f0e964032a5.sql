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