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

interface SubscriberTenant {
  id: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
}

interface SupportCase {
  id: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
}

interface HealthInfo {
  status: string;
}

export function DashboardPage() {
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [growth, setGrowth] = useState<GrowthData[]>([]);
  const [mrrEvolution, setMrrEvolution] = useState<MrrData[]>([]);
  const [leadFunnel, setLeadFunnel] = useState<FunnelData[]>([]);
  const [planDist, setPlanDist] = useState<PlanData[]>([]);
  const [activeAgencies, setActiveAgencies] = useState<number | null>(null);
  const [openSupportCases, setOpenSupportCases] = useState<number | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        const [metricsRes, growthRes, mrrRes, funnelRes, distRes, subscribersRes, supportRes, healthRes] =
          await Promise.all([
            fetch('/api/platform/financial'),
            fetch('/api/platform/analytics/subscriber-growth'),
            fetch('/api/platform/analytics/mrr-evolution'),
            fetch('/api/platform/analytics/lead-funnel'),
            fetch('/api/platform/analytics/plan-distribution'),
            fetch('/api/platform/subscribers'),
            fetch('/api/platform/support'),
            fetch('/api/health'),
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

        if (subscribersRes.ok) {
          const subscribersData = (await subscribersRes.json()) as { subscribers?: SubscriberTenant[] };
          const active = (subscribersData.subscribers || []).filter((s) => s.status === 'ACTIVE').length;
          setActiveAgencies(active);
        }

        if (supportRes.ok) {
          const supportData = (await supportRes.json()) as { cases?: SupportCase[] };
          const open = (supportData.cases || []).filter(
            (c) => c.status === 'OPEN' || c.status === 'IN_PROGRESS',
          ).length;
          setOpenSupportCases(open);
        }

        // Real /health check -- no incidents table/endpoint exists anywhere
        // in the backend, so "Incidentes Ativos" (previously hardcoded to
        // "1") is intentionally not shown here; this is the one piece of
        // real operational telemetry the backend actually exposes today.
        if (healthRes.ok) {
          setHealth((await healthRes.json()) as HealthInfo);
        } else {
          setHealth({ status: 'down' });
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
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-(--color-sidebar) via-slate-900 to-(--color-platform-accent)/50 p-8 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Control plane</p>
          <h1 className="mt-1 text-3xl font-bold">Visão Geral da Plataforma</h1>
          <p className="mt-2 text-sm text-white/70">
            Agências assinantes, saúde do sistema e operação de suporte.
          </p>
        </div>
      </div>

      {/* Key Metrics Grid -- per 04_PLATFORM_ADMIN_SEPARATION.md dashboard spec */}
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        <StatCard title="Agências Ativas" value={(activeAgencies ?? metrics.activeSubscriptions).toString()} />
        <StatCard title="MRR" value={`R$ ${metrics.mrr.toLocaleString('pt-BR')}`} />
        <StatCard title="Assinaturas Ativas" value={metrics.activeSubscriptions.toString()} />
        <StatCard title="Taxa de Cancelamento" value={`${metrics.churnRate.toFixed(2)}%`} />
      </div>
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
        <StatCard title="Tickets de Suporte Abertos" value={(openSupportCases ?? 0).toString()} />
        <StatCard
          title="Saúde da API"
          value={health?.status === 'ok' ? 'Operacional' : health ? 'Indisponível' : '—'}
          {...(health ? { accent: health.status === 'ok' ? 'text-emerald-600' : 'text-red-600' } : {})}
        />
        <StatCard title="ARR" value={`R$ ${metrics.arr.toLocaleString('pt-BR')}`} />
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

function StatCard({ title, value, accent }: { title: string; value: string; accent?: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-6 border-t-2 border-violet-500">
      <p className="text-gray-600 text-sm font-medium">{title}</p>
      <p className={`text-3xl font-bold mt-2 ${accent ?? ''}`}>{value}</p>
    </div>
  );
}
