import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Download, RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AmazonProductsTable } from "@/components/AmazonProductsTable";

interface AmazonProduct {
  id: string;
  sku: string;
  description: string;
  category: string | null;
  stock: number;
  price: number;
  final_price?: number;
  translated_title: string | null;
  bullet_points: string[] | null;
  has_image: boolean;
  marca: string | null;
  modelo: string | null;
  año_desde: string | null;
  año_hasta: string | null;
  amazon_config?: {
    feed_product_type: string;
    recommended_browse_node: string;
    mirror_position?: string;
    mirror_heated?: boolean;
    mirror_folding?: boolean;
    mirror_turn_signal?: boolean;
    light_type?: string;
    light_placement?: string;
    window_side?: string;
    window_doors?: string;
    window_mechanism?: string;
    door_placement?: string;
    door_material?: string;
  };
}

// Mapping de categorías Vauner a tipos de producto Amazon
const CATEGORY_TO_FEED_TYPE: Record<string, string> = {
  'ESPELHOS RETROVISORES': 'mirror',
  'ILUMINACAO(FAROLINS)-VIATURAS EUROPEIAS': 'vehicle_light_assembly',
  'ELEVADORES-PUNHOS-COMANDOS-FECHADURAS': 'window_regulator',
};

// Browse nodes de Amazon para Coche y Moto (ejemplos comunes)
const BROWSE_NODES: Record<string, string> = {
  'mirror': '14284301031', // Automotive > Replacement Parts > Body > Mirrors
  'vehicle_light_assembly': '14284441031', // Automotive > Replacement Parts > Lighting
  'window_regulator': '14284361031', // Automotive > Replacement Parts > Body > Window Regulators
  'door_handle': '14284331031', // Automotive > Replacement Parts > Body > Door Handles
};

