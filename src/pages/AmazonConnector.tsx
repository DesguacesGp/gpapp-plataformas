import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Download, RefreshCw, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AmazonProductsTable } from "@/components/AmazonProductsTable";
import * as XLSX from 'xlsx';

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

// Browse nodes de Amazon según plantilla oficial y categorías específicas
// Nodos más comunes para diferentes tipos de productos
const BROWSE_NODES_BY_TYPE: Record<string, string> = {
  // Espejos retrovisores
  'mirror_completo': '5029368031', // Espejos retrovisores completos
  'mirror_angulo_muerto': '5029368031', // Retrovisores de ángulo muerto (mismo nodo)
  'mirror_lateral': '2425404031', // Espejos laterales (motos)
  'mirror_interior': '2424810031', // Espejos interiores
  'mirror_default': '5029368031', // Espejos retrovisores y partes de repuesto (genérico)
  
  // Luces traseras y pilotos
  'luz_trasera': '2425091031', // Montaje de luces traseras
  'piloto_trasero': '2425236031', // Luces traseras (motos)
  'conjunto_piloto': '52470500031', // Conjuntos de luces traseras
  
  // Faros delanteros
  'faro_delantero': '2425076031', // Montaje de faros
  'faro': '2425228031', // Faros (motos)
  
  // Intermitentes
  'intermitente': '2425083031', // Luces de giro
  'turn_signal': '52470661031', // Conjuntos de intermitentes
  
  // Luces de freno
  'luz_freno': '2425086031', // Tercera luz de freno
  'brake_light': '2425234031', // Luces de freno (motos)
  
  // Elevalunas, interruptores y comandos
  'window_regulator': '2424811031', // Tiradores de ventanilla y elevalunas
  'interruptor_ventana': '2424811031', // Ventana eléctrica (mismo nodo)
  'elementos_mando': '2424789031', // Elementos de mando (acondicionamiento interior)
  'interruptor_boton': '2424813031', // Interruptores de botón
  
  // Cerraduras y dispositivos de cierre
  'cerradura': '2425404031', // Dispositivos de cierre antirrobo
  'door_handle': '2424811031', // Manetas (mismo que elevalunas por categoría)
  
  // Genérico
  'default': '2425091031', // Montaje de luces traseras (más común)
};

// Función para determinar el browse node específico basado en descripción y categoría
const getBrowseNodeFromDescription = (description: string, category: string): string => {
  const desc = description.toLowerCase();
  
  // Para espejos retrovisores
  if (category === 'ESPELHOS RETROVISORES') {
    if (desc.includes('interior')) {
      return BROWSE_NODES_BY_TYPE['mirror_interior'];
    }
    if (desc.includes('lateral')) {
      return BROWSE_NODES_BY_TYPE['mirror_lateral'];
    }
    // Por defecto: espejos completos
    return BROWSE_NODES_BY_TYPE['mirror_completo'];
  }
  
  // Para iluminación, analizar la descripción
  if (category === 'ILUMINACAO(FAROLINS)-VIATURAS EUROPEIAS') {
    if (desc.includes('piloto') || desc.includes('trasero') || desc.includes('traseira')) {
      return BROWSE_NODES_BY_TYPE['piloto_trasero'];
    }
    if (desc.includes('faro') || desc.includes('farol') || desc.includes('delantero')) {
      return BROWSE_NODES_BY_TYPE['faro_delantero'];
    }
    if (desc.includes('intermitente') || desc.includes('pisca')) {
      return BROWSE_NODES_BY_TYPE['intermitente'];
    }
    if (desc.includes('freno') || desc.includes('stop')) {
      return BROWSE_NODES_BY_TYPE['luz_freno'];
    }
    // Por defecto para iluminación
    return BROWSE_NODES_BY_TYPE['conjunto_piloto'];
  }
  
  // Para elevalunas, comandos, cerraduras
  if (category === 'ELEVADORES-PUNHOS-COMANDOS-FECHADURAS') {
    if (desc.includes('eleva') || desc.includes('vidro') || desc.includes('ventana')) {
      return BROWSE_NODES_BY_TYPE['window_regulator'];
    }
    if (desc.includes('interruptor') || desc.includes('botão') || desc.includes('boton')) {
      return BROWSE_NODES_BY_TYPE['interruptor_boton'];
    }
    if (desc.includes('comando') || desc.includes('mando')) {
      return BROWSE_NODES_BY_TYPE['elementos_mando'];
    }
    if (desc.includes('cerradura') || desc.includes('fechadura') || desc.includes('bloqueo')) {
      return BROWSE_NODES_BY_TYPE['cerradura'];
    }
    if (desc.includes('maneta') || desc.includes('puxador') || desc.includes('tirador')) {
      return BROWSE_NODES_BY_TYPE['door_handle'];
    }
    // Por defecto: elevalunas
    return BROWSE_NODES_BY_TYPE['window_regulator'];
  }
  
  return BROWSE_NODES_BY_TYPE['default'];
};

