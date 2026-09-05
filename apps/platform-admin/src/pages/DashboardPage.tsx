import { useEffect, useState } from 'react';

interface FinancialMetrics {
  mrr: number;
  arr: number;
  activeSubscriptions: number;
  trialCount: number;
  churnRate: number;
  cancelledSubscriptions: number;
}

interface GrowthData {
  month: string;
  count: number;
}

interface MrrData {
  month: string;
  mrr: number;
}

interface FunnelData {
  stage: string;
  count: number;
}

interface PlanData {
  planName: string;
  planId: string;
  count: number;
}

export function DashboardPage() {
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [growth, setGrowth] = useState<GrowthData[]>([]);
  const [mrrEvolution, setMrrEvolution] = useState<MrrData[]>([]);
  const [leadFunnel, setLeadFunnel] = useState<FunnelData[]>([]);
  const [planDist, setPlanDist] = useState<PlanData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        const [metricsRes, growthRes, mrrRes, funnelRes, distRes] = await Promise.all([
          fetch('/api/platform/financial'),
          fetch('/api/platform/analytics/subscriber-growth'),
          fetch('/api/platform/analytics/mrr-evolution'),
          fetch('/api/platform/analytics/lead-funnel'),
          fetch('/api/platform/analytics/plan-distribution'),
        ]);

        if (!metricsRes.ok) throw new Error('Não foi possível carregar as métricas');
        const metricsData = (await metricsRes.json()) as { metrics: FinancialMetrics };
        setMetrics(metricsData.metrics);

        if (growthRes.ok) {
          const growthData = (await growthRes.json()) as { data?: GrowthData[] };
          setGrowth(growthData.data || []);
        }

        if (mrrRes.ok) {
          const mrrData = (await mrrRes.json()) as { data?: MrrData[] };
          setMrrEvolution(mrrData.data || []);
        }

        if (funnelRes.ok) {
          const funnelData = (await funnelRes.json()) as { data?: FunnelData[] };
          setLeadFunnel(funnelData.data || []);
        }

        if (distRes.ok) {
          const distData = (await distRes.json()) as { data?: PlanData[] };
          setPlanDist(distData.data || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar os dados');
      } finally {
        setLoading(false);
      }
    }

    void fetchData();
  }, []);

  if (loading) {
    return <div className="text-center py-8">Carregando painel...</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-red-600">Erro: {error}</div>;
  }

  if (!metrics) {
    return <div className="text-center py-8">Nenhum dado disponível</div>;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Painel</h1>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-4 gap-6">
        <StatCard title="Assinaturas Ativas" value={metrics.activeSubscriptions.toString()} />
        <StatCard title="MRR" value={`R$ ${metrics.mrr.toLocaleString('pt-BR')}`} />
        <StatCard title="ARR" value={`R$ ${metrics.arr.toLocaleString('pt-BR')}`} />
        <StatCard title="Taxa de Cancelamento" value={`${metrics.churnRate.toFixed(2)}%`} />
      </div>

      {/* 12-Month Growth */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Crescimento de Assinantes (12 meses)</h2>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {growth.map((g) => (
            <div key={g.month} className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{g.month}</span>
              <div className="flex items-center gap-2">
                <div
                  className="h-2 bg-blue-500 rounded"
                  style={{ width: `${Math.max(g.count * 3, 20)}px` }}
                />
                <span className="text-sm font-semibold">{g.count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* MRR Evolution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Evolução MRR</h2>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {mrrEvolution.map((m) => (
              <div key={m.month} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{m.month}</span>
                <span className="text-sm font-semibold text-green-600">
                  R$ {m.mrr.toLocaleString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Lead Funnel */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Funil de Leads</h2>
          <div className="space-y-2">
            {leadFunnel.map((f) => (
              <div key={f.stage} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{f.stage}</span>
                <div className="flex items-center gap-2">
                  <div
                    className="h-2 bg-purple-500 rounded"
                    style={{ width: `${Math.max(f.count * 5, 20)}px` }}
                  />
                  <span className="text-sm font-semibold">{f.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Plan Distribution */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Assinaturas por Plano</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {planDist.map((p) => (
            <div key={p.planId} className="p-4 bg-gray-50 rounded">
              <p className="text-sm text-gray-600">{p.planName}</p>
              <p className="text-2xl font-bold mt-2">{p.count}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-gray-600 text-sm font-medium">{title}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
    </div>
  );
}
