import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BrandEquivalences } from "@/components/compatibilities/BrandEquivalences";
import { ModelEquivalences } from "@/components/compatibilities/ModelEquivalences";
import { AnalysisTab } from "@/components/compatibilities/AnalysisTab";
import { ConflictsTab } from "@/components/compatibilities/ConflictsTab";
import { StatisticsTab } from "@/components/compatibilities/StatisticsTab";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Compatibilities = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAutoAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-equivalences');
      
      if (error) throw error;
      
      toast({
        title: "Análisis completado",
        description: `Se encontraron ${data.brands_found} marcas y ${data.models_found} modelos para revisar.`,
      });
    } catch (error) {
      console.error('Error analyzing equivalences:', error);
      toast({
        title: "Error",
        description: "No se pudo completar el análisis automático.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Gestión de Compatibilidades</h1>
              <p className="text-muted-foreground">
                Administra las equivalencias entre marcas y modelos
              </p>
            </div>
          </div>
          
          <Button
            onClick={handleAutoAnalyze}
            disabled={isAnalyzing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
            Analizar Automáticamente
          </Button>
        </div>

        <Tabs defaultValue="brands" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="brands">Marcas</TabsTrigger>
            <TabsTrigger value="models">Modelos</TabsTrigger>
            <TabsTrigger value="analysis">Análisis</TabsTrigger>
            <TabsTrigger value="conflicts">Conflictos</TabsTrigger>
            <TabsTrigger value="statistics">Estadísticas</TabsTrigger>
          </TabsList>

          <TabsContent value="brands" className="mt-6">
            <BrandEquivalences />
          </TabsContent>

          <TabsContent value="models" className="mt-6">
            <ModelEquivalences />
          </TabsContent>

          <TabsContent value="analysis" className="mt-6">
            <AnalysisTab />
          </TabsContent>

          <TabsContent value="conflicts" className="mt-6">
            <ConflictsTab />
          </TabsContent>

          <TabsContent value="statistics" className="mt-6">
            <StatisticsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Compatibilities;