const AmazonConnector = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<AmazonProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const PRODUCTS_PER_PAGE = 100;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        loadProducts();
      }
    });
  }, [navigate, currentPage]);

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      // Obtener total de productos primero
      const { count, error: countError } = await supabase
        .from('vauner_products')
        .select('*', { count: 'exact', head: true })
        .eq('has_image', true)
        .not('translated_title', 'is', null);

      if (countError) throw countError;
      setTotalProducts(count || 0);

      // Cargar productos con paginación
      const from = (currentPage - 1) * PRODUCTS_PER_PAGE;
      const to = from + PRODUCTS_PER_PAGE - 1;

      const { data: productsData, error: productsError } = await supabase
        .from('vauner_products')
        .select('*')
        .eq('has_image', true)
        .not('translated_title', 'is', null)
        .order('created_at', { ascending: false })
        .range(from, to);

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
            requires_manual_review: config.requires_manual_review,
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
      toast.info('🤖 Asignando automáticamente configuración de Amazon a TODOS los productos...');

      let assignedCount = 0;
      let updatedCount = 0;
      
      // Obtener TODOS los productos, no solo los de la página actual
      const { data: allProducts, error: productsError } = await supabase
        .from('vauner_products')
        .select('*')
        .eq('has_image', true)
        .not('translated_title', 'is', null);

      if (productsError) throw productsError;
      if (!allProducts || allProducts.length === 0) {
        toast.warning('No hay productos para procesar');
        return;
      }

      const totalToProcess = allProducts.length;
      toast.info(`Procesando ${totalToProcess} productos...`);

      for (const product of allProducts) {
        const feedType = CATEGORY_TO_FEED_TYPE[product.category || ''];
        
        // Si no hay mapeo directo, marcar para revisión manual
        let requiresManualReview = false;
        if (!feedType) {
          requiresManualReview = true;
          continue; // Skip products without mapping
        }

        // Determinar browse node específico basado en descripción
        const browseNode = getBrowseNodeFromDescription(
          product.description || '', 
          product.category || ''
        );

        const configData: any = {
          product_id: product.id,
          feed_product_type: feedType,
          recommended_browse_node: browseNode,
          requires_manual_review: requiresManualReview,
        };

        // Asignar atributos específicos según el tipo y descripción
        const desc = (product.description || '').toLowerCase();
        const title = (product.translated_title || '').toLowerCase();
        const fullText = (desc + ' ' + title).toLowerCase();
        
        if (feedType === 'mirror') {
          // Determinar posición del espejo
          if (fullText.includes('esquerdo') || fullText.includes('izquierdo') || fullText.includes('left')) {
            configData.mirror_position = 'Izquierda';
          } else if (fullText.includes('direito') || fullText.includes('derecho') || fullText.includes('right')) {
            configData.mirror_position = 'Derecha';
          } else {
            configData.mirror_position = 'Izquierda'; // Default
          }
          
          // Heated: default No
          configData.mirror_heated = fullText.includes('calefacción') || fullText.includes('heated') || fullText.includes('aquecido');
          
          // Folding: SOLO si contiene "REB" (rebatível)
          configData.mirror_folding = fullText.includes('reb');
          
          // Turn signal: default No
          configData.mirror_turn_signal = fullText.includes('intermitente') || fullText.includes('pisca') || fullText.includes('indicator');
          
        } else if (feedType === 'vehicle_light_assembly') {
          // Para FAROLINS, detectar si es delantero o trasero según título
          if (product.category === 'ILUMINACAO(FAROLINS)-VIATURAS EUROPEIAS') {
            // Buscar "delantero" en el título primero
            if (fullText.includes('delantero') || fullText.includes('dianteiro') || fullText.includes('frontal')) {
              configData.light_placement = 'Delantero';
              
              // Determinar lado si está explícito
              if (fullText.includes('esquerdo') || fullText.includes('izquierdo') || fullText.includes('left')) {
                configData.light_placement = 'Delantero izquierdo';
              } else if (fullText.includes('direito') || fullText.includes('derecho') || fullText.includes('right')) {
                configData.light_placement = 'Delantero derecho';
              }
            } else {
              // Por defecto trasero para farolins
              configData.light_placement = 'Parte trasera';
              
              // Determinar lado solo si está explícito
              if (fullText.includes('esquerdo') || fullText.includes('izquierdo') || fullText.includes('left')) {
                configData.light_placement = 'Parte trasera izquierda';
              } else if (fullText.includes('direito') || fullText.includes('derecho') || fullText.includes('right')) {
                configData.light_placement = 'Parte trasera derecha';
              }
            }
          } else {
            // Para otros tipos de iluminación, determinar según descripción
            if (fullText.includes('delantero') || fullText.includes('dianteiro') || fullText.includes('faro') || fullText.includes('headlight')) {
              configData.light_placement = 'Delantero';
            } else if (fullText.includes('trasero') || fullText.includes('traseira') || fullText.includes('rear')) {
              configData.light_placement = 'Parte trasera';
            } else {
              configData.light_placement = 'Parte trasera'; // Default
            }
          }
          
          // Tipo de luz: SOLO asignar si está explícitamente en el título
          if (fullText.includes('led')) {
            configData.light_type = 'LED';
          } else if (fullText.includes('halogen') || fullText.includes('halogeno') || fullText.includes('halógeno')) {
            configData.light_type = 'Halógeno';
          } else if (fullText.includes('xenon') || fullText.includes('xenón')) {
            configData.light_type = 'Xenón';
          } else {
            configData.light_type = ''; // Vacío si no está explícito
          }
          
        } else if (feedType === 'window_regulator') {
          // Determinar lado
          if (fullText.includes('esquerdo') || fullText.includes('izquierdo') || fullText.includes('left')) {
            configData.window_side = 'Izquierda';
          } else if (fullText.includes('direito') || fullText.includes('derecho') || fullText.includes('right')) {
            configData.window_side = 'Derecha';
          } else {
            configData.window_side = 'Izquierda'; // Default
          }
          
          // Número de puertas: SOLO si está explícito, sino vacío
          if (fullText.includes('4 portas') || fullText.includes('4 puertas') || fullText.includes('4-door')) {
            configData.window_doors = '4';
          } else if (fullText.includes('2 portas') || fullText.includes('2 puertas') || fullText.includes('2-door')) {
            configData.window_doors = '2';
          } else if (fullText.includes('5 portas') || fullText.includes('5 puertas') || fullText.includes('5-door')) {
            configData.window_doors = '5';
          } else {
            configData.window_doors = ''; // Vacío si no está explícito
          }
          
          // Mecanismo: Manual o Eléctrico según título
          if (fullText.includes('electr') || fullText.includes('eléctrico') || fullText.includes('elétrico')) {
            configData.window_mechanism = 'Eléctrico';
          } else if (fullText.includes('manual')) {
            configData.window_mechanism = 'Manual';
          } else {
            configData.window_mechanism = 'Eléctrico'; // Default
          }
          
        } else if (feedType === 'door_handle') {
          // Determinar posición
          if (fullText.includes('delantero') || fullText.includes('dianteiro') || fullText.includes('front')) {
            configData.door_placement = 'Delantero';
          } else if (fullText.includes('trasero') || fullText.includes('traseira') || fullText.includes('rear')) {
            configData.door_placement = 'Trasero';
          } else {
            configData.door_placement = 'Delantero'; // Default
          }
          
          // Determinar lado
          if (fullText.includes('esquerdo') || fullText.includes('izquierdo') || fullText.includes('left')) {
            configData.door_placement = configData.door_placement + ' izquierdo';
          } else if (fullText.includes('direito') || fullText.includes('derecho') || fullText.includes('right')) {
            configData.door_placement = configData.door_placement + ' derecho';
          } else {
            configData.door_placement = configData.door_placement + ' izquierdo'; // Default
          }
          
          // Material: Default Plástico
          configData.door_material = fullText.includes('metal') || fullText.includes('aluminio') ? 'Metal' : 'Plástico';
        }

        const { error } = await supabase
          .from('amazon_product_config')
          .upsert(configData, { onConflict: 'product_id' });

        if (error) {
          console.error('Error assigning config:', error);
        } else {
          // Verificar si ya existía config para este producto
          const { data: existingConfig } = await supabase
            .from('amazon_product_config')
            .select('id')
            .eq('product_id', product.id)
            .single();
            
          if (existingConfig) {
            updatedCount++;
          } else {
            assignedCount++;
          }
        }
      }

      const message = assignedCount > 0 && updatedCount > 0
        ? `✅ ${assignedCount} productos configurados, ${updatedCount} actualizados (Total: ${totalToProcess})`
        : assignedCount > 0
        ? `✅ ${assignedCount} productos configurados de ${totalToProcess}`
        : `✅ ${updatedCount} productos actualizados de ${totalToProcess}`;
      
      toast.success(message);
      loadProducts(); // Recargar la página actual
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

    // Crear el workbook y worksheet con estructura Excel
    const wb = XLSX.utils.book_new();
    
    // Crear las 5 filas de encabezado según plantilla Amazon
    const emptyRow = new Array(headers.length).fill('');
    const wsData = [
      headers,
      emptyRow,
      emptyRow,
      emptyRow,
      emptyRow,
      ...amazonData
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Aplicar estilos a la primera fila (encabezados)
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const address = XLSX.utils.encode_col(C) + "1";
      if (!ws[address]) continue;
      ws[address].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "FFFF00" } },
        alignment: { horizontal: "center", vertical: "center" }
      };
    }
    
    // Agregar la hoja al workbook
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    
    // Generar el archivo Excel
    XLSX.writeFile(wb, `amazon-plantilla-${new Date().toISOString().split('T')[0]}.xlsx`);

    toast.success(`✅ Archivo Excel Amazon generado: ${selectedIds.length} productos`);
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
              <>
                <AmazonProductsTable
                  products={products}
                  onSelectionChange={setSelectedIds}
                />
                
                {/* Paginación */}
                <div className="flex items-center justify-between mt-6 pt-6 border-t">
                  <div className="text-sm text-muted-foreground">
                    Mostrando {((currentPage - 1) * PRODUCTS_PER_PAGE) + 1} - {Math.min(currentPage * PRODUCTS_PER_PAGE, totalProducts)} de {totalProducts} productos
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Anterior
                    </Button>
                    <div className="text-sm font-medium px-3">
                      Página {currentPage} de {Math.ceil(totalProducts / PRODUCTS_PER_PAGE)}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => p + 1)}
                      disabled={currentPage >= Math.ceil(totalProducts / PRODUCTS_PER_PAGE)}
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AmazonConnector;
