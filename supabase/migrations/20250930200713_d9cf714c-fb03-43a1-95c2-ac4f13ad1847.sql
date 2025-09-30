-- Set REPLICA IDENTITY FULL for vauner_products to include old values in realtime updates
ALTER TABLE public.vauner_products REPLICA IDENTITY FULL;