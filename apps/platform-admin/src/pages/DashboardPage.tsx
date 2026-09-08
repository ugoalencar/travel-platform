import { useEffect, useState } from 'react';
import {
  Building2,
  DollarSign,
  CreditCard,
  TrendingDown,
  MessageSquare,
  AlertTriangle,
  HeartPulse,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { KpiCard } from '../components/ui/stat-card';
import { SectionCard } from '../components/ui/section-card';

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

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

export function DashboardPage() {
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [growth, setGrowth] = useState<GrowthData[]>([]);
  const [mrrEvolution, setMrrEvolution] = useState<MrrData[]>([]);
  const [leadFunnel, setLeadFunnel] = useState<FunnelData[]>([]);
  const [planDist, setPlanDist] = useState<PlanData[]>([]);
  const [activeAgencies, setActiveAgencies] = useState<number | null>(null);
  const [openSupportCases, setOpenSupportCases] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        const [metricsRes, growthRes, mrrRes, funnelRes, distRes, subscribersRes, supportRes] =
          await Promise.all([
            fetch('/api/platform/financial'),
            fetch('/api/platform/analytics/subscriber-growth'),
            fetch('/api/platform/analytics/mrr-evolution'),
            fetch('/api/platform/analytics/lead-funnel'),
            fetch('/api/platform/analytics/plan-distribution'),
            fetch('/api/platform/subscribers'),
            fetch('/api/platform/support'),
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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar os dados');
      } finally {
        setLoading(false);
      }
    }

    void fetchData();
  }, []);

  if (loading) {
    return <div className="py-8 text-center text-sm text-slate-500">Carregando painel...</div>;
  }

  if (error) {
    return <div className="py-8 text-center text-red-600">Erro: {error}</div>;
  }

  if (!metrics) {
    return <div className="py-8 text-center text-sm text-slate-500">Nenhum dado disponível</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Visão Geral da Plataforma</h1>
        <p className="mt-1 text-sm text-slate-500">
          KPIs de governança do SaaS — agências assinantes, saúde do sistema e operação de suporte.
        </p>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Agências Ativas"
          value={(activeAgencies ?? metrics.activeSubscriptions).toString()}
          icon={Building2}
          accent="neutral"
        />
        <KpiCard label="MRR" value={formatBRL(metrics.mrr)} icon={DollarSign} accent="revenue" />
        <KpiCard
          label="Assinaturas Ativas"
          value={metrics.activeSubscriptions.toString()}
          icon={CreditCard}
          accent="success"
        />
        <KpiCard
          label="Taxa de Cancelamento"
          value={`${metrics.churnRate.toFixed(2)}%`}
          icon={TrendingDown}
          accent={metrics.churnRate > 5 ? 'expense' : 'pending'}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Tickets de Suporte Abertos"
          value={(openSupportCases ?? 0).toString()}
          icon={MessageSquare}
          accent="pending"
        />
        <KpiCard label="Incidentes Ativos" value="1" icon={AlertTriangle} accent="expense" />
        <KpiCard label="Saúde do Sistema" value="Saudável" icon={HeartPulse} accent="success" />
        <KpiCard label="ARR" value={formatBRL(metrics.arr)} icon={Wallet} accent="revenue" />
      </div>

      {/* 12-Month Growth + MRR Evolution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Crescimento de Agências" description="Assinantes ativos por mês (12 meses)">
          <div className="h-64 w-full">
            {growth.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={growth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Agências" fill="#7c3aed" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </SectionCard>

        <SectionCard title="Receita Recorrente (MRR)" description="Evolução mensal do MRR">
          <div className="h-64 w-full">
            {mrrEvolution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mrrEvolution}>
                  <defs>
                    <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6d28d9" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#6d28d9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="#94a3b8"
                    tickFormatter={(v: number) => `R$${Math.round(v / 1000)}k`}
                  />
                  <Tooltip formatter={(value: number) => formatBRL(Number(value))} />
                  <Area
                    type="monotone"
                    dataKey="mrr"
                    name="MRR"
                    stroke="#6d28d9"
                    strokeWidth={2}
                    fill="url(#mrrGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Lead Funnel */}
        <SectionCard title="Funil de Leads" description="Aquisição de novas agências">
          <div className="space-y-3">
            {leadFunnel.length > 0 ? (
              leadFunnel.map((f) => (
                <div key={f.stage} className="flex items-center justify-between gap-3">
                  <span className="w-32 shrink-0 text-sm text-slate-600">{f.stage}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-violet-500"
                      style={{
                        width: `${Math.min(100, (f.count / Math.max(...leadFunnel.map((x) => x.count), 1)) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm font-semibold text-slate-900">{f.count}</span>
                </div>
              ))
            ) : (
              <EmptyChart />
            )}
          </div>
        </SectionCard>

        {/* Plan Distribution */}
        <SectionCard title="Assinaturas por Plano" description="Distribuição atual da base de agências">
          <div className="grid grid-cols-2 gap-3">
            {planDist.length > 0 ? (
              planDist.map((p) => (
                <div key={p.planId} className="rounded-lg bg-violet-50/60 p-4 ring-1 ring-inset ring-violet-100">
                  <p className="text-xs font-medium text-slate-500">{p.planName}</p>
                  <p className="mt-1.5 text-2xl font-extrabold text-violet-700">{p.count}</p>
                </div>
              ))
            ) : (
              <EmptyChart />
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full min-h-[8rem] items-center justify-center text-sm text-slate-400">
      Sem dados suficientes.
    </div>
  );
}
