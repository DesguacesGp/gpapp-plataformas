import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Settings, Download, LogOut, Sparkles, DollarSign } from "lucide-react";
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
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
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

  // Función que procesa con IA usando el sistema de colas (batch size reducido a 10)
  const processEverythingWithAI = async () => {
    setIsProcessingAll(true);
    
    try {
      toast.info('🤖 Iniciando procesamiento continuo con IA (batches de 50 productos)...');
      
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

      // Llamar a process-products una sola vez con el queueId
      const { error: processError } = await supabase.functions.invoke('process-products', {
        body: { queueId: queueData.id }
      });

      if (processError) throw processError;

      toast.success('✅ Procesamiento iniciado. El sistema continuará automáticamente en segundo plano.');
      
      setTimeout(() => loadProducts(), 2000);
    } catch (error: any) {
      console.error('Error starting AI process:', error);
      toast.error('Error al iniciar el proceso: ' + error.message);
    } finally {
      setIsProcessingAll(false);
    }
  };

  // Función para reanudar procesamiento interrumpido
  const resumeProcessing = async () => {
    setIsProcessingAll(true);
    
    try {
      toast.info('🔄 Reanudando procesamiento...');
      
      const { data, error } = await supabase.functions.invoke('resume-processing', {
        body: { triggered_by: 'manual' }
      });

      if (error) throw error;

      const recoveryInfo = data.recovery_events?.length > 0 
        ? ` (${data.recovery_events.length} eventos de recuperación)` 
        : '';

      if (data.remaining === 0) {
        toast.success('✅ No hay productos pendientes de procesar' + recoveryInfo);
      } else {
        toast.success(`✅ Procesamiento reanudado. ${data.remaining} productos pendientes.` + recoveryInfo);
      }
      
      setTimeout(() => loadProducts(), 2000);
    } catch (error: any) {
      console.error('Error resuming processing:', error);
      toast.error('Error al reanudar: ' + error.message);
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
    
    // Generate Amazon flat file data
    const amazonData = selectedProducts.map(product => {
      // Generate keywords from title and description
      const keywords = [
        product.category,
        'recambio',
        'compatible',
        'OEM',
        'aftermarket',
        'calidad'
      ].filter(Boolean).join(', ');

      return {
        sku: product.sku,
        'product-id': '',
        'product-id-type': '',
        brand_name: 'Recambify',
        item_name: product.translated_title || product.description,
        external_product_id: '',
        recommended_browse_node: '2425091031',
        quantity: product.stock,
        standard_price: (product.final_price || product.price).toFixed(2),
        condition_type: 'new',
        bullet_point1: product.bullet_points?.[0] || '',
        bullet_point2: product.bullet_points?.[1] || '',
        bullet_point3: product.bullet_points?.[2] || '',
        bullet_point4: product.bullet_points?.[3] || '',
        bullet_point5: product.bullet_points?.[4] || '',
        generic_keywords: keywords,
        main_image_url: '',
        other_image_url1: '',
        other_image_url2: '',
        other_image_url3: '',
        other_image_url4: '',
        other_image_url5: '',
        part_number: product.sku,
        compatible_vehicle: product.category || '',
        manufacturer: 'INNOVA RECAMBIOS SL',
        importer: 'INNOVA RECAMBIOS SL, CIF B06720221, AVDA FEDERICO MAYOR ZARAGOZA NAVE 8, 06006 Badajoz, Tel: 924114454',
        country_of_origin: 'China',
        ce_compliance: 'No',
        safety_warnings: 'Ninguno'
      };
    });

    // Generate CSV with tab delimiters (Amazon format)
    const headers = [
      'sku', 'product-id', 'product-id-type', 'brand_name', 'item_name',
      'external_product_id', 'recommended_browse_node', 'quantity', 'standard_price',
      'condition_type', 'bullet_point1', 'bullet_point2', 'bullet_point3',
      'bullet_point4', 'bullet_point5', 'generic_keywords', 'main_image_url',
      'other_image_url1', 'other_image_url2', 'other_image_url3', 'other_image_url4',
      'other_image_url5', 'part_number', 'compatible_vehicle',
      'manufacturer', 'importer', 'country_of_origin', 'ce_compliance', 'safety_warnings'
    ];

    const csvContent = [
      headers.join('\t'),
      ...amazonData.map(row => 
        headers.map(header => {
          const value = row[header as keyof typeof row]?.toString() || '';
          return value.replace(/\t/g, ' ').replace(/\n/g, ' ');
        }).join('\t')
      )
    ].join('\n');

    // Add BOM for proper UTF-8 encoding
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/tab-separated-values;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `amazon-vehicle-light-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();

    toast.success(`Flat file Amazon generado: ${selectedIds.length} productos`);
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
  }, [isCheckingAuth, currentPage, searchTerm, categoryFilter, sortField, sortDirection]);

  const handleSearchChange = (search: string) => {
    setSearchTerm(search);
    setCurrentPage(1); // Reset to first page on search
  };

  const handleCategoryChange = (category: string) => {
    setCategoryFilter(category);
    setCurrentPage(1); // Reset to first page on filter change
  };

  const handleSortChange = (field: string) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // New field, default to ascending
      setSortField(field);
      setSortDirection("asc");
    }
    setCurrentPage(1); // Reset to first page on sort change
  };

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

        <div className="grid gap-6 mb-6 md:grid-cols-3">
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
                  {isProcessingAll ? 'Procesando con IA...' : 'Procesar con IA'}
                </Button>
                <Button
                  onClick={resumeProcessing}
                  variant="outline"
                  disabled={isProcessingAll || isSyncing}
                  size="lg"
                >
                  <RefreshCw className="mr-2 h-5 w-5" />
                  Reanudar Proceso
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
