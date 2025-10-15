import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Check, Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  año_desde: string | null;
  año_hasta: string | null;
  raw_data?: any;
  processed_image_url?: string | null;
}

interface ProductsTableProps {
  products: Product[];
  onSelectionChange: (selectedIds: string[]) => void;
  searchTerm: string;
  onSearchChange: (search: string) => void;
  categoryFilter: string;
  onCategoryChange: (category: string) => void;
  articuloFilter: string;
  onArticuloChange: (articulo: string) => void;
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
  articuloFilter,
  onArticuloChange,
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

  // Get enabled categories and articulos from database
  const [categories, setCategories] = useState<string[]>([]);
  const [articulos, setArticulos] = useState<string[]>([]);

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

    // Fetch unique articulos
    const loadArticulos = async () => {
      let allArticulos: string[] = [];
      let from = 0;
      const pageSize = 1000;
      
      while (true) {
        const { data, error } = await supabase
          .from('vauner_products')
          .select('articulo')
          .not('articulo', 'is', null)
          .range(from, from + pageSize - 1);

        if (error || !data || data.length === 0) break;
        
        allArticulos = [...allArticulos, ...data.map(p => p.articulo).filter(Boolean) as string[]];
        
        if (data.length < pageSize) break;
        from += pageSize;
      }
      
      const uniqueArticulos = [...new Set(allArticulos)].sort();
      setArticulos(uniqueArticulos);
    };

    loadCategories();
    loadArticulos();
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
    <TooltipProvider>
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
        <select
          value={articuloFilter}
          onChange={(e) => onArticuloChange(e.target.value)}
          className="px-4 py-2 border rounded-md bg-background"
        >
          <option value="all">Todos los artículos</option>
          {articulos.map(art => (
            <option key={art} value={art}>{art}</option>
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
              <TableHead className="w-24 text-center">Año Desde</TableHead>
              <TableHead className="w-24 text-center">Año Hasta</TableHead>
              <TableHead className="w-40">
                <SortButton field="description">Descripción</SortButton>
              </TableHead>
              <TableHead className="w-20 text-center">
                <SortButton field="ai_processed">Título</SortButton>
              </TableHead>
              <TableHead className="font-semibold w-20 text-center">Bullets</TableHead>
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
                <TableCell colSpan={15} className="text-center py-8 text-muted-foreground">
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
                  <TableCell className="text-center text-xs">
                    {product.año_desde ? (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {product.año_desde.replace('.', '/')}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-xs">
                    {product.año_hasta ? (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {product.año_hasta.replace('.', '/')}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs truncate max-w-[160px]">{product.description}</TableCell>
                  <TableCell className="text-center">
                    <Tooltip>
                      <TooltipTrigger>
                        {product.translated_title ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <Clock className="h-5 w-5 text-muted-foreground mx-auto" />
                        )}
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        <p className="text-xs">
                          {product.translated_title || "Sin procesar"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-center">
                    <Tooltip>
                      <TooltipTrigger>
                        {product.bullet_points && product.bullet_points.length > 0 ? (
                          <div className="flex items-center justify-center gap-1">
                            <Check className="h-5 w-5 text-green-600" />
                            <span className="text-xs font-medium">{product.bullet_points.length}</span>
                          </div>
                        ) : (
                          <Clock className="h-5 w-5 text-muted-foreground mx-auto" />
                        )}
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        {product.bullet_points && product.bullet_points.length > 0 ? (
                          <ul className="text-xs space-y-1 list-disc pl-4">
                            {product.bullet_points.map((bullet, idx) => (
                              <li key={idx}>{bullet}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs">Sin procesar</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
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
                    {product.has_image ? (
                      product.processed_image_url ? (
                        <a 
                          href={product.processed_image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline truncate block max-w-[150px]"
                          title={product.processed_image_url}
                        >
                          Ver imagen
                        </a>
                      ) : product.raw_data?.image ? (
                        <Badge variant="outline" className="border-yellow-500 text-yellow-600 text-xs">
                          ⏳ Pendiente
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-gray-500 text-xs">❌ Sin imagen</Badge>
                      )
                    ) : (
                      <Badge variant="secondary">No</Badge>
                    )}
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
    </TooltipProvider>
  );
};
