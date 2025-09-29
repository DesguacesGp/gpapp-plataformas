import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Settings, Download, LogOut } from "lucide-react";
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
}

const Index = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

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

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('vauner_products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setProducts(data || []);
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
      // First, ensure config is set
      const { data: existingConfig } = await supabase
        .from('vauner_config')
        .select('*')
        .limit(1);

      if (!existingConfig || existingConfig.length === 0) {
        // Insert default config from the image
        await supabase.from('vauner_config').upsert([
          { config_key: 'vauner_url', config_value: 'https://www.vauner.pt' },
          { config_key: 'vauner_user', config_value: 'innova' },
          { config_key: 'vauner_password', config_value: '89063145' },
          { config_key: 'vauner_guid', config_value: '7mv9iom5mc5d0cd0u3h3iafbe7' },
        ]);
      }

      const { data, error } = await supabase.functions.invoke('vauner-sync', {
        body: {
          action: 'sync_products',
          categories: ['Iluminación', 'Espejos', 'Carrocería']
        }
      });

      if (error) throw error;

      toast.success(data.message || 'Productos sincronizados correctamente');
      loadProducts();
    } catch (error: any) {
      console.error('Error syncing:', error);
      toast.error('Error al sincronizar: ' + error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const exportSelected = () => {
    if (selectedIds.length === 0) {
      toast.warning('Selecciona al menos un producto para exportar');
      return;
    }

    const selectedProducts = products.filter(p => selectedIds.includes(p.id));
    const csv = [
      ['SKU', 'Descripción', 'Stock', 'Precio', 'Imagen', 'Categoría'],
      ...selectedProducts.map(p => [
        p.sku,
        p.description,
        p.stock,
        p.price,
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
  }, [isCheckingAuth]);

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
              <Button variant="outline" size="icon">
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
              <div className="text-3xl font-bold">{products.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Con Imagen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {products.filter(p => p.has_image).length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                €{products.reduce((sum, p) => sum + (p.price * p.stock), 0).toFixed(2)}
              </div>
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
              <div className="flex gap-2">
                <Button
                  onClick={exportSelected}
                  variant="outline"
                  disabled={selectedIds.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar
                </Button>
                <Button
                  onClick={syncFromVauner}
                  disabled={isSyncing}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  Actualizar desde Vauner
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
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
