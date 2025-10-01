import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";

interface AmazonProduct {
  id: string;
  sku: string;
  description: string;
  category: string | null;
  stock: number;
  final_price?: number;
  price: number;
  translated_title: string | null;
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

interface AmazonProductsTableProps {
  products: AmazonProduct[];
  onSelectionChange: (selectedIds: string[]) => void;
}

export const AmazonProductsTable = ({ products, onSelectionChange }: AmazonProductsTableProps) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = products.map(p => p.id);
      setSelectedIds(allIds);
      onSelectionChange(allIds);
    } else {
      setSelectedIds([]);
      onSelectionChange([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    let newSelected: string[];
    if (checked) {
      newSelected = [...selectedIds, id];
    } else {
      newSelected = selectedIds.filter(selectedId => selectedId !== id);
    }
    setSelectedIds(newSelected);
    onSelectionChange(newSelected);
  };

  const getFeedTypeColor = (feedType: string) => {
    const colors: Record<string, string> = {
      'mirror': 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      'vehicle_light_assembly': 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
      'window_regulator': 'bg-green-500/10 text-green-600 dark:text-green-400',
      'door_handle': 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    };
    return colors[feedType] || 'bg-muted text-muted-foreground';
  };

  const renderSpecificAttributes = (product: AmazonProduct) => {
    const config = product.amazon_config;
    if (!config) return <span className="text-muted-foreground text-sm">-</span>;

    const attrs: string[] = [];

    if (config.feed_product_type === 'mirror') {
      if (config.mirror_position) attrs.push(`Pos: ${config.mirror_position}`);
      if (config.mirror_heated) attrs.push('Calefacción');
      if (config.mirror_folding) attrs.push('Plegable');
      if (config.mirror_turn_signal) attrs.push('Intermitente');
    } else if (config.feed_product_type === 'vehicle_light_assembly') {
      if (config.light_type) attrs.push(`Tipo: ${config.light_type}`);
      if (config.light_placement) attrs.push(`Posición: ${config.light_placement}`);
    } else if (config.feed_product_type === 'window_regulator') {
      if (config.window_side) attrs.push(`Lado: ${config.window_side}`);
      if (config.window_doors) attrs.push(`Puertas: ${config.window_doors}`);
      if (config.window_mechanism) attrs.push(`Mec: ${config.window_mechanism}`);
    } else if (config.feed_product_type === 'door_handle') {
      if (config.door_placement) attrs.push(`Pos: ${config.door_placement}`);
      if (config.door_material) attrs.push(`Mat: ${config.door_material}`);
    }

    return attrs.length > 0 ? (
      <div className="flex flex-wrap gap-1">
        {attrs.map((attr, i) => (
          <Badge key={i} variant="outline" className="text-xs">
            {attr}
          </Badge>
        ))}
      </div>
    ) : (
      <span className="text-muted-foreground text-sm">-</span>
    );
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={selectedIds.length === products.length && products.length > 0}
                onCheckedChange={handleSelectAll}
              />
            </TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Título</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Feed Type</TableHead>
            <TableHead>Browse Node</TableHead>
            <TableHead>Atributos Específicos</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead>Precio</TableHead>
            <TableHead className="text-center">Config</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                No hay productos disponibles. Asegúrate de tener productos con imágenes y procesados por IA.
              </TableCell>
            </TableRow>
          ) : (
            products.map(product => (
              <TableRow key={product.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedIds.includes(product.id)}
                    onCheckedChange={(checked) => handleSelectOne(product.id, checked as boolean)}
                  />
                </TableCell>
                <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                <TableCell className="max-w-xs truncate">
                  {product.translated_title || product.description}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs">
                    {product.category || 'Sin categoría'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {product.amazon_config ? (
                    <Badge className={getFeedTypeColor(product.amazon_config.feed_product_type)}>
                      {product.amazon_config.feed_product_type}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {product.amazon_config?.recommended_browse_node || '-'}
                </TableCell>
                <TableCell>
                  {renderSpecificAttributes(product)}
                </TableCell>
                <TableCell>{product.stock}</TableCell>
                <TableCell>€{(product.final_price || product.price).toFixed(2)}</TableCell>
                <TableCell className="text-center">
                  {product.amazon_config ? (
                    <Check className="h-5 w-5 text-accent mx-auto" />
                  ) : (
                    <X className="h-5 w-5 text-muted-foreground mx-auto" />
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};
