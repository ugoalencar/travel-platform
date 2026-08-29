import { useEffect, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { LoadingState } from '../components/ui/loading-state';
import { formatBRL } from '../lib/formatCurrency';

export function DetailedReportsPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => setLoading(false), 500);
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title="Relatórios Detalhados" description="Análise financeira completa." />
        <LoadingState label="Carregando relatórios…" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios Detalhados"
        description="Análise financeira completa."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Relatórios' }]}
      />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>DRE - Demonstração do Resultado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between font-medium">
                <span>Receitas Totais</span>
                <span>{formatBRL(0)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>(-) Despesas</span>
                <span>{formatBRL(0)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-bold">
                <span>Resultado Líquido</span>
                <span>{formatBRL(0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contas Vencidas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Nenhuma conta vencida.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Análise de Margem</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Sem dados de margem disponíveis.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Projeção de Fluxo de Caixa</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Sem projeções disponíveis.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
