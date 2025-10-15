import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";

interface Category {
  id: string;
  category_code: string;
  category_name: string;
  enabled: boolean;
}

export default function Settings() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStats, setImportStats] = useState<{ inserted: number; updated: number; errors: number } | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('category_config')
        .select('*')
        .order('category_name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error loading categories:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las categorías",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = async (categoryId: string, currentState: boolean) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('category_config')
        .update({ enabled: !currentState })
        .eq('id', categoryId);

      if (error) throw error;

      setCategories(prev =>
        prev.map(cat =>
          cat.id === categoryId ? { ...cat, enabled: !currentState } : cat
        )
      );

      toast({
        title: "Categoría actualizada",
        description: "Los cambios se aplicarán en la próxima sincronización",
      });
    } catch (error) {
      console.error('Error updating category:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar la categoría",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleImportCompatibilities = async () => {
    if (!csvFile) {
      sonnerToast.error('Por favor selecciona un archivo CSV');
      return;
    }
    
    setImporting(true);
    setImportProgress(0);
    setImportStats(null);
    
    try {
      const csvText = await csvFile.text();
      
      sonnerToast.info('Importando compatibilidades...');
      
      const { data, error } = await supabase.functions.invoke('import-vehicle-compatibility', {
        body: { csv: csvText }
      });
      
      if (error) throw error;
      
      setImportStats(data);
      setImportProgress(100);
      sonnerToast.success(`Importación completada: ${data.inserted} insertados, ${data.updated} actualizados`);
    } catch (error: any) {
      console.error('Error importing:', error);
      sonnerToast.error(error.message || 'Error al importar compatibilidades');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver al Dashboard
          </Button>
          
          <h1 className="text-3xl font-bold">Configuración</h1>
          <p className="text-muted-foreground mt-2">
            Gestiona las categorías que se sincronizarán desde Vauner
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Categorías de Productos</CardTitle>
            <CardDescription>
              Activa o desactiva las categorías que quieres sincronizar. Los cambios
              se aplicarán en la próxima sincronización con Vauner.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {categories.map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="space-y-0.5">
                      <Label
                        htmlFor={`category-${category.id}`}
                        className="text-base font-medium cursor-pointer"
                      >
                        {category.category_name}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Código: {category.category_code}
                      </p>
                    </div>
                    <Switch
                      id={`category-${category.id}`}
                      checked={category.enabled}
                      onCheckedChange={() => toggleCategory(category.id, category.enabled)}
                      disabled={saving}
                    />
                  </div>
                ))}

                {categories.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No hay categorías configuradas
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Importar Compatibilidades Vauner</CardTitle>
            <CardDescription>
              Carga el CSV con marcas, modelos y referencias OEM/equivalentes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Input 
                type="file" 
                accept=".csv" 
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                disabled={importing}
              />
              <Button 
                onClick={handleImportCompatibilities} 
                disabled={importing || !csvFile}
              >
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Importar
                  </>
                )}
              </Button>
            </div>
            
            {importing && (
              <Progress value={importProgress} className="mt-4" />
            )}
            
            {importStats && (
              <div className="mt-4 text-sm space-y-1 p-4 bg-muted rounded-lg">
                <p>✅ <strong>Insertados:</strong> {importStats.inserted}</p>
                <p>🔄 <strong>Actualizados:</strong> {importStats.updated}</p>
                <p>❌ <strong>Errores:</strong> {importStats.errors}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Información</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              • Las categorías desactivadas no se sincronizarán en futuras actualizaciones
            </p>
            <p>
              • Los productos existentes de categorías desactivadas permanecerán en la base de datos
            </p>
            <p>
              • El procesamiento IA se ejecuta automáticamente para todos los productos nuevos
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
