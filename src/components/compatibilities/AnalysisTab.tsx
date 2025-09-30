import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Product {
  id: string;
  sku: string;
  marca: string;
  modelo: string;
  año_desde: string | null;
  año_hasta: string | null;
}

export const AnalysisTab = () => {
  const [unmatchedProducts, setUnmatchedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUnmatchedProducts = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('vauner_products')
          .select('id, sku, marca, modelo')
          .not('marca', 'is', null)
          .not('modelo', 'is', null)
          .limit(100);
        
        if (error) throw error;
        
        // Filter products without years client-side to avoid TypeScript issues with column names
        const filtered = (data as any[] || [])
          .filter((p: any) => !p.año_desde)
          .map((p: any) => ({
            id: p.id,
            sku: p.sku,
            marca: p.marca,
            modelo: p.modelo,
            año_desde: null,
            año_hasta: null,
          }));
        
        setUnmatchedProducts(filtered);
      } catch (error) {
        console.error('Error loading unmatched products:', error);
      } finally {
        setLoading(false);
      }
    };

    loadUnmatchedProducts();
  }, []);

  if (loading) {
    return <div className="text-center py-8">Cargando análisis...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          Productos sin Compatibilidad ({unmatchedProducts.length})
        </h3>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {unmatchedProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  ¡Todos los productos tienen compatibilidad asignada!
                </TableCell>
              </TableRow>
            ) : (
              unmatchedProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                  <TableCell>{product.marca}</TableCell>
                  <TableCell>{product.modelo}</TableCell>
                  <TableCell>
                    <Badge variant="outline">Sin años</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
