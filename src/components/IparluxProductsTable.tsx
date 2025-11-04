import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Package } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface IparluxProduct {
  id: string;
  sku: string;
  description: string;
  category: string | null;
  price: number;
  stock: number;
  referencia: string | null;
  marca: string | null;
  modelo: string | null;
  año_desde: string | null;
  año_hasta: string | null;
  has_image: boolean;
  image_jpg_url: string | null;
  processed_image_url: string | null;
}

interface IparluxProductsTableProps {
  products: IparluxProduct[];
  searchTerm: string;
  onSearchChange: (search: string) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalProducts: number;
  sortField: string;
  sortDirection: "asc" | "desc";
  onSortChange: (field: string) => void;
}

export const IparluxProductsTable = ({ 
  products, 
  searchTerm,
  onSearchChange,
  currentPage,
  totalPages,
  onPageChange,
  totalProducts,
  sortField,
  sortDirection,
  onSortChange
}: IparluxProductsTableProps) => {

  const SortButton = ({ field, children }: { field: string; children: React.ReactNode }) => {
    const isActive = sortField === field;
    
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
      <div className="flex gap-4 items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Buscar por SKU o descripción..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          Total: <span className="font-semibold">{totalProducts.toLocaleString()}</span> productos
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortButton field="sku">SKU</SortButton>
              </TableHead>
              <TableHead className="min-w-[300px]">Descripción</TableHead>
              <TableHead className="w-32">
                <SortButton field="marca">Marca</SortButton>
              </TableHead>
              <TableHead className="w-40">
                <SortButton field="modelo">Modelo</SortButton>
              </TableHead>
              <TableHead className="w-24 text-center">Años</TableHead>
              <TableHead className="w-32">
                <SortButton field="category">Categoría</SortButton>
              </TableHead>
              <TableHead className="text-right w-24">
                <SortButton field="price">Precio</SortButton>
              </TableHead>
              <TableHead className="text-center w-20">
                <SortButton field="stock">Stock</SortButton>
              </TableHead>
              <TableHead className="text-center w-24">Imagen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay productos que mostrar</p>
                  <p className="text-sm mt-2">Sincroniza el catálogo para ver los datos</p>
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium font-mono text-sm">
                    {product.sku}
                  </TableCell>
                  <TableCell className="text-sm">
                    {product.description}
                  </TableCell>
                  <TableCell className="text-sm">
                    {product.marca || "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {product.modelo || "-"}
                  </TableCell>
                  <TableCell className="text-center">
                    {product.año_desde || product.año_hasta ? (
                      <div className="flex gap-1 justify-center">
                        {product.año_desde && (
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {product.año_desde}
                          </Badge>
                        )}
                        {product.año_hasta && (
                          <>
                            <span className="text-xs text-muted-foreground">-</span>
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {product.año_hasta}
                            </Badge>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {product.category ? (
                      <Badge variant="secondary" className="text-xs">
                        {product.category}
                      </Badge>
                    ) : "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {product.price > 0 ? `${product.price.toFixed(2)}€` : "-"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={product.stock > 0 ? "default" : "secondary"}>
                      {product.stock}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {product.has_image ? (
                      <Badge variant={product.processed_image_url ? "default" : "secondary"} className="text-xs">
                        {product.processed_image_url ? "✓" : "Pendiente"}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Página {currentPage} de {totalPages}
          </div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              {renderPaginationItems()}
              <PaginationItem>
                <PaginationNext 
                  onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                  className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
};
