import { useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Clock,
  Plane,
  Bus,
  Wallet,
  Landmark,
  PieChart as PieChartIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { SectionCard } from '../components/ui/section-card';
import { StatCard } from '../components/ui/stat-card';
import { StatusBadge } from '../components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { LoadingState } from '../components/ui/loading-state';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import {
  ApiError,
  getAirLandConvergenceSummary,
  getCashFlowMonthlySeries,
  getFinancialSummary,
  getSaleFinancialStory,
  type AirLandConvergenceSummary,
  type CashFlowMonthlyPoint,
  type FinancialSummary,
  type SaleFinancialStory,
} from '../lib/api';

const MARIANA_SALE_ID = 'd0d50001-0000-4000-8000-000000000009';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      summary: FinancialSummary;
      airLand: AirLandConvergenceSummary | null;
      cashFlow: CashFlowMonthlyPoint[];
      story: SaleFinancialStory | null;
    };

const MARGIN_COLORS = ['#2563eb', '#0d9488', '#d97706', '#dc2626'];

export function FinancialPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading' });

    Promise.all([
      getFinancialSummary(),
      getAirLandConvergenceSummary().catch(() => null),
      getCashFlowMonthlySeries(6).catch(() => []),
      getSaleFinancialStory(MARIANA_SALE_ID).catch(() => null),
    ])
      .then(([summary, airLand, cashFlow, story]) => {
        if (cancelled) return;
        setState({ status: 'success', summary, airLand, cashFlow, story });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar os dados financeiros.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader
          title="Financeiro"
          description="Visão consolidada de vendas, recebimentos e margem esperada da agência."
        />
        <LoadingState label="Carregando dados financeiros…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div>
        <PageHeader
          title="Financeiro"
          description="Visão consolidada de vendas, recebimentos e margem esperada da agência."
        />
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {state.message}
        </div>
      </div>
    );
  }

  const { summary, airLand, cashFlow, story } = state;
  const { dashboard } = summary;

  const recentPayments = summary.recentPayments.slice(0, 5).map((p) => ({
    id: p.id,
    customer: p.customerName,
    description: p.description,
    amount: p.amount,
    date: p.occurredAt,
  }));

  const upcomingReceivables = summary.upcomingReceivables.slice(0, 5).map((r) => ({
    id: r.id,
    customer: r.customerName,
    description: r.description,
    amount: r.amount,
    dueDate: r.dueAt,
  }));

  const marginPieData = [
    { name: 'Receita do mês', value: Math.max(summary.salesThisMonth.total, 0) },
    { name: 'Margem esperada', value: Math.max(summary.expectedMargin, 0) },
  ].filter((d) => d.value > 0);

  const marginRatio =
    summary.salesThisMonth.total > 0
      ? Math.round((summary.expectedMargin / summary.salesThisMonth.total) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Controle financeiro completo e integração total da operação."
        actions={
          <div className="flex gap-2">
            <Link to="/financial/dre">
              <Button size="sm" variant="outline">DRE Gerencial</Button>
            </Link>
            <Link to={`/financial/sales/${MARIANA_SALE_ID}/story`}>
              <Button size="sm" variant="outline">História financeira</Button>
            </Link>
          </div>
        }
      />

      {/* Top KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Receita do mês"
          value={formatBRL(summary.salesThisMonth.total)}
          delta={`${summary.salesThisMonth.count} venda${summary.salesThisMonth.count !== 1 ? 's' : ''}`}
          deltaTone="positive"
          icon={<Banknote className="h-4 w-4" />}
          accent="revenue"
        />
        <StatCard
          label="Despesas do mês"
          value={formatBRL(dashboard.expensesThisMonth)}
          delta="Custos, comissões e folha"
          deltaTone="negative"
          icon={<ArrowDownRight className="h-4 w-4" />}
          accent="expense"
        />
        <StatCard
          label="Margem esperada"
          value={formatBRL(summary.expectedMargin)}
          delta={summary.salesThisMonth.total > 0 ? `${marginRatio}% sobre a receita do mês` : 'Sem dados'}
          deltaTone="positive"
          icon={<PieChartIcon className="h-4 w-4" />}
          accent="success"
        />
        <StatCard
          label="A receber"
          value={formatBRL(dashboard.totalReceivable)}
          delta={`${formatBRL(dashboard.overdueReceivable)} em atraso`}
          deltaTone={dashboard.overdueReceivable > 0 ? 'negative' : 'neutral'}
          icon={<Clock className="h-4 w-4" />}
          accent="pending"
        />
        <StatCard
          label="A pagar"
          value={formatBRL(dashboard.payablesTotal)}
          delta={`${formatBRL(dashboard.overduePayables)} em atraso`}
          deltaTone={dashboard.overduePayables > 0 ? 'negative' : 'neutral'}
          icon={<ArrowUpRight className="h-4 w-4" />}
          accent="expense"
        />
        <StatCard
          label="Caixa disponível"
          value={formatBRL(dashboard.cashAvailable)}
          delta={`${formatBRL(dashboard.committedCash)} comprometido (30 dias)`}
          deltaTone="neutral"
          icon={<Wallet className="h-4 w-4" />}
          accent="neutral"
        />
      </div>

      {/* Aéreo / Terrestre / Convergência */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
                <Plane className="h-3.5 w-3.5" />
              </span>
              Aéreo
            </span>
          }
          description="Vendas e operação aérea"
          actions={
            <Link to="/operations/air" className="text-xs font-semibold text-blue-600 hover:underline">
              Ver detalhes
            </Link>
          }
        >
          {airLand ? (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <MiniMetric label="Lançamentos" value={String(airLand.air.bookingCount)} />
              <MiniMetric label="Fornecedores" value={String(airLand.air.supplierCount)} />
              <MiniMetric label="Custos" value={formatBRL(airLand.air.cost)} />
              <MiniMetric label="Receita" value={formatBRL(airLand.air.revenue)} />
            </div>
          ) : (
            <p className="text-sm text-slate-400">Sem dados de aéreo.</p>
          )}
        </SectionCard>

        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
                <Landmark className="h-3.5 w-3.5" />
              </span>
              Convergência financeira
            </span>
          }
          description="Aéreo + Terrestre alimentam todo o ciclo"
          className="border-blue-100 bg-blue-50/40"
        >
          <div className="flex flex-col items-center gap-3 text-center text-sm text-slate-600">
            <div className="flex items-center gap-3 text-slate-400">
              <Plane className="h-5 w-5" />
              <span>→</span>
              <Wallet className="h-5 w-5" />
              <span>→</span>
              <Banknote className="h-5 w-5" />
              <span>→</span>
              <Bus className="h-5 w-5" />
            </div>
            <p>
              Toda a operação (Aéreo e Terrestre) converge para um único fluxo financeiro,
              garantindo controle, precisão e rentabilidade em tempo real.
            </p>
            {airLand && (
              <div className="mt-1 grid w-full grid-cols-2 gap-3 rounded-md bg-white/70 p-3 text-left">
                <MiniMetric label="Receita combinada" value={formatBRL(airLand.combinedRevenue)} />
                <MiniMetric label="Margem combinada" value={formatBRL(airLand.combinedMargin)} />
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-white">
                <Bus className="h-3.5 w-3.5" />
              </span>
              Terrestre
            </span>
          }
          description="Vendas e operação terrestre"
          actions={
            <Link to="/operations/land" className="text-xs font-semibold text-blue-600 hover:underline">
              Ver detalhes
            </Link>
          }
        >
          {airLand ? (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <MiniMetric label="Lançamentos" value={String(airLand.land.bookingCount)} />
              <MiniMetric label="Fornecedores" value={String(airLand.land.supplierCount)} />
              <MiniMetric label="Custos" value={formatBRL(airLand.land.cost)} />
              <MiniMetric label="Receita" value={formatBRL(airLand.land.revenue)} />
            </div>
          ) : (
            <p className="text-sm text-slate-400">Sem dados de terrestre.</p>
          )}
        </SectionCard>
      </div>

      {/* Compact overview tables + sale story */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="Contas a receber"
          description="Próximos recebíveis em aberto"
          actions={
            <Link to="/financial/receivables" className="text-xs font-semibold text-blue-600 hover:underline">
              Ver todas
            </Link>
          }
          contentClassName="p-0"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Vencimento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {upcomingReceivables.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-slate-900">{r.customer}</TableCell>
                  <TableCell>{formatBRL(r.amount)}</TableCell>
                  <TableCell>
                    <StatusBadge tone="attention">
                      {formatDateBR(r.dueDate, { assumeDateOnly: true })}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>

        <SectionCard
          title="Pagamentos recentes"
          description="Últimas entradas confirmadas"
          actions={
            <Link to="/financial/payables" className="text-xs font-semibold text-blue-600 hover:underline">
              Ver todas
            </Link>
          }
          contentClassName="p-0"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentPayments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium text-slate-900">{p.customer}</TableCell>
                  <TableCell>{formatBRL(p.amount)}</TableCell>
                  <TableCell>{formatDateBR(p.date, { assumeDateOnly: true })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>

        <SectionCard
          title="História financeira da venda"
          description={story ? `${story.customerName} — ${story.tripName ?? 'Viagem'}` : undefined}
          actions={
            story && (
              <Link
                to={`/financial/sales/${MARIANA_SALE_ID}/story`}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                Ver completa
              </Link>
            )
          }
        >
          {story ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <MiniMetric label="Venda bruta" value={formatBRL(story.grossSale)} />
              <MiniMetric label="Recebido" value={formatBRL(story.received)} />
              <MiniMetric label="A receber" value={formatBRL(story.remainingReceivable)} />
              <MiniMetric label="Margem líquida" value={formatBRL(story.margin.netMargin)} />
            </div>
          ) : (
            <p className="text-sm text-slate-400">Sem venda representativa disponível.</p>
          )}
        </SectionCard>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Fluxo de caixa" description="Entradas e saídas dos últimos 6 meses">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cashFlow}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  tickFormatter={(v: number) => `R$ ${Math.round(v / 1000)}mil`}
                />
                <Tooltip formatter={(value: number) => formatBRL(Number(value))} />
                <Legend />
                <Bar dataKey="paymentsIn" name="Entradas" fill="#0d9488" radius={[3, 3, 0, 0]} />
                <Bar dataKey="paymentsOut" name="Saídas" fill="#dc2626" radius={[3, 3, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="paymentsIn"
                  name="Tendência"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Composição de margem" description="Receita do mês vs. margem esperada">
          <div className="h-64 w-full">
            {marginPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={marginPieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {marginPieData.map((entry, index) => (
                      <Cell key={entry.name} fill={MARGIN_COLORS[index % MARGIN_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatBRL(Number(value))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Sem dados suficientes para o mês.
              </div>
            )}
          </div>
        </SectionCard>
      </div>

    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm font-bold text-slate-900">{value}</div>
    </div>
  );
}
