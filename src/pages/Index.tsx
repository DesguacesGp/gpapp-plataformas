import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Settings, Download, LogOut, Sparkles, DollarSign, Package, Image as ImageIcon } from "lucide-react";
import { ProductsTable } from "@/components/ProductsTable";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Product {
  id: string;
  sku: string;
  description: string;
  stock: number;
  price: number;
  has_image: boolean;
  category: string | null;
  translated_title: string | null;
  bullet_points: string[] | null;
  final_price?: number;
  articulo: string | null;
  marca: string | null;
  modelo: string | null;
  año_desde: string | null;
  año_hasta: string | null;
  raw_data?: any;
  processed_image_url?: string | null;
  compatibility_image_url?: string | null;
  compatibility?: {
    marca: string;
    modelo: string;
    año_desde: string | null;
    año_hasta: string | null;
    referencia_oem: string | null;
    referencia_alkar: string | null;
    referencia_jumasa: string | null;
    referencia_geimex: string | null;
  }[];
}

const Index = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  // Pagination and filters
  const [currentPage, setCurrentPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalWithImages, setTotalWithImages] = useState(0);
  const [processedProducts, setProcessedProducts] = useState(0);
  const [imageStats, setImageStats] = useState({ processed: 0, pending: 0, none: 0 });
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [articuloFilter, setArticuloFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<string>("ai_processed");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const productsPerPage = 20;
  
  // Ref for search debounce
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Check authentication
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      }
      setIsCheckingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);


  // Subscribe to realtime updates for AI processing
  useEffect(() => {
    const channel = supabase
      .channel('vauner-products-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'vauner_products'
        },
        (payload) => {
          const oldRecord = payload.old as any;
          const newRecord = payload.new as any;
          
          // Show toast when translated_title is updated (new or reprocessed)
          if (newRecord.translated_title && oldRecord.translated_title !== newRecord.translated_title) {
            toast.success(`✅ Reprocesado: ${newRecord.sku}`, {
              description: newRecord.translated_title.substring(0, 60) + '...'
            });
            
            // Update counter if it's a new processing (not a reprocess)
            if (!oldRecord.translated_title) {
              setProcessedProducts(prev => prev + 1);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      // Build query with filters
      let query = supabase
        .from('vauner_products')
        .select('*', { count: 'exact' });

      // Apply search filter
      if (searchTerm) {
        query = query.or(`sku.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
      }

      // Apply category filter
      if (categoryFilter !== "all") {
        query = query.eq('category', categoryFilter);
      }

      // Apply articulo filter
      if (articuloFilter !== "all") {
        query = query.eq('articulo', articuloFilter);
      }

      // Get total count for pagination
      const { count } = await query;
      setTotalProducts(count || 0);

      // Get global KPIs (independent of pagination/filters)
      const { count: withImagesCount } = await supabase
        .from('vauner_products')
        .select('*', { count: 'exact', head: true })
        .eq('has_image', true);
      
      setTotalWithImages(withImagesCount || 0);

      // Get count of processed products (those with translated_title)
      const { count: processedCount } = await supabase
        .from('vauner_products')
        .select('*', { count: 'exact', head: true })
        .not('translated_title', 'is', null);

      setProcessedProducts(processedCount || 0);

      // Apply pagination
      const from = (currentPage - 1) * productsPerPage;
      const to = from + productsPerPage - 1;
      
      // Apply ordering based on sortField
      if (sortField === "ai_processed") {
        // Order by AI processed status (products with translated_title first)
        query = query.order('translated_title', { ascending: false, nullsFirst: false })
                     .order('created_at', { ascending: false });
      } else {
        // Order by the selected field
        const ascending = sortDirection === "asc";
        query = query.order(sortField, { ascending, nullsFirst: false });
      }
      
      const { data: productsData, error: productsError } = await query
        .range(from, to);

      if (productsError) throw productsError;

      // Load pricing configs
      const { data: pricingData, error: pricingError } = await supabase
        .from('pricing_config')
        .select('*');

      if (pricingError) throw pricingError;

      // Create a map of category to pricing config
      const pricingMap = new Map(
        (pricingData || []).map(p => [
          p.category,
          {
            margin: p.margin_percentage,
            vat: p.vat_percentage,
            shipping: p.shipping_cost
          }
        ])
      );

      // Calculate final price for each product
      const productsWithFinalPrice = (productsData || []).map(product => {
        const pricing = pricingMap.get(product.category || '');
        let finalPrice = product.price;

        if (pricing) {
          finalPrice = (product.price * (1 + pricing.margin / 100) * (1 + pricing.vat / 100)) + pricing.shipping;
        }

        return {
          ...product,
          final_price: finalPrice
        };
      });

      // Load compatibility data for current products
      if (productsData && productsData.length > 0) {
        const skus = productsData.map(p => p.sku);
        const { data: compatData } = await supabase
          .from('vehicle_compatibility')
          .select('*')
          .in('vauner_sku', skus);
        
        // Group compatibilities by SKU
        const compatMap = new Map<string, any[]>();
        compatData?.forEach(comp => {
          if (!compatMap.has(comp.vauner_sku)) {
            compatMap.set(comp.vauner_sku, []);
          }
          compatMap.get(comp.vauner_sku)!.push({
            marca: comp.marca,
            modelo: comp.modelo,
            año_desde: comp.año_desde,
            año_hasta: comp.año_hasta,
            referencia_oem: comp.referencia_oem,
            referencia_alkar: comp.referencia_alkar,
            referencia_jumasa: comp.referencia_jumasa,
            referencia_geimex: comp.referencia_geimex
          });
        });
        
        // Combine products with compatibility data
        const productsWithCompat = productsWithFinalPrice.map(product => ({
          ...product,
          compatibility: compatMap.get(product.sku) || []
        }));
        
        setProducts(productsWithCompat);
      } else {
        setProducts(productsWithFinalPrice);
      }

      // Get image stats using optimized database function
      const { data: statsData, error: statsError } = await supabase
        .rpc('get_image_statistics');
      
      if (statsError) {
        console.error('❌ Error loading image stats:', statsError);
        // Fallback to showing zeros if stats fail
        setImageStats({ processed: 0, pending: 0, none: 0 });
      } else if (statsData && statsData.length > 0) {
        const stats = statsData[0];
        setImageStats({
          processed: Number(stats.processed_count),
          pending: Number(stats.pending_count),
          none: Number(stats.none_count)
        });
        console.log('📊 Image statistics loaded:', {
          processed: stats.processed_count,
          pending: stats.pending_count,
          none: stats.none_count,
          total: stats.total_count
        });
      }

    } catch (error: any) {
      console.error('Error loading products:', error);
      toast.error('Error al cargar productos: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const syncFromVauner = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('vauner-sync', {
        body: { action: 'sync_products' }
      });

      if (error) throw error;

      toast.success(`✅ ${data.message || 'Sincronización completada'}`);
      
      loadProducts();
    } catch (error: any) {
      console.error('Error syncing:', error);
      toast.error('Error al sincronizar: ' + error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const processProductImages = async () => {
    setIsProcessingImages(true);
    
    try {
      toast.info('🖼️ Procesando imágenes de productos...');
      
      let totalImagesProcessed = 0;
      let hasMoreImages = true;
      let batchCount = 0;
      
      while (hasMoreImages) {
        batchCount++;
        console.log(`📦 Processing image batch ${batchCount}...`);
        
        const { data: imageResult, error: imageError } = await supabase.functions.invoke('vauner-sync', {
          body: { action: 'process_images' }
        });
        
        if (imageError) {
          console.error('Error processing images:', imageError);
          toast.error(`Error en batch de imágenes ${batchCount}: ${imageError.message}`);
          break;
        }
        
        const processed = imageResult?.stats?.processed || 0;
        totalImagesProcessed += processed;
        hasMoreImages = processed > 0;
        
        if (hasMoreImages) {
          toast.info(`🖼️ Procesadas ${totalImagesProcessed} imágenes de productos...`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      if (totalImagesProcessed > 0) {
        toast.success(`✅ ${totalImagesProcessed} imágenes de productos procesadas`);
      } else {
        toast.info('ℹ️ No hay imágenes de productos pendientes');
      }
      
      setTimeout(() => loadProducts(), 2000);
    } catch (error: any) {
      console.error('Error processing images:', error);
      toast.error('Error: ' + error.message);
    } finally {
      setIsProcessingImages(false);
    }
  };


  const processWithAI = async () => {
    setIsProcessingAI(true);
    
    try {
      toast.info('🤖 Verificando estado del reprocesamiento...');
      
      // Check for existing queue that is not in error state
      const { data: existingQueues } = await supabase
        .from('processing_queue')
        .select('*')
        .in('status', ['pending', 'processing', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1);
      
      let queueToUse = existingQueues?.[0];
      
      if (queueToUse && queueToUse.status === 'completed') {
        // Last queue is completed, ask if user wants to reprocess everything
        const restart = confirm(
          '✅ El reprocesamiento anterior se completó.\n\n' +
          '¿Quieres reprocesar TODOS los productos de nuevo?\n\n' +
          '- OK: Reprocesar todo desde el principio\n' +
          '- Cancelar: No hacer nada'
        );
        
        if (!restart) {
          toast.info('Reprocesamiento cancelado');
          setIsProcessingAI(false);
          return;
        }
        
        // Create new queue to reprocess everything
        queueToUse = null;
      }
      
      if (!queueToUse) {
        // No active queue, create a new one
        toast.info('🆕 Creando nueva cola de procesamiento...');
        
        const { data: queueData, error: queueError } = await supabase
          .from('processing_queue')
          .insert({
            status: 'pending',
            batch_size: 25,
            total_count: 0,
            processed_count: 0
          })
          .select()
          .single();

        if (queueError) throw queueError;
        queueToUse = queueData;
        
        toast.success('✅ Nueva cola creada - iniciando desde el principio');
      } else {
        // There's an active queue, continue from where it left off
        toast.success(
          `🔄 Continuando procesamiento existente...\n` +
          `Progreso: ${queueToUse.processed_count} productos procesados`
        );
      }

      // Invoke edge function with the queue (new or existing)
      const { error: processError } = await supabase.functions.invoke('process-products', {
        body: { 
          queueId: queueToUse.id,
          forceReprocess: true
        }
      });

      if (processError) throw processError;

      toast.success(
        queueToUse.processed_count > 0
          ? `✅ Reprocesamiento continuado desde producto ${queueToUse.processed_count}`
          : '✅ Reprocesamiento iniciado desde el principio'
      );
      
      setTimeout(() => loadProducts(), 2000);
    } catch (error: any) {
      console.error('Error in AI processing:', error);
      toast.error('Error: ' + error.message);
    } finally {
      setIsProcessingAI(false);
    }
  };



  // Utility function to escape CSV fields (handles commas, quotes, newlines)
  const escapeCSV = (field: any): string => {
    if (field === null || field === undefined) return '';
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const buildCSVFromProducts = (productsToExport: Product[]) => {
    // CSV headers with all data fields
    const headers = [
      'SKU',
      'Descripción Original',
      'Título Traducido',
      'Artículo',
      'Marca',
      'Modelo',
      'Año Desde',
      'Año Hasta',
      'Stock',
      'Precio Base',
      'Precio Final',
      'Categoría',
      'Referencias OEM',
      'Referencias ALKAR',
      'Referencias JUMASA',
      'Referencias GEIMEX',
      'Imagen Procesada',
      'Imagen Tabla Compatibilidad',
      'Bullet 1',
      'Bullet 2',
      'Bullet 3',
      'Bullet 4',
      'Bullet 5'
    ];

    // Process each product and extract all data
    const rows = productsToExport.map(p => {
      // Group compatibility references by type - eliminate duplicates with Set
      const oemRefs = [...new Set(
        (p.compatibility || [])
          .map(c => c.referencia_oem)
          .filter(ref => ref !== null && ref !== undefined)
      )].join(', ');

      const alkarRefs = [...new Set(
        (p.compatibility || [])
          .map(c => c.referencia_alkar)
          .filter(ref => ref !== null && ref !== undefined)
      )].join(', ');

      const jumasaRefs = [...new Set(
        (p.compatibility || [])
          .map(c => c.referencia_jumasa)
          .filter(ref => ref !== null && ref !== undefined)
      )].join(', ');

      const geimexRefs = [...new Set(
        (p.compatibility || [])
          .map(c => c.referencia_geimex)
          .filter(ref => ref !== null && ref !== undefined)
      )].join(', ');

      // Extract individual bullet points (up to 5)
      const bullets = p.bullet_points || [];
      const bullet1 = bullets[0] || '';
      const bullet2 = bullets[1] || '';
      const bullet3 = bullets[2] || '';
      const bullet4 = bullets[3] || '';
      const bullet5 = bullets[4] || '';

      return [
        escapeCSV(p.sku),
        escapeCSV(p.description),
        escapeCSV(p.translated_title),
        escapeCSV(p.articulo),
        escapeCSV(p.marca),
        escapeCSV(p.modelo),
        escapeCSV(p.año_desde),
        escapeCSV(p.año_hasta),
        escapeCSV(p.stock),
        escapeCSV(p.price),
        escapeCSV(p.final_price || p.price),
        escapeCSV(p.category),
        escapeCSV(oemRefs),
        escapeCSV(alkarRefs),
        escapeCSV(jumasaRefs),
        escapeCSV(geimexRefs),
        escapeCSV(p.processed_image_url),
        escapeCSV(p.compatibility_image_url),
        escapeCSV(bullet1),
        escapeCSV(bullet2),
        escapeCSV(bullet3),
        escapeCSV(bullet4),
        escapeCSV(bullet5)
      ];
    });

    // Build CSV with UTF-8 BOM for Excel compatibility
    return '\uFEFF' + [headers, ...rows]
      .map(row => row.join(','))
      .join('\n');
  };

  const downloadCSV = (csvContent: string, filename: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportSelected = () => {
    if (selectedIds.length === 0) {
      toast.warning('Selecciona al menos un producto para exportar');
      return;
    }

    const selectedProducts = products.filter(p => selectedIds.includes(p.id));
    const csvContent = buildCSVFromProducts(selectedProducts);
    downloadCSV(csvContent, `productos-vauner-seleccion-${new Date().toISOString().split('T')[0]}.csv`);
    toast.success(`${selectedIds.length} productos exportados con datos completos`);
  };

  const exportAll = async () => {
    try {
      toast.info('Exportando todos los productos...');
      
      // Fetch ALL products with compatibility data using pagination
      let allProducts: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: batch, error: batchError } = await supabase
          .from('vauner_products')
          .select('*')
          .order('sku')
          .range(offset, offset + batchSize - 1);

        if (batchError) throw batchError;
        if (!batch || batch.length === 0) break;
        
        allProducts = [...allProducts, ...batch];
        hasMore = batch.length === batchSize;
        offset += batchSize;
        
        if (allProducts.length % 2000 === 0) {
          toast.info(`Cargando productos: ${allProducts.length}...`);
        }
      }

      toast.info(`✅ ${allProducts.length} productos cargados, procesando...`);

      if (!allProducts || allProducts.length === 0) {
        toast.warning('No hay productos para exportar');
        return;
      }

      // Load pricing config
      const { data: pricingData } = await supabase
        .from('pricing_config')
        .select('*');

      const pricingMap = new Map(
        (pricingData || []).map(p => [
          p.category,
          { 
            margin: Number(p.margin_percentage), 
            vat: Number(p.vat_percentage), 
            shipping: Number(p.shipping_cost) 
          }
        ])
      );

      // Calculate final prices with proper type conversion
      const productsWithFinalPrice = allProducts.map(product => {
        const pricing = pricingMap.get(product.category || '');
        let finalPrice = Number(product.price);
        
        if (pricing) {
          const basePrice = Number(product.price);
          const margin = Number(pricing.margin);
          const vat = Number(pricing.vat);
          const shipping = Number(pricing.shipping);
          
          // Calcular: precio * (1 + margen%) * (1 + IVA%) + envío
          finalPrice = (basePrice * (1 + margin / 100) * (1 + vat / 100)) + shipping;
          
          // Redondear a 2 decimales
          finalPrice = Math.round(finalPrice * 100) / 100;
        }
        
        return { ...product, final_price: finalPrice };
      });

      // Load ALL compatibility data in batches (max 1000 SKUs per query)
      const skus = allProducts.map(p => p.sku);
      const compatMap = new Map<string, any[]>();
      const batchSizeCompat = 1000;
      
      for (let i = 0; i < skus.length; i += batchSizeCompat) {
        const skuBatch = skus.slice(i, i + batchSizeCompat);
        const { data: compatData } = await supabase
          .from('vehicle_compatibility')
          .select('*')
          .in('vauner_sku', skuBatch);

        // Group compatibilities by SKU
        compatData?.forEach(comp => {
          if (!compatMap.has(comp.vauner_sku)) {
            compatMap.set(comp.vauner_sku, []);
          }
          compatMap.get(comp.vauner_sku)!.push({
            marca: comp.marca,
            modelo: comp.modelo,
            año_desde: comp.año_desde,
            año_hasta: comp.año_hasta,
            referencia_oem: comp.referencia_oem,
            referencia_alkar: comp.referencia_alkar,
            referencia_jumasa: comp.referencia_jumasa,
            referencia_geimex: comp.referencia_geimex
          });
        });
      }
      
      console.log(`Compatibilidades cargadas: ${compatMap.size} productos con datos`);

      const productsWithCompat = productsWithFinalPrice.map(product => ({
        ...product,
        compatibility: compatMap.get(product.sku) || []
      }));

      const csvContent = buildCSVFromProducts(productsWithCompat);
      downloadCSV(csvContent, `productos-vauner-completo-${new Date().toISOString().split('T')[0]}.csv`);
      toast.success(`✅ ${productsWithCompat.length} productos exportados (catálogo completo)`);
    } catch (error: any) {
      console.error('Error exporting all products:', error);
      toast.error('Error al exportar: ' + error.message);
    }
  };

  const exportByCategory = async () => {
    if (categoryFilter === 'all') {
      toast.warning('Selecciona una categoría específica para exportar');
      return;
    }

    try {
      toast.info(`Exportando productos de categoría: ${categoryFilter}...`);
      
      // Fetch ALL products from the selected category using pagination
      let categoryProducts: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: batch, error: batchError } = await supabase
          .from('vauner_products')
          .select('*')
          .eq('category', categoryFilter)
          .order('sku')
          .range(offset, offset + batchSize - 1);

        if (batchError) throw batchError;
        if (!batch || batch.length === 0) break;
        
        categoryProducts = [...categoryProducts, ...batch];
        hasMore = batch.length === batchSize;
        offset += batchSize;
        
        if (categoryProducts.length % 2000 === 0) {
          toast.info(`Cargando productos: ${categoryProducts.length}...`);
        }
      }

      toast.info(`✅ ${categoryProducts.length} productos cargados, procesando...`);

      if (!categoryProducts || categoryProducts.length === 0) {
        toast.warning('No hay productos en esta categoría');
        return;
      }

      // Load pricing config
      const { data: pricingData } = await supabase
        .from('pricing_config')
        .select('*');

      const pricingMap = new Map(
        (pricingData || []).map(p => [
          p.category,
          { 
            margin: Number(p.margin_percentage), 
            vat: Number(p.vat_percentage), 
            shipping: Number(p.shipping_cost) 
          }
        ])
      );

      // Calculate final prices with proper type conversion
      const productsWithFinalPrice = categoryProducts.map(product => {
        const pricing = pricingMap.get(product.category || '');
        let finalPrice = Number(product.price);
        
        if (pricing) {
          const basePrice = Number(product.price);
          const margin = Number(pricing.margin);
          const vat = Number(pricing.vat);
          const shipping = Number(pricing.shipping);
          
          // Calcular: precio * (1 + margen%) * (1 + IVA%) + envío
          finalPrice = (basePrice * (1 + margin / 100) * (1 + vat / 100)) + shipping;
          
          // Redondear a 2 decimales
          finalPrice = Math.round(finalPrice * 100) / 100;
        }
        
        return { ...product, final_price: finalPrice };
      });

      // Load compatibility data in batches (max 1000 SKUs per query)
      const skus = categoryProducts.map(p => p.sku);
      const compatMap = new Map<string, any[]>();
      const batchSizeCompat = 1000;
      
      for (let i = 0; i < skus.length; i += batchSizeCompat) {
        const skuBatch = skus.slice(i, i + batchSizeCompat);
        const { data: compatData } = await supabase
          .from('vehicle_compatibility')
          .select('*')
          .in('vauner_sku', skuBatch);

        // Group compatibilities by SKU
        compatData?.forEach(comp => {
          if (!compatMap.has(comp.vauner_sku)) {
            compatMap.set(comp.vauner_sku, []);
          }
          compatMap.get(comp.vauner_sku)!.push({
            marca: comp.marca,
            modelo: comp.modelo,
            año_desde: comp.año_desde,
            año_hasta: comp.año_hasta,
            referencia_oem: comp.referencia_oem,
            referencia_alkar: comp.referencia_alkar,
            referencia_jumasa: comp.referencia_jumasa,
            referencia_geimex: comp.referencia_geimex
          });
        });
      }
      
      console.log(`Compatibilidades cargadas: ${compatMap.size} productos con datos`);

      const productsWithCompat = productsWithFinalPrice.map(product => ({
        ...product,
        compatibility: compatMap.get(product.sku) || []
      }));

      const csvContent = buildCSVFromProducts(productsWithCompat);
      const categorySlug = categoryFilter.toLowerCase().replace(/\s+/g, '-');
      downloadCSV(csvContent, `productos-vauner-${categorySlug}-${new Date().toISOString().split('T')[0]}.csv`);
      toast.success(`✅ ${productsWithCompat.length} productos exportados (categoría: ${categoryFilter})`);
    } catch (error: any) {
      console.error('Error exporting category products:', error);
      toast.error('Error al exportar: ' + error.message);
    }
  };


  const exportAmazonFlatFile = () => {
    if (selectedIds.length === 0) {
      toast.warning('Selecciona al menos un producto para exportar');
      return;
    }

    const selectedProducts = products.filter(p => selectedIds.includes(p.id));
    
    // Generate Amazon flat file data with official VEHICLE_LIGHT_ASSEMBLY template columns
    const amazonData = selectedProducts.map(product => {
      const cleanText = (text: string | null | undefined) => {
        if (!text) return '';
        return text.replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ').trim();
      };

      return {
        item_sku: cleanText(product.sku),
        item_name: cleanText(product.translated_title || product.description),
        external_product_id: '',
        external_product_id_type: '',
        brand_name: 'Recambify',
        manufacturer: 'INNOVA RECAMBIOS SL',
        part_number: cleanText(product.sku),
        product_description: cleanText('Importador: INNOVA RECAMBIOS SL, CIF B06720221, AVDA FEDERICO MAYOR ZARAGOZA NAVE 8, 06006 Badajoz, Tel: 924114454'),
        item_type: 'vehicle-light-assembly',
        feed_product_type: 'Automotive',
        standard_price: (product.final_price || product.price).toFixed(2),
        quantity: product.stock.toString(),
        condition_type: 'New',
        condition_note: '',
        bullet_point1: cleanText(product.bullet_points?.[0] || ''),
        bullet_point2: cleanText(product.bullet_points?.[1] || ''),
        bullet_point3: cleanText(product.bullet_points?.[2] || ''),
        bullet_point4: cleanText(product.bullet_points?.[3] || ''),
        bullet_point5: cleanText(product.bullet_points?.[4] || ''),
        generic_keywords: cleanText([product.category, 'recambio', 'compatible', 'OEM', 'aftermarket'].filter(Boolean).join(', ')),
        main_image_url: '',
        other_image_url1: '',
        other_image_url2: '',
        other_image_url3: '',
        other_image_url4: '',
        other_image_url5: '',
        country_of_origin: 'CN',
        ce_marking: 'No',
        safety_warning1: 'Ninguno',
        safety_warning2: '',
        safety_warning3: '',
        vehicle_make: cleanText(product.marca || ''),
        vehicle_model: cleanText(product.modelo || ''),
        vehicle_year_from: cleanText(product.año_desde || ''),
        vehicle_year_to: cleanText(product.año_hasta || ''),
        fitment_type: 'Direct Replacement',
        assembly_type: 'Vehicle Light Assembly',
        light_type: '',
        light_color: '',
        placement: '',
        number_of_pieces: '1',
        warranty_description: '2 años garantía',
        fulfillment_center_id: ''
      };
    });

    // Official Amazon VEHICLE_LIGHT_ASSEMBLY template headers
    const headers = [
      'item_sku', 'item_name', 'external_product_id', 'external_product_id_type',
      'brand_name', 'manufacturer', 'part_number', 'product_description',
      'item_type', 'feed_product_type', 'standard_price', 'quantity',
      'condition_type', 'condition_note', 'bullet_point1', 'bullet_point2',
      'bullet_point3', 'bullet_point4', 'bullet_point5', 'generic_keywords',
      'main_image_url', 'other_image_url1', 'other_image_url2', 'other_image_url3',
      'other_image_url4', 'other_image_url5', 'country_of_origin', 'ce_marking',
      'safety_warning1', 'safety_warning2', 'safety_warning3', 'vehicle_make',
      'vehicle_model', 'vehicle_year_from', 'vehicle_year_to', 'fitment_type',
      'assembly_type', 'light_type', 'light_color', 'placement',
      'number_of_pieces', 'warranty_description', 'fulfillment_center_id'
    ];

    const csvContent = [
      headers.join('\t'),
      ...amazonData.map(row => 
        headers.map(header => row[header as keyof typeof row] || '').join('\t')
      )
    ].join('\n');

    // Add BOM for proper UTF-8 encoding (required by Amazon)
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/tab-separated-values;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `amazon-vehicle-light-assembly-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();

    toast.success(`Archivo Amazon generado con plantilla oficial: ${selectedIds.length} productos`);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Sesión cerrada");
      navigate("/auth");
    } catch (error: any) {
      toast.error("Error al cerrar sesión");
    }
  };

  useEffect(() => {
    if (!isCheckingAuth) {
      loadProducts();
    }
  }, [isCheckingAuth, currentPage, searchTerm, categoryFilter, articuloFilter, sortField, sortDirection]);

  const handleSearchChange = useCallback((search: string) => {
    // Clear previous timeout
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    
    // Create new timeout
    searchDebounceRef.current = setTimeout(() => {
      setSearchTerm(search);
      setCurrentPage(1);
    }, 500);
  }, []);

  const handleCategoryChange = useCallback((category: string) => {
    setCategoryFilter(category);
    setCurrentPage(1); // Reset to first page on filter change
  }, []);

  const handleArticuloChange = useCallback((articulo: string) => {
    setArticuloFilter(articulo);
    setCurrentPage(1); // Reset to first page on filter change
  }, []);

  const handleSortChange = useCallback((field: string) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // New field, default to ascending
      setSortField(field);
      setSortDirection("asc");
    }
    setCurrentPage(1); // Reset to first page on sort change
  }, [sortField, sortDirection]);

  const totalPages = Math.ceil(totalProducts / productsPerPage);

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Verificando acceso...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-4xl font-bold tracking-tight">Panel Vauner</h1>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={() => navigate("/amazon-connector")}>
                <Package className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => navigate("/pricing")}>
                <DollarSign className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => navigate("/settings")}>
                <Settings className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-muted-foreground">
            Gestión de productos del catálogo automatizado
          </p>
        </div>

        <div className="grid gap-6 mb-6 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Productos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalProducts}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Con Imagen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {totalWithImages}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Productos IA</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {processedProducts} / {totalWithImages}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {totalWithImages > 0 
                  ? `${Math.round((processedProducts / totalWithImages) * 100)}% procesados`
                  : 'Sin productos'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Estado de Imágenes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-green-600 font-medium">✅ Procesadas:</span>
                  <span className="font-bold">{imageStats.processed}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-yellow-600 font-medium">⏳ Pendientes:</span>
                  <span className="font-bold">{imageStats.pending}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">❌ Sin imagen:</span>
                  <span className="font-bold">{imageStats.none}</span>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Catálogo de Productos</CardTitle>
                <CardDescription>
                  Gestiona y sincroniza productos desde la API de Vauner
                </CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={syncFromVauner}
                  variant="outline"
                  disabled={isSyncing || isProcessingImages || isProcessingAI}
                  size="lg"
                >
                  <RefreshCw className={`mr-2 h-5 w-5 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Sincronizando...' : 'Actualizar desde Vauner'}
                </Button>
                <Button
                  onClick={processProductImages}
                  variant="outline"
                  disabled={isProcessingImages || isSyncing}
                  size="lg"
                >
                  <ImageIcon className={`mr-2 h-5 w-5 ${isProcessingImages ? 'animate-pulse' : ''}`} />
                  {isProcessingImages 
                    ? 'Procesando Imágenes...' 
                    : `🖼️ Procesar Imágenes (${imageStats.pending} pendientes)`
                  }
                </Button>
                <Button
                  onClick={processWithAI}
                  variant="default"
                  disabled={isProcessingAI || isSyncing}
                  size="lg"
                >
                  <Sparkles className={`mr-2 h-5 w-5 ${isProcessingAI ? 'animate-pulse' : ''}`} />
                  {isProcessingAI 
                    ? 'Actualizando Títulos con OEM...' 
                    : `🤖 Actualizar Títulos (Solo Ref OEM)`
                  }
                </Button>
                <Button
                  onClick={exportSelected}
                  variant="outline"
                  disabled={selectedIds.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar Selección
                </Button>
                <Button
                  onClick={exportAll}
                  variant="outline"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar Todo
                </Button>
                <Button
                  onClick={exportByCategory}
                  variant="outline"
                  disabled={categoryFilter === 'all'}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar Categoría
                </Button>
                <Button
                  onClick={exportAmazonFlatFile}
                  variant="default"
                  disabled={selectedIds.length === 0}
                  className="bg-orange-600 hover:bg-orange-700 text-white border-orange-600"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Amazon Flat File
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Cargando productos...</div>
            ) : (
              <ProductsTable
                products={products}
                onSelectionChange={setSelectedIds}
                searchTerm={searchTerm}
                onSearchChange={handleSearchChange}
                categoryFilter={categoryFilter}
                onCategoryChange={handleCategoryChange}
                articuloFilter={articuloFilter}
                onArticuloChange={handleArticuloChange}
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalProducts={totalProducts}
                sortField={sortField}
                sortDirection={sortDirection}
                onSortChange={handleSortChange}
              />
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
};

export default Index;
