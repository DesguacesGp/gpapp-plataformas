import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, X, Trash2 } from "lucide-react";

interface ModelEquivalence {
  id: string;
  vauner_model: string;
  reference_model: string;
  vauner_brand: string;
  reference_brand: string;
  confidence_level: 'high' | 'medium' | 'low';
  is_active: boolean;
  created_by: 'manual' | 'auto';
  notes?: string;
}

export const ModelEquivalences = () => {
  const [equivalences, setEquivalences] = useState<ModelEquivalence[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  const loadEquivalences = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('model_equivalences')
        .select('*')
        .order('vauner_brand')
        .order('vauner_model');
      
      if (error) throw error;
      setEquivalences((data as any) || []);
    } catch (error) {
      console.error('Error loading model equivalences:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las equivalencias de modelos.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEquivalences();
  }, []);

  const handleToggleActive = async (id: string, currentState: boolean) => {
    try {
      const { error } = await supabase
        .from('model_equivalences')
        .update({ is_active: !currentState })
        .eq('id', id);
      
      if (error) throw error;
      
      await loadEquivalences();
      toast({
        title: "Actualizado",
        description: "Estado de la equivalencia actualizado.",
      });
    } catch (error) {
      console.error('Error toggling active state:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('model_equivalences')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      await loadEquivalences();
      toast({
        title: "Eliminado",
        description: "Equivalencia eliminada correctamente.",
      });
    } catch (error) {
      console.error('Error deleting equivalence:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar la equivalencia.",
        variant: "destructive",
      });
    }
  };

  const getConfidenceBadge = (level: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      high: { variant: "default", label: "Alta" },
      medium: { variant: "secondary", label: "Media" },
      low: { variant: "outline", label: "Baja" },
    };
    
    const config = variants[level] || variants.low;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const filteredEquivalences = equivalences.filter(eq =>
    eq.vauner_brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
    eq.reference_brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
    eq.vauner_model.toLowerCase().includes(searchTerm.toLowerCase()) ||
    eq.reference_model.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Input
          placeholder="Buscar marca o modelo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Marca Vauner</TableHead>
              <TableHead>Modelo Vauner</TableHead>
              <TableHead>Marca Referencia</TableHead>
              <TableHead>Modelo Referencia</TableHead>
              <TableHead>Confianza</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEquivalences.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No hay equivalencias de modelos. Usa "Analizar Automáticamente" para generar sugerencias.
                </TableCell>
              </TableRow>
            ) : (
              filteredEquivalences.map((eq) => (
                <TableRow key={eq.id}>
                  <TableCell className="font-medium">{eq.vauner_brand}</TableCell>
                  <TableCell>{eq.vauner_model}</TableCell>
                  <TableCell className="font-medium">{eq.reference_brand}</TableCell>
                  <TableCell>{eq.reference_model}</TableCell>
                  <TableCell>{getConfidenceBadge(eq.confidence_level)}</TableCell>
                  <TableCell>
                    {eq.is_active ? (
                      <Badge variant="default">Activo</Badge>
                    ) : (
                      <Badge variant="outline">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleActive(eq.id, eq.is_active)}
                      >
                        {eq.is_active ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(eq.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
