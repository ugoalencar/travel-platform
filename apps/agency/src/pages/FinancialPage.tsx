import { useEffect, useState } from 'react';
import { ArrowDownRight, Clock, Wallet, TrendingUp, AlertTriangle, PiggyBank, Percent } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { KpiChip } from '../components/ui/kpi-chip';
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
  getFinancialSummary,
  getCashFlowReport,
  type FinancialSummary,
  type CashFlowReport,
} from '../lib/api';

// Financial data state shape
type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      summary: FinancialSummary;
      cashFlow: CashFlowReport | null;
    };

export function FinancialPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading' });

    Promise.all([getFinancialSummary(), getCashFlowReport().catch(() => null)])
      .then(([summary, cashFlow]) => {
        if (cancelled) return;
        setState({
          status: 'success',
          summary,
          cashFlow,
        });
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
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Financeiro</h1>
        <LoadingState label="Carregando dados financeiros…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Financeiro</h1>
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

  const { summary, cashFlow } = state;
  const financialSummary = {
    totalSold: summary.salesThisMonth.total,
    received: summary.received,
    pending: summary.pending,
    expectedMargin: summary.expectedMargin,
  };

  const recentPayments = summary.recentPayments.map((p) => ({
    id: p.id,
    customer: p.customerName,
    description: p.description,
    amount: p.amount,
    date: p.occurredAt,
    status: 'Pago' as const,
  }));

  const upcomingReceivables = summary.upcomingReceivables.map((r) => ({
    id: r.id,
    customer: r.customerName,
    description: r.description,
    amount: r.amount,
    dueDate: r.dueAt,
    status: r.status === 'OPEN' ? 'Em aberto' : r.status === 'PARTIALLY_PAID' ? 'Pagamento parcial' : 'Pago',
  }));

  const attentionItems: { label: string; detail: string; tone: 'negative' | 'attention' }[] = [];
  if (summary.dashboard.overdueReceivable > 0) {
    attentionItems.push({
      label: 'Recebíveis vencidos',
      detail: `${formatBRL(summary.dashboard.overdueReceivable)} em atraso`,
      tone: 'negative',
    });
  }
  if (summary.dashboard.overduePayables > 0) {
    attentionItems.push({
      label: 'Contas a pagar vencidas',
      detail: `${formatBRL(summary.dashboard.overduePayables)} em atraso`,
      tone: 'negative',
    });
  }
  if (summary.dashboard.delinquencyRate > 5) {
    attentionItems.push({
      label: 'Inadimplência elevada',
      detail: `${summary.dashboard.delinquencyRate.toFixed(1)}% dos recebíveis`,
      tone: 'attention',
    });
  }
  if (summary.dashboard.monthlyResult < 0) {
    attentionItems.push({
      label: 'Resultado do mês negativo',
      detail: formatBRL(summary.dashboard.monthlyResult),
      tone: 'negative',
    });
  }

  const cashFlowData = cashFlow
    ? [
        { label: 'Atual', value: cashFlow.current_balance },
        { label: '30 dias', value: cashFlow.projection_30_days },
        { label: '60 dias', value: cashFlow.projection_60_days },
        { label: '90 dias', value: cashFlow.projection_90_days },
      ]
    : [];

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-(--color-travel-navy) via-slate-800 to-(--color-travel-cyan)/40 p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Financeiro</p>
            <p className="mt-2 text-sm text-white/70">
              {summary.salesThisMonth.count} venda{summary.salesThisMonth.count !== 1 ? 's' : ''} este mês
            </p>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-white/60">Total vendido (mês)</p>
                <p className="text-3xl font-bold sm:text-4xl">{formatBRL(financialSummary.totalSold)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-white/60">Recebido</p>
                <p className="text-2xl font-bold">{formatBRL(financialSummary.received)}</p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link to="/financial/dre">
              <Button size="sm" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">DRE Gerencial</Button>
            </Link>
            <Link to="/financial/sales/d0d50001-0000-4000-8000-000000000009/story">
              <Button size="sm" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">Historia financeira</Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiChip label="A receber" value={formatBRL(summary.dashboard.totalReceivable)} icon={<Clock className="h-5 w-5" />} tone="blue" />
        <KpiChip label="A pagar" value={formatBRL(summary.dashboard.payablesTotal)} icon={<ArrowDownRight className="h-5 w-5" />} tone="orange" />
        <KpiChip label="Caixa disponível" value={formatBRL(summary.dashboard.cashAvailable)} icon={<PiggyBank className="h-5 w-5" />} tone="green" />
        <KpiChip label="Margem líquida" value={formatBRL(summary.dashboard.netMargin)} icon={<TrendingUp className="h-5 w-5" />} tone="purple" />
        <KpiChip label="Resultado do mês" value={formatBRL(summary.dashboard.monthlyResult)} icon={<Wallet className="h-5 w-5" />} tone={summary.dashboard.monthlyResult >= 0 ? 'green' : 'orange'} />
        <KpiChip label="Inadimplência" value={`${summary.dashboard.delinquencyRate.toFixed(1)}%`} icon={<Percent className="h-5 w-5" />} tone={summary.dashboard.delinquencyRate > 5 ? 'orange' : 'blue'} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {cashFlowData.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Fluxo de caixa projetado</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={cashFlowData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatBRL(v)} width={90} />
                  <Tooltip formatter={(v) => formatBRL(Number(v))} />
                  <Bar dataKey="value" fill="var(--color-action-blue)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {attentionItems.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Atenção</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {attentionItems.map((item) => (
                <div key={item.label} className="flex items-start gap-2.5 rounded-lg border border-slate-100 p-2.5">
                  <span className={`mt-0.5 rounded-full p-1.5 ${item.tone === 'negative' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.detail}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pagamentos recentes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium text-slate-900">{payment.customer}</TableCell>
                    <TableCell>{payment.description}</TableCell>
                    <TableCell>{formatBRL(payment.amount)}</TableCell>
                    <TableCell>{formatDateBR(payment.date, { assumeDateOnly: true })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recebíveis pendentes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingReceivables.map((receivable) => (
                  <TableRow key={receivable.id}>
                    <TableCell className="font-medium text-slate-900">{receivable.customer}</TableCell>
                    <TableCell>{receivable.description}</TableCell>
                    <TableCell>{formatBRL(receivable.amount)}</TableCell>
                    <TableCell>
                      <StatusBadge tone="attention">
                        {formatDateBR(receivable.dueDate, { assumeDateOnly: true })}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
