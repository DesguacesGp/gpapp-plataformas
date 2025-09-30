import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

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
}

interface ProductsTableProps {
  products: Product[];
  onSelectionChange: (selectedIds: string[]) => void;
  searchTerm: string;
  onSearchChange: (search: string) => void;
  categoryFilter: string;
  onCategoryChange: (category: string) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalProducts: number;
  sortField: string;
  sortDirection: "asc" | "desc";
  onSortChange: (field: string) => void;
}

export const ProductsTable = ({ 
  products, 
  onSelectionChange,
  searchTerm,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
  currentPage,
  totalPages,
  onPageChange,
  totalProducts,
  sortField,
  sortDirection,
  onSortChange
}: ProductsTableProps) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [localSearch, setLocalSearch] = useState(searchTerm);

  // Get enabled categories from database
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    // Fetch enabled categories from category_config table
    const loadCategories = async () => {
      const { data, error } = await supabase
        .from('category_config')
        .select('category_name')
        .eq('enabled', true)
        .order('category_name', { ascending: true });

      if (!error && data) {
        setCategories(data.map(cat => cat.category_name));
      }
    };

    loadCategories();
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(localSearch);
    }, 500);

    return () => clearTimeout(timer);
  }, [localSearch, onSearchChange]);

  const SortButton = ({ field, children }: { field: string; children: React.ReactNode }) => {
    const isActive = sortField === field || (field === "ai_processed" && sortField === "ai_processed");
    
    return (
      <Button 
        variant="ghost" 
        onClick={() => onSortChange(field)}
        className="h-8 p-0 hover:bg-transparent font-semibold"
      >
        {children}
        {isActive ? (
          sortDirection === "asc" ? (
            <ArrowUp className="ml-2 h-4 w-4" />
          ) : (
            <ArrowDown className="ml-2 h-4 w-4" />
          )
        ) : (
          <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
        )}
      </Button>
    );
  };

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
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
      onSelectionChange([]);
    } else {
      const allIds = new Set(products.map(p => p.id));
      setSelectedIds(allIds);
      onSelectionChange(Array.from(allIds));
    }
  };

  const renderPaginationItems = () => {
    const items = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        items.push(
          <PaginationItem key={i}>
            <PaginationLink
              onClick={() => onPageChange(i)}
              isActive={currentPage === i}
              className="cursor-pointer"
            >
              {i}
            </PaginationLink>
          </PaginationItem>
        );
      }
    } else {
      // Always show first page
      items.push(
        <PaginationItem key={1}>
          <PaginationLink
            onClick={() => onPageChange(1)}
            isActive={currentPage === 1}
            className="cursor-pointer"
          >
            1
          </PaginationLink>
        </PaginationItem>
      );

      if (currentPage > 3) {
        items.push(
          <PaginationItem key="ellipsis1">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }

      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        items.push(
          <PaginationItem key={i}>
            <PaginationLink
              onClick={() => onPageChange(i)}
              isActive={currentPage === i}
              className="cursor-pointer"
            >
              {i}
            </PaginationLink>
          </PaginationItem>
        );
      }

      if (currentPage < totalPages - 2) {
        items.push(
          <PaginationItem key="ellipsis2">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }

      // Always show last page
      items.push(
        <PaginationItem key={totalPages}>
          <PaginationLink
            onClick={() => onPageChange(totalPages)}
            isActive={currentPage === totalPages}
            className="cursor-pointer"
          >
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }
    
    return items;
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Buscar por SKU o descripción..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => onCategoryChange(e.target.value)}
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
                  checked={selectedIds.size === products.length && products.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>
                <SortButton field="sku">SKU</SortButton>
              </TableHead>
              <TableHead className="w-32">
                <SortButton field="articulo">Artículo</SortButton>
              </TableHead>
              <TableHead className="w-24">
                <SortButton field="marca">Marca</SortButton>
              </TableHead>
              <TableHead className="w-24">
                <SortButton field="modelo">Modelo</SortButton>
              </TableHead>
              <TableHead className="w-40">
                <SortButton field="description">Descripción</SortButton>
              </TableHead>
              <TableHead className="w-32">
                <SortButton field="ai_processed">Título Traducido</SortButton>
              </TableHead>
              <TableHead className="font-semibold w-32">Bullets</TableHead>
              <TableHead className="text-center">
                <SortButton field="stock">Stock</SortButton>
              </TableHead>
              <TableHead className="text-right">
                <SortButton field="price">Precio Base</SortButton>
              </TableHead>
              <TableHead className="text-right">
                <SortButton field="final_price">Precio Final</SortButton>
              </TableHead>
              <TableHead className="text-center">
                <SortButton field="has_image">Imagen</SortButton>
              </TableHead>
              <TableHead className="w-24">
                <SortButton field="category">Categoría</SortButton>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                  No hay productos que mostrar
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(product.id)}
                      onCheckedChange={() => toggleSelect(product.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{product.sku}</TableCell>
                  <TableCell className="text-sm truncate max-w-[130px]">{product.articulo || "-"}</TableCell>
                  <TableCell className="text-sm truncate max-w-[100px]">{product.marca || "-"}</TableCell>
                  <TableCell className="text-sm truncate max-w-[100px]">{product.modelo || "-"}</TableCell>
                  <TableCell className="text-xs truncate max-w-[160px]">{product.description}</TableCell>
                  <TableCell className="max-w-[130px]">
                    {product.translated_title ? (
                      <span className="text-xs truncate block">{product.translated_title}</span>
                    ) : (
                      <Badge variant="outline" className="text-xs">Sin procesar</Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[130px]">
                    {product.bullet_points && product.bullet_points.length > 0 ? (
                      <div className="text-xs">
                        <span className="truncate block">{product.bullet_points[0]}</span>
                        {product.bullet_points.length > 1 && (
                          <span className="text-muted-foreground text-[10px]">+{product.bullet_points.length - 1}</span>
                        )}
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-xs">Sin procesar</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={product.stock > 10 ? "default" : product.stock > 0 ? "secondary" : "destructive"}>
                      {product.stock}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium text-muted-foreground">
                    €{product.price.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-bold text-lg">
                    €{(product.final_price || product.price).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={product.has_image ? "default" : "secondary"}>
                      {product.has_image ? "Sí" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs truncate max-w-[100px]">{product.category || "Sin categoría"}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Mostrando {products.length} de {totalProducts} productos (página {currentPage} de {totalPages})
          {selectedIds.size > 0 && ` • ${selectedIds.size} seleccionados`}
        </div>
        
        {totalPages > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => currentPage > 1 && onPageChange(currentPage - 1)}
                  className={currentPage === 1 ? "pointer-events-none opacity-50 cursor-not-allowed" : "cursor-pointer"}
                />
              </PaginationItem>
              
              {renderPaginationItems()}
              
              <PaginationItem>
                <PaginationNext
                  onClick={() => currentPage < totalPages && onPageChange(currentPage + 1)}
                  className={currentPage === totalPages ? "pointer-events-none opacity-50 cursor-not-allowed" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </div>
  );
};
