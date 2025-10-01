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

// Browse nodes de Amazon según plantilla oficial (Vehicle Light Assembly)
const BROWSE_NODES: Record<string, string> = {
  'mirror': '2425076031', // Coche y moto > Piezas para coche > Montaje de faros
  'vehicle_light_assembly': '2425091031', // Coche y moto > Piezas para coche > Montaje de luces traseras
  'window_regulator': '2425082031', // Coche y moto > Piezas para coche > Iluminación interior
  'door_handle': '2425088031', // Coche y moto > Piezas para coche > Luces de matrícula
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

    // Estructura EXACTA de la plantilla oficial de Amazon (Vehicle Light Assembly)
    const headers = [
      'Número de atributos con errores',
      'Número de atributos con otras sugerencias',
      'SKU',
      'Acción de listing',
      'Tipo de producto',
      'Nombre del producto',
      'Marca',
      'Tipo de identificador del producto',
      'ID del producto',
      'Nodos recomendados de búsqueda',
      'Nodos recomendados de búsqueda',
      'Nodos recomendados de búsqueda',
      'Nodos recomendados de búsqueda',
      'Nodos recomendados de búsqueda',
      'Nivel de paquete',
      'El paquete contiene la cantidad de SKU',
      'El paquete contiene un identificador de SKU',
      'Numero de modelo',
      'Nombre Modelo',
      'Fabricante',
      'Código UNSPSC',
      'Número de inventario nacional',
      'Año Modelo',
      'Saltar oferta',
      'Estado del producto',
      'Precio de venta recomendado (PVPR)',
      'Grupo de la marina mercante',
      'Cumplimiento de código de canal (ES)',
      'Cantidad (ES)',
      'Inventario siempre disponible (ES)',
      'Tu precio EUR (Vender en Amazon, ES)',
      'Tu precio EUR (B2B, ES)',
      'Descripción del producto',
      'Viñeta',
      'Características especiales',
      'Características especiales',
      'Características especiales',
      'Características especiales',
      'Características especiales',
      'Estilo',
      'Material',
      'Número de Artículos',
      'Cantidad del paquete del artículo',
      'Color',
      'Tamaño del anillo',
      'Tamaño',
      'Numero de pieza',
      'Forma del artículo',
      'Tipo de corte',
      'Número de pieza equivalente del fabricante de equipos originales',
      'Número de pieza equivalente del fabricante de equipos originales',
      'Número de pieza equivalente del fabricante de equipos originales',
      'Número de pieza equivalente del fabricante de equipos originales',
      'Número de pieza equivalente del fabricante de equipos originales',
      'Edición',
      'Configuración',
      'Posición de la pieza del vehículo',
      'Posición de la pieza del vehículo',
      'Requiere montaje',
      'Color de la lente',
      'Material Lente',
      'Potencia',
      'Potencia Unidad',
      'Tensión',
      'Tensión Unidad',
      'Grado del Producto',
      'Orientación',
      'Tipo de embalaje',
      'Patrón',
      'Compatibilidad con tipo de vehículo',
      'Compatibilidad con tipo de vehículo',
      'Compatibilidad con tipo de vehículo',
      'Compatibilidad con tipo de vehículo',
      'Compatibilidad con tipo de vehículo',
      'Componentes Incluidos',
      'Usos Específicos Para Producto',
      'Usos Específicos Para Producto',
      'Usos Específicos Para Producto',
      'Usos Específicos Para Producto',
      'Usos Específicos Para Producto',
      'Nombre del equipo',
      '¿Es frágil?',
      'Fuente Luz',
      'Tipo de ajuste para el vehículo',
      'Nombre del conjunto',
      'Nivel de relación',
      'SKU principal',
      'Nombre del tema de variación',
      'País de origen',
      'Garantía de Producto',
      '¿Se necesitan baterías?',
      '¿Están incluidas las baterías?',
      'Composición de la batería',
      'Peso Batería',
      'Unidad de peso de la batería',
      'Número de Baterías/pilas',
      'Tipo de pilas/baterías',
      'Número de pilas de litio y metal',
      'Número de células de iones de litio',
      'contenido de energía de la batería de litio',
      'Unidad de contenido de energía de la batería de litio',
      'Embalaje de la batería de litio',
      'Peso de la batería de litio',
      'Unidad del peso de la batería de litio',
      'Normativas sobre mercancías peligrosas',
      'Clase GHS',
      'Detalle del material peligroso',
      'Materiales peligrosos',
      'URL Hoja Datos Seguridad (SDS o MSDS)',
      'Peso Artículo',
      'Unidad de peso del artículo',
      'Duración de la disponibilidad de piezas de recambio en la UE',
      'Unidad de la duración de la disponibilidad de piezas de recambio en la UE',
      'URL de la imagen principal',
      'Longitud del artículo',
      'longitud del artículo',
      'ancho del articulo',
      'Unidad de ancho de artículo',
      'Altura del artículo',
      'Unidad de altura del artículo',
      'Longitud Paquete',
      'Unidad de longitud del paquete',
      'Ancho Paquete',
      'Unidad de anchura del paquete',
      'Altura Paquete',
      'Unidad de altura del paquete',
      'Peso del paquete',
      'Unidad del peso del paquete',
      'Número de cajas'
    ];

    // Generar datos según estructura oficial
    const amazonData = selectedProducts.map(product => {
      const config = product.amazon_config;
      
      return [
        '', // Número de atributos con errores
        '', // Número de atributos con otras sugerencias
        cleanText(product.sku), // SKU
        '(Predeterminado) Crear o reemplazar', // Acción de listing
        'ACCESORIO', // Tipo de producto
        cleanText(product.translated_title || product.description), // Nombre del producto
        'Recambify', // Marca
        'EAN', // Tipo de identificador del producto
        '', // ID del producto
        config?.recommended_browse_node || '', // Nodos recomendados de búsqueda
        '', '', '', '', // Nodos adicionales
        '', '', '', // Nivel de paquete, cantidad, identificador
        cleanText(product.sku), // Numero de modelo
        '', // Nombre Modelo
        'INNOVA RECAMBIOS SL', // Fabricante
        '', '', '', '', // Código UNSPSC, inventario, año modelo, saltar oferta
        'Nuevo', // Estado del producto
        '', '', '', // PVPR, grupo marina, cumplimiento
        product.stock.toString(), // Cantidad (ES)
        '', // Inventario siempre disponible
        (product.final_price || product.price).toFixed(2), // Tu precio EUR (Vender en Amazon)
        '', // Tu precio EUR (B2B)
        cleanText('Importador: INNOVA RECAMBIOS SL, CIF B06720221, AVDA FEDERICO MAYOR ZARAGOZA NAVE 8, 06006 Badajoz, Tel: 924114454'), // Descripción
        cleanText(product.bullet_points?.[0] || ''), // Viñeta
        cleanText(product.bullet_points?.[1] || ''), // Características especiales
        cleanText(product.bullet_points?.[2] || ''),
        cleanText(product.bullet_points?.[3] || ''),
        cleanText(product.bullet_points?.[4] || ''),
        '', '', '', '', '', '', '', '', '', '', // Estilo, Material, Número Artículos, etc.
        cleanText(product.sku), // Numero de pieza
        '', // Forma del artículo
        'Específicos del vehículo', // Tipo de corte
        '', '', '', '', '', '', '', // OEM refs, Edición, Configuración
        config?.light_placement || '', // Posición de la pieza del vehículo
        '', '', // Posición adicional, Requiere montaje
        config?.light_type || '', // Color de la lente (o tipo de luz)
        'Policarbonato', // Material Lente
        '', '', '', '', '', '', '', '', // Potencia, Tensión, Grado, etc.
        cleanText(product.marca || ''), // Compatibilidad con tipo de vehículo
        cleanText(product.modelo || ''),
        cleanText(product.año_desde || ''),
        cleanText(product.año_hasta || ''),
        '', '', '', '', '', '', '', '', '', '', '', '', '', '', // Componentes, Usos, etc.
        'Ajuste universal', // Tipo de ajuste para el vehículo
        '', '', '', '', // Nombre conjunto, nivel relación, SKU principal, tema variación
        'España', // País de origen
        '2 años garantía', // Garantía de Producto
        'No', // ¿Se necesitan baterías?
        'No', // ¿Están incluidas las baterías?
        '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', // Batería, materiales peligrosos
        '', '', '', '', '', // Peso, duración
        '', // URL de la imagen principal
        '', '', '', '', '', '', '', '', '', '', '', '', '', '', '' // Dimensiones
      ];
    });

    // Generar contenido con estructura de 5 filas de encabezado (simplificado a la fila principal)
    const csvContent = [
      headers.join('\t'),
      ...amazonData.map(row => row.join('\t'))
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/tab-separated-values;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `amazon-vehicle-light-assembly-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();

    toast.success(`✅ Archivo Amazon generado con plantilla oficial: ${selectedIds.length} productos`);
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
