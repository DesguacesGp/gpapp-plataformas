import { useState, useEffect, useCallback } from "react";
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
}

const Index = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
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
          // Check if translated_title was just added (AI processing completed)
          const oldRecord = payload.old as any;
          const newRecord = payload.new as any;
          
          if (!oldRecord.translated_title && newRecord.translated_title) {
            // Product was just processed by AI
            setProcessedProducts(prev => prev + 1);
            toast.success(`Producto procesado: ${newRecord.sku}`);
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

      setProducts(productsWithFinalPrice);

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

  // Función unificada: procesa TODAS las imágenes y luego TODO con IA
  const processEverythingWithAI = async () => {
    setIsProcessingAll(true);
    
    try {
      // PASO 1: Procesar TODAS las imágenes pendientes en loops de 50
      toast.info('🖼️ Paso 1/2: Procesando imágenes pendientes...');
      
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
          break; // Continuar con IA aunque fallen algunas imágenes
        }
        
        const processed = imageResult?.stats?.processed || 0;
        totalImagesProcessed += processed;
        hasMoreImages = processed > 0;
        
        if (hasMoreImages) {
          toast.info(`🖼️ Procesadas ${totalImagesProcessed} imágenes...`);
          // Pequeño delay entre batches para no saturar
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      if (totalImagesProcessed > 0) {
        toast.success(`✅ ${totalImagesProcessed} imágenes procesadas`);
      } else {
        toast.info('ℹ️ No hay imágenes pendientes de procesar');
      }
      
      // PASO 2: Procesar TODOS los productos con IA
      toast.info('🤖 Paso 2/2: Iniciando procesamiento con IA (batches de 50)...');
      
      // Crear registro en processing_queue
      const { data: queueData, error: queueError } = await supabase
        .from('processing_queue')
        .insert({
          status: 'pending',
          batch_size: 50,
          total_count: 0,
          processed_count: 0
        })
        .select()
        .single();

      if (queueError) throw queueError;

      // Llamar a process-products con el queueId
      const { error: processError } = await supabase.functions.invoke('process-products', {
        body: { queueId: queueData.id }
      });

      if (processError) throw processError;

      toast.success('✅ Procesamiento completo iniciado. El sistema continuará automáticamente en segundo plano.');
      
      setTimeout(() => loadProducts(), 2000);
    } catch (error: any) {
      console.error('Error in complete processing:', error);
      toast.error('Error: ' + error.message);
    } finally {
      setIsProcessingAll(false);
    }
  };



  const exportSelected = () => {
    if (selectedIds.length === 0) {
      toast.warning('Selecciona al menos un producto para exportar');
      return;
    }

    const selectedProducts = products.filter(p => selectedIds.includes(p.id));
    const csv = [
      ['SKU', 'Descripción', 'Título Traducido', 'Bullet Points', 'Stock', 'Precio Base', 'Precio Final', 'Imagen', 'Categoría'],
      ...selectedProducts.map(p => [
        p.sku,
        p.description,
        p.translated_title || '',
        p.bullet_points ? p.bullet_points.join(' | ') : '',
        p.stock,
        p.price,
        p.final_price || p.price,
        p.has_image ? 'Sí' : 'No',
        p.category || ''
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `productos-vauner-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    toast.success(`${selectedIds.length} productos exportados`);
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
    setSearchTerm(search);
    setCurrentPage(1); // Reset to first page on search
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
                  disabled={isSyncing || isProcessingAll}
                  size="lg"
                >
                  <RefreshCw className={`mr-2 h-5 w-5 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Sincronizando...' : 'Actualizar desde Vauner'}
                </Button>
                <Button
                  onClick={processEverythingWithAI}
                  variant="default"
                  disabled={isProcessingAll || isSyncing}
                  size="lg"
                >
                  <Sparkles className={`mr-2 h-5 w-5 ${isProcessingAll ? 'animate-pulse' : ''}`} />
                  {isProcessingAll 
                    ? 'Procesando (Imágenes + IA)...' 
                    : `Procesar Todo (${imageStats.pending + (totalWithImages - processedProducts)} pendientes)`
                  }
                </Button>
                <Button
                  onClick={exportSelected}
                  variant="outline"
                  disabled={selectedIds.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar CSV
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