const AmazonConnector = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<AmazonProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        loadProducts();
      }
    });
  }, [navigate]);

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      // Cargar productos con imágenes y procesados por IA
      const { data: productsData, error: productsError } = await supabase
        .from('vauner_products')
        .select('*')
        .eq('has_image', true)
        .not('translated_title', 'is', null)
        .order('created_at', { ascending: false });

      if (productsError) throw productsError;

      // Cargar configuración de Amazon
      const { data: configData, error: configError } = await supabase
        .from('amazon_product_config')
        .select('*');

      if (configError) throw configError;

      // Cargar pricing configs
      const { data: pricingData, error: pricingError } = await supabase
        .from('pricing_config')
        .select('*');

      if (pricingError) throw pricingError;

      const pricingMap = new Map(
        (pricingData || []).map(p => [
          p.category,
          { margin: p.margin_percentage, vat: p.vat_percentage, shipping: p.shipping_cost }
        ])
      );

      const configMap = new Map(
        (configData || []).map(c => [c.product_id, c])
      );

      const productsWithConfig = (productsData || []).map(product => {
        const pricing = pricingMap.get(product.category || '');
        let finalPrice = product.price;

        if (pricing) {
          finalPrice = (product.price * (1 + pricing.margin / 100) * (1 + pricing.vat / 100)) + pricing.shipping;
        }

        const config = configMap.get(product.id);
        return {
          ...product,
          final_price: finalPrice,
          amazon_config: config ? {
            feed_product_type: config.feed_product_type,
            recommended_browse_node: config.recommended_browse_node,
            mirror_position: config.mirror_position,
            mirror_heated: config.mirror_heated,
            mirror_folding: config.mirror_folding,
            mirror_turn_signal: config.mirror_turn_signal,
            light_type: config.light_type,
            light_placement: config.light_placement,
            window_side: config.window_side,
            window_doors: config.window_doors,
            window_mechanism: config.window_mechanism,
            door_placement: config.door_placement,
            door_material: config.door_material,
          } : undefined
        };
      });

      setProducts(productsWithConfig);
    } catch (error: any) {
      console.error('Error loading products:', error);
      toast.error('Error al cargar productos: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const autoAssignAmazonConfig = async () => {
    setIsAutoAssigning(true);
    try {
      toast.info('🤖 Asignando automáticamente configuración de Amazon...');

      let assignedCount = 0;

      for (const product of products) {
        if (product.amazon_config) continue; // Ya tiene configuración

        const feedType = CATEGORY_TO_FEED_TYPE[product.category || ''];
        if (!feedType) continue;

        const browseNode = BROWSE_NODES[feedType];

        const configData: any = {
          product_id: product.id,
          feed_product_type: feedType,
          recommended_browse_node: browseNode,
        };

        // Asignar atributos específicos según el tipo
        if (feedType === 'mirror') {
          configData.mirror_position = 'left';
          configData.mirror_heated = false;
          configData.mirror_folding = false;
          configData.mirror_turn_signal = false;
        } else if (feedType === 'vehicle_light_assembly') {
          configData.light_type = 'LED';
          configData.light_placement = 'rear';
        } else if (feedType === 'window_regulator') {
          configData.window_side = 'left';
          configData.window_doors = '4';
          configData.window_mechanism = 'electric';
        } else if (feedType === 'door_handle') {
          configData.door_placement = 'front_left';
          configData.door_material = 'plastic';
        }

        const { error } = await supabase
          .from('amazon_product_config')
          .upsert(configData);

        if (error) {
          console.error('Error assigning config:', error);
        } else {
          assignedCount++;
        }
      }

      toast.success(`✅ ${assignedCount} productos configurados automáticamente`);
      loadProducts();
    } catch (error: any) {
      console.error('Error auto-assigning:', error);
      toast.error('Error en asignación automática: ' + error.message);
    } finally {
      setIsAutoAssigning(false);
    }
  };

  const exportAmazonFlatFile = () => {
    if (selectedIds.length === 0) {
      toast.warning('Selecciona al menos un producto para exportar');
      return;
    }

    const selectedProducts = products.filter(p => selectedIds.includes(p.id));
    
    const cleanText = (text: string | null | undefined) => {
      if (!text) return '';
      return text.replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ').trim();
    };

    // Generar datos según el feed_product_type
    const amazonData = selectedProducts.map(product => {
      const config = product.amazon_config;
      const baseData: any = {
        item_sku: cleanText(product.sku),
        item_name: cleanText(product.translated_title || product.description),
        external_product_id: '',
        external_product_id_type: '',
        brand_name: 'Recambify',
        manufacturer: 'INNOVA RECAMBIOS SL',
        part_number: cleanText(product.sku),
        product_description: cleanText('Importador: INNOVA RECAMBIOS SL, CIF B06720221, AVDA FEDERICO MAYOR ZARAGOZA NAVE 8, 06006 Badajoz, Tel: 924114454'),
        item_type: config?.feed_product_type || 'auto_accessory',
        feed_product_type: 'Automotive',
        recommended_browse_node: config?.recommended_browse_node || '',
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
        warranty_description: '2 años garantía',
        fulfillment_center_id: ''
      };

      // Agregar campos específicos según el tipo
      if (config?.feed_product_type === 'mirror') {
        baseData.mirror_position = config.mirror_position || '';
        baseData.mirror_heated = config.mirror_heated ? 'Yes' : 'No';
        baseData.mirror_folding = config.mirror_folding ? 'Yes' : 'No';
        baseData.mirror_turn_signal = config.mirror_turn_signal ? 'Yes' : 'No';
      } else if (config?.feed_product_type === 'vehicle_light_assembly') {
        baseData.assembly_type = 'Vehicle Light Assembly';
        baseData.light_type = config.light_type || '';
        baseData.placement = config.light_placement || '';
        baseData.number_of_pieces = '1';
      } else if (config?.feed_product_type === 'window_regulator') {
        baseData.window_side = config.window_side || '';
        baseData.window_doors = config.window_doors || '';
        baseData.window_mechanism = config.window_mechanism || '';
      } else if (config?.feed_product_type === 'door_handle') {
        baseData.door_placement = config.door_placement || '';
        baseData.door_material = config.door_material || '';
      }

      return baseData;
    });

    // Determinar todas las columnas únicas presentes en los datos
    const allColumns = new Set<string>();
    amazonData.forEach(row => {
      Object.keys(row).forEach(key => allColumns.add(key));
    });

    const headers = Array.from(allColumns);

    const csvContent = [
      headers.join('\t'),
      ...amazonData.map(row => 
        headers.map(header => row[header] || '').join('\t')
      )
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/tab-separated-values;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `amazon-flat-file-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();

    toast.success(`✅ Archivo Amazon generado: ${selectedIds.length} productos`);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" onClick={() => navigate("/")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-4xl font-bold tracking-tight">Amazon Connector</h1>
            </div>
          </div>
          <p className="text-muted-foreground">
            Configura y exporta productos con formato Amazon optimizado
          </p>
        </div>

        <div className="grid gap-6 mb-6 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Productos Listos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{products.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Con imagen y título IA</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Configurados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {products.filter(p => p.amazon_config).length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {products.length > 0 
                  ? `${Math.round((products.filter(p => p.amazon_config).length / products.length) * 100)}% completado`
                  : 'Sin productos'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Seleccionados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{selectedIds.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Para exportar</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Productos Amazon</CardTitle>
                <CardDescription>
                  Configura tipos de producto, browse nodes y atributos específicos
                </CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={autoAssignAmazonConfig}
                  variant="default"
                  disabled={isAutoAssigning || isLoading}
                >
                  <Sparkles className={`mr-2 h-4 w-4 ${isAutoAssigning ? 'animate-pulse' : ''}`} />
                  {isAutoAssigning ? 'Asignando...' : 'Auto-Asignar'}
                </Button>
                <Button
                  onClick={loadProducts}
                  variant="outline"
                  disabled={isLoading}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Recargar
                </Button>
                <Button
                  onClick={exportAmazonFlatFile}
                  variant="default"
                  disabled={selectedIds.length === 0}
                  className="bg-orange-600 hover:bg-orange-700 text-white border-orange-600"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar Amazon Flat File
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Cargando productos...</div>
            ) : (
              <AmazonProductsTable
                products={products}
                onSelectionChange={setSelectedIds}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AmazonConnector;
