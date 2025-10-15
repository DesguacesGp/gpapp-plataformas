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