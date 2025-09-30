import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Stats {
  totalProducts: number;
  withYears: number;
  withoutYears: number;
  brandEquivalences: number;
  modelEquivalences: number;
}

export const StatisticsTab = () => {
  const [stats, setStats] = useState<Stats>({
    totalProducts: 0,
    withYears: 0,
    withoutYears: 0,
    brandEquivalences: 0,
    modelEquivalences: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);
      try {
        const [productsResult, brandsResult, modelsResult] = await Promise.all([
          supabase.from('vauner_products').select('id', { count: 'exact' }),
          supabase.from('brand_equivalences').select('id', { count: 'exact' }),
          supabase.from('model_equivalences').select('id', { count: 'exact' }),
        ]);

        const totalProducts = productsResult.count || 0;
        
        // Count products with years separately
        const { count: withYearsCount } = await supabase
          .from('vauner_products')
          .select('id', { count: 'exact', head: true })
          .not('año_desde', 'is', null);
        
        const withYears = withYearsCount || 0;

        setStats({
          totalProducts,
          withYears,
          withoutYears: totalProducts - withYears,
          brandEquivalences: brandsResult.count || 0,
          modelEquivalences: modelsResult.count || 0,
        });
      } catch (error) {
        console.error('Error loading statistics:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  if (loading) {
    return <div className="text-center py-8">Cargando estadísticas...</div>;
  }

  const matchPercentage = stats.totalProducts > 0
    ? ((stats.withYears / stats.totalProducts) * 100).toFixed(1)
    : "0";

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Productos Totales</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{stats.totalProducts}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Con Compatibilidad</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-green-600">{stats.withYears}</p>
          <p className="text-sm text-muted-foreground">{matchPercentage}% del total</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sin Compatibilidad</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-orange-600">{stats.withoutYears}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Equivalencias de Marcas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{stats.brandEquivalences}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Equivalencias de Modelos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{stats.modelEquivalences}</p>
        </CardContent>
      </Card>
    </div>
  );
};
