import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

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
}

interface ProductsTableProps {
  products: Product[];
  onSelectionChange: (selectedIds: string[]) => void;
}

type SortField = 'sku' | 'description' | 'stock' | 'price' | 'category' | 'translated_title';
type SortDirection = 'asc' | 'desc';

export const ProductsTable = ({ products, onSelectionChange }: ProductsTableProps) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>('sku');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[];

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-2 h-4 w-4" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="ml-2 h-4 w-4" />
      : <ArrowDown className="ml-2 h-4 w-4" />;
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = 
      product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  }).sort((a, b) => {
    let aVal: any = a[sortField];
    let bVal: any = b[sortField];
    
    if (aVal === null || aVal === undefined) aVal = '';
    if (bVal === null || bVal === undefined) bVal = '';
    
    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();
    
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
    onSelectionChange(Array.from(newSelected));
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
      onSelectionChange([]);
    } else {
      const allIds = new Set(filteredProducts.map(p => p.id));
      setSelectedIds(allIds);
      onSelectionChange(Array.from(allIds));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Buscar por SKU o descripción..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-2 border rounded-md bg-background"
        >
          <option value="all">Todas las categorías</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedIds.size === filteredProducts.length && filteredProducts.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>
                <Button 
                  variant="ghost" 
                  onClick={() => handleSort('sku')}
                  className="h-8 p-0 hover:bg-transparent font-semibold"
                >
                  SKU
                  <SortIcon field="sku" />
                </Button>
              </TableHead>
              <TableHead>
                <Button 
                  variant="ghost" 
                  onClick={() => handleSort('description')}
                  className="h-8 p-0 hover:bg-transparent font-semibold"
                >
                  Descripción
                  <SortIcon field="description" />
                </Button>
              </TableHead>
              <TableHead>
                <Button 
                  variant="ghost" 
                  onClick={() => handleSort('translated_title')}
                  className="h-8 p-0 hover:bg-transparent font-semibold"
                >
                  Título Traducido
                  <SortIcon field="translated_title" />
                </Button>
              </TableHead>
              <TableHead>Bullet Points</TableHead>
              <TableHead className="text-center">
                <Button 
                  variant="ghost" 
                  onClick={() => handleSort('stock')}
                  className="h-8 p-0 hover:bg-transparent font-semibold"
                >
                  Stock
                  <SortIcon field="stock" />
                </Button>
              </TableHead>
              <TableHead className="text-right">
                <Button 
                  variant="ghost" 
                  onClick={() => handleSort('price')}
                  className="h-8 p-0 hover:bg-transparent font-semibold"
                >
                  Precio
                  <SortIcon field="price" />
                </Button>
              </TableHead>
              <TableHead className="text-center">Imagen</TableHead>
              <TableHead>
                <Button 
                  variant="ghost" 
                  onClick={() => handleSort('category')}
                  className="h-8 p-0 hover:bg-transparent font-semibold"
                >
                  Categoría
                  <SortIcon field="category" />
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No hay productos que mostrar
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(product.id)}
                      onCheckedChange={() => toggleSelect(product.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{product.sku}</TableCell>
                  <TableCell className="max-w-md truncate">{product.description}</TableCell>
                  <TableCell className="max-w-md">
                    {product.translated_title ? (
                      <span className="text-sm">{product.translated_title}</span>
                    ) : (
                      <Badge variant="outline">Sin procesar</Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {product.bullet_points && product.bullet_points.length > 0 ? (
                      <ul className="text-xs space-y-1 list-disc list-inside">
                        {product.bullet_points.slice(0, 2).map((bullet, idx) => (
                          <li key={idx} className="truncate">{bullet}</li>
                        ))}
                        {product.bullet_points.length > 2 && (
                          <li className="text-muted-foreground">+{product.bullet_points.length - 2} más...</li>
                        )}
                      </ul>
                    ) : (
                      <Badge variant="outline">Sin procesar</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={product.stock > 10 ? "default" : product.stock > 0 ? "secondary" : "destructive"}>
                      {product.stock}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">€{product.price.toFixed(2)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={product.has_image ? "default" : "secondary"}>
                      {product.has_image ? "Sí" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{product.category || "Sin categoría"}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-sm text-muted-foreground">
        Mostrando {filteredProducts.length} de {products.length} productos
        {selectedIds.size > 0 && ` • ${selectedIds.size} seleccionados`}
      </div>
    </div>
  );
};
