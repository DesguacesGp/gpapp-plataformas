import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Download, Package } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const Iparlux = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    withImages: 0,
    processed: 0
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const { data, error } = await supabase
        .from('iparlux_products')
        .select('has_image, processed_image_url');
      
      if (error) throw error;

      const total = data?.length || 0;
      const withImages = data?.filter(p => p.has_image).length || 0;
      const processed = data?.filter(p => p.processed_image_url).length || 0;
      
      setStats({ total, withImages, processed });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    toast.info("Conectando al FTP de Iparlux...");
    
    try {
      const { data, error } = await supabase.functions.invoke('iparlux-sync', {
        body: { action: 'sync_catalog' }
      });

      if (error) throw error;

      toast.success(data.message || "Catálogo sincronizado correctamente");
      
      // Reload statistics
      await loadStats();
    } catch (error: any) {
      console.error('Sync error:', error);
      toast.error("Error al sincronizar: " + error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Panel Iparlux</h1>
          <p className="text-muted-foreground mt-1">
            Gestión de productos del proveedor Iparlux
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Productos</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              productos en catálogo
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Con Imágenes</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.withImages.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              con URLs de imágenes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Procesados</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.processed.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              imágenes procesadas
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Acciones</CardTitle>
          <CardDescription>
            Operaciones disponibles para el catálogo de Iparlux
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleSync}
              disabled={isSyncing}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
              Sincronizar Catálogo FTP
            </Button>

            <Button variant="outline" className="gap-2" disabled>
              <Download className="h-4 w-4" />
              Exportar a Excel
            </Button>
          </div>

          <div className="bg-muted p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Información de Conexión</h3>
            <div className="text-sm space-y-1 text-muted-foreground">
              <p>• FTP: ftpclientes.iparlux.es</p>
              <p>• Usuario: i003777</p>
              <p>• Imágenes: http://www.iparlux.es/imagenes/catalogo/</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Productos Iparlux</CardTitle>
          <CardDescription>
            Listado de productos (próximamente)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>La tabla de productos se mostrará aquí</p>
            <p className="text-sm mt-2">Primero sincroniza el catálogo para ver los datos</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Iparlux;
