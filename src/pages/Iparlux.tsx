import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Download, Package } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const Iparlux = () => {
  const [isSyncingStock, setIsSyncingStock] = useState(false);
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);
  const [isTestingFTP, setIsTestingFTP] = useState(false);
  const [isTestingMySQL, setIsTestingMySQL] = useState(false);
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

  const handleStockSync = async () => {
    setIsSyncingStock(true);
    toast.info("Actualizando stock desde FTP...");
    
    try {
      const { data, error } = await supabase.functions.invoke('iparlux-sync', {
        body: { action: 'sync_catalog' }
      });

      if (error) throw error;

      toast.success(data.message || "Stock actualizado correctamente");
      await loadStats();
    } catch (error: any) {
      console.error('Stock sync error:', error);
      toast.error("Error al actualizar stock: " + error.message);
    } finally {
      setIsSyncingStock(false);
    }
  };

  const handleCatalogSync = async () => {
    setIsSyncingCatalog(true);
    toast.info("Sincronizando catálogo desde MySQL...");
    
    try {
      const { data, error } = await supabase.functions.invoke('iparlux-catalog-sync', {
        body: { action: 'sync_catalog' }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(data.message || "Catálogo sincronizado correctamente");
        await loadStats();
      } else {
        toast.error(data?.message || "Error al sincronizar catálogo");
      }
    } catch (error: any) {
      console.error('Catalog sync error:', error);
      toast.error("Error al conectar con MySQL: " + error.message);
    } finally {
      setIsSyncingCatalog(false);
    }
  };

  const handleTestFTP = async () => {
    setIsTestingFTP(true);
    toast.info("Probando conexión FTP...");
    
    try {
      const { data, error } = await supabase.functions.invoke('iparlux-ftp-test', {
        body: {}
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(data.message, {
          description: `Archivos disponibles: ${data.files?.join(', ')}`
        });
      } else {
        toast.error(data?.message || "Error en test FTP");
      }
    } catch (error: any) {
      console.error('FTP test error:', error);
      toast.error("Error al probar FTP: " + error.message);
    } finally {
      setIsTestingFTP(false);
    }
  };

  const handleTestMySQL = async () => {
    setIsTestingMySQL(true);
    toast.info("Probando conexión MySQL...");
    
    try {
      const { data, error } = await supabase.functions.invoke('iparlux-catalog-sync', {
        body: { action: 'test_connection' }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(data.message, {
          description: `Tablas disponibles: ${data.tables?.join(', ')}`
        });
      } else {
        toast.error(data?.message || "Error en test MySQL");
      }
    } catch (error: any) {
      console.error('MySQL test error:', error);
      toast.error("Error al probar MySQL: " + error.message);
    } finally {
      setIsTestingMySQL(false);
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
          <CardTitle>Pruebas de Conexión</CardTitle>
          <CardDescription>
            Verifica que las conexiones FTP y MySQL funcionen correctamente
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            onClick={handleTestFTP}
            disabled={isTestingFTP}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isTestingFTP ? "animate-spin" : ""}`} />
            Probar FTP
          </Button>

          <Button
            onClick={handleTestMySQL}
            disabled={isTestingMySQL}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isTestingMySQL ? "animate-spin" : ""}`} />
            Probar MySQL
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sincronizaciones</CardTitle>
          <CardDescription>
            Actualiza el stock desde FTP o importa el catálogo completo desde MySQL
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleStockSync}
              disabled={isSyncingStock}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncingStock ? "animate-spin" : ""}`} />
              Actualizar Stock (FTP)
            </Button>

            <Button
              onClick={handleCatalogSync}
              disabled={isSyncingCatalog}
              variant="secondary"
              className="gap-2"
            >
              <Download className={`h-4 w-4 ${isSyncingCatalog ? "animate-spin" : ""}`} />
              Sincronizar Catálogo (MySQL)
            </Button>
          </div>

          <div className="bg-muted p-4 rounded-lg space-y-3">
            <div>
              <h3 className="font-semibold mb-2">📦 Actualización de Stock (FTP)</h3>
              <div className="text-sm space-y-1 text-muted-foreground">
                <p>• Se actualiza cada hora automáticamente</p>
                <p>• FTP: ftpclientes.iparlux.es</p>
                <p>• Usuario: i003777</p>
              </div>
            </div>
            <div className="border-t pt-3">
              <h3 className="font-semibold mb-2">📊 Catálogo Completo (MySQL)</h3>
              <div className="text-sm space-y-1 text-muted-foreground">
                <p>• Servidor: iparlux.es</p>
                <p>• Base de datos: catalogo_iparlux</p>
                <p>• Nota: Requiere configuración adicional</p>
              </div>
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
