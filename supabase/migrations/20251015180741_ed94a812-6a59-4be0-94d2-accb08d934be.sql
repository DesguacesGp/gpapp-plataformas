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