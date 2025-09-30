import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PricingConfig {
  id: string;
  category: string;
  margin_percentage: number;
  shipping_cost: number;
  vat_percentage: number;
}

const Pricing = () => {
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<PricingConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from('pricing_config')
        .select('*')
        .order('category');

      if (error) throw error;
      setConfigs(data || []);
    } catch (error: any) {
      console.error('Error loading configs:', error);
      toast.error('Error al cargar configuración: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const updateConfig = (id: string, field: keyof PricingConfig, value: number) => {
    setConfigs(configs.map(c => 
      c.id === id ? { ...c, [field]: value } : c
    ));
  };

  const saveConfig = async (config: PricingConfig) => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('pricing_config')
        .update({
          margin_percentage: config.margin_percentage,
          shipping_cost: config.shipping_cost,
          vat_percentage: config.vat_percentage,
        })
        .eq('id', config.id);

      if (error) throw error;
      toast.success('Configuración guardada');
    } catch (error: any) {
      console.error('Error saving config:', error);
      toast.error('Error al guardar: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const calculateFinalPrice = (basePrice: number, margin: number, vat: number, shipping: number) => {
    return (basePrice * (1 + margin / 100) * (1 + vat / 100)) + shipping;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Cargando configuración...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-5xl">
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver al catálogo
          </Button>
          <h1 className="text-4xl font-bold tracking-tight">Configuración de Pricing</h1>
          <p className="text-muted-foreground mt-2">
            Configura márgenes, IVA y costes de envío por categoría
          </p>
        </div>

        <div className="space-y-4">
          {configs.map((config) => (
            <Card key={config.id}>
              <CardHeader>
                <CardTitle>{config.category}</CardTitle>
                <CardDescription>
                  Ejemplo: €10 base → €{calculateFinalPrice(10, config.margin_percentage, config.vat_percentage, config.shipping_cost).toFixed(2)} final
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor={`margin-${config.id}`}>
                      Margen (%)
                    </Label>
                    <Input
                      id={`margin-${config.id}`}
                      type="number"
                      min="0"
                      max="1000"
                      step="0.1"
                      value={config.margin_percentage}
                      onChange={(e) => updateConfig(config.id, 'margin_percentage', parseFloat(e.target.value) || 0)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Ej: 30% de margen sobre precio base
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`vat-${config.id}`}>
                      IVA (%)
                    </Label>
                    <Input
                      id={`vat-${config.id}`}
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={config.vat_percentage}
                      onChange={(e) => updateConfig(config.id, 'vat_percentage', parseFloat(e.target.value) || 0)}
                    />
                    <p className="text-xs text-muted-foreground">
                      IVA aplicado sobre precio + margen
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`shipping-${config.id}`}>
                      Envío (€)
                    </Label>
                    <Input
                      id={`shipping-${config.id}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={config.shipping_cost}
                      onChange={(e) => updateConfig(config.id, 'shipping_cost', parseFloat(e.target.value) || 0)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Coste fijo de envío
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <Button
                    onClick={() => saveConfig(config)}
                    disabled={isSaving}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Guardar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-6 bg-muted/50">
          <CardHeader>
            <CardTitle className="text-lg">Fórmula de Cálculo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-sm">
              Precio Final = (Precio Base × (1 + Margen%) × (1 + IVA%)) + Envío
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Pricing;