import { useEffect, useState } from 'react';
import { AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { LoadingState } from '../components/ui/loading-state';
import { StatCard } from '../components/ui/stat-card';
import { formatBRL } from '../lib/formatCurrency';
import {
  ApiError,
  getDREReport,
  getOverdueReport,
  getMarginReport,
  getCashFlowReport,
  type DREReport,
  type OverdueReport,
  type MarginReport,
  type CashFlowReport,
} from '../lib/api';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      dre: DREReport;
      overdue: OverdueReport;
      margin: MarginReport;
      cashFlow: CashFlowReport;
    };

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return { startDate: toISODate(startOfMonth), endDate: toISODate(now) };
}

export function DetailedReportsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [dateRange, setDateRange] = useState(defaultDateRange);

  useEffect(() => {
    let cancelled = false;

    const fetchReports = async () => {
      setState({ status: 'loading' });

      try {
        const [dre, overdue, margin, cashFlow] = await Promise.all([
          getDREReport(dateRange.startDate, dateRange.endDate),
          getOverdueReport(dateRange.startDate, dateRange.endDate),
          getMarginReport(dateRange.startDate, dateRange.endDate),
          getCashFlowReport(dateRange.startDate, dateRange.endDate),
        ]);

        if (cancelled) return;

        setState({
          status: 'success',
          dre,
          overdue,
          margin,
          cashFlow,
        });
      } catch (error: unknown) {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os relatórios financeiros.';
        setState({ status: 'error', message });
      }
    };

    void fetchReports();

    return () => {
      cancelled = true;
    };
  }, [dateRange]);

  const handleDateChange = (type: 'startDate' | 'endDate', value: string) => {
    setDateRange((prev) => ({
      ...prev,
      [type]: value,
    }));
  };

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Relatórios Detalhados" description="Análise financeira completa." />
        <LoadingState label="Carregando relatórios…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="space-y-6">
        <PageHeader title="Relatórios Detalhados" description="Análise financeira completa." />
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
            <div className="text-sm text-red-800">
              <p className="font-semibold">Erro ao carregar relatórios</p>
              <p>{state.message}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { dre, overdue, margin, cashFlow } = state;

  const resultadoTone =
    dre.resultado_liquido > 0 ? 'positive' : dre.resultado_liquido < 0 ? 'negative' : 'neutral';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios Detalhados"
        description="Análise financeira completa."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Relatórios' }]}
      />

      {/* Date Range Filter */}
      <Card>
        <CardContent className="flex gap-4 pt-6">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700">Data Inicial</label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700">Data Final</label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Receitas Totais"
          value={formatBRL(dre.receitas_totais)}
          delta={`Período: ${dateRange.startDate} até ${dateRange.endDate}`}
          deltaTone="positive"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Despesas Totais"
          value={formatBRL(dre.despesas_totais)}
          delta={`${Math.round((dre.despesas_totais / (dre.receitas_totais || 1)) * 100)}% das receitas`}
          deltaTone="neutral"
          icon={<TrendingDown className="h-4 w-4" />}
        />
        <StatCard
          label="Margem"
          value={`${margin.margin_percentage.toFixed(2)}%`}
          delta={formatBRL(margin.margin_amount)}
          deltaTone={margin.margin_percentage > 0 ? 'positive' : 'negative'}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Resultado Líquido"
          value={formatBRL(dre.resultado_liquido)}
          delta={resultadoTone === 'positive' ? 'Positivo' : resultadoTone === 'negative' ? 'Negativo' : 'Neutro'}
          deltaTone={resultadoTone}
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      {/* DRE - Demonstração do Resultado */}
      <Card>
        <CardHeader>
          <CardTitle>DRE - Demonstração do Resultado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between font-medium">
              <span>Receitas Totais</span>
              <span>{formatBRL(dre.receitas_totais)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>(-) Despesas</span>
              <span>{formatBRL(dre.despesas_totais)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-bold">
              <span>Resultado Líquido</span>
              <span className={dre.resultado_liquido > 0 ? 'text-green-600' : dre.resultado_liquido < 0 ? 'text-red-600' : ''}>
                {formatBRL(dre.resultado_liquido)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contas Vencidas (Overdue Accounts) */}
      <Card>
        <CardHeader>
          <CardTitle>Contas Vencidas</CardTitle>
        </CardHeader>
        <CardContent>
          {overdue.count > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-red-50 p-4">
                  <p className="text-sm text-red-600">Total em Atraso</p>
                  <p className="text-2xl font-bold text-red-700">{formatBRL(overdue.total_amount)}</p>
                </div>
                <div className="rounded-lg bg-orange-50 p-4">
                  <p className="text-sm text-orange-600">Quantidade de Contas</p>
                  <p className="text-2xl font-bold text-orange-700">{overdue.count}</p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-slate-900">Análise de Vencimento:</h4>
                {overdue.aging_breakdown.map((item, index) => (
                  <div key={index} className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-700">
                        {item.days_overdue_start === item.days_overdue_end
                          ? `${item.days_overdue_start} dias`
                          : `${item.days_overdue_start} - ${item.days_overdue_end} dias`}
                      </p>
                      <p className="text-xs text-slate-500">{item.count} contas</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{formatBRL(item.amount)}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">Nenhuma conta vencida.</p>
          )}
        </CardContent>
      </Card>

      {/* Análise de Margem */}
      <Card>
        <CardHeader>
          <CardTitle>Análise de Margem</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm text-blue-600">Margem (%)</p>
                <p className="text-2xl font-bold text-blue-700">{margin.margin_percentage.toFixed(2)}%</p>
              </div>
              <div className="rounded-lg bg-green-50 p-4">
                <p className="text-sm text-green-600">Margem (Valor)</p>
                <p className="text-2xl font-bold text-green-700">{formatBRL(margin.margin_amount)}</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-4">
                <p className="text-sm text-slate-600">Receitas</p>
                <p className="text-2xl font-bold text-slate-900">{formatBRL(margin.receitas)}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 rounded-lg bg-slate-50 p-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-700">Custos</p>
                <p className="text-lg font-bold text-slate-900">{formatBRL(margin.custos)}</p>
              </div>
              <div className="h-12 w-1 bg-slate-300" />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-700">% sobre Receitas</p>
                <p className="text-lg font-bold text-slate-900">
                  {((margin.custos / (margin.receitas || 1)) * 100).toFixed(2)}%
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Projeção de Fluxo de Caixa */}
      <Card>
        <CardHeader>
          <CardTitle>Projeção de Fluxo de Caixa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg bg-slate-900 p-4 text-white">
                <p className="text-sm opacity-75">Saldo Atual</p>
                <p className="text-2xl font-bold">{formatBRL(cashFlow.current_balance)}</p>
              </div>
              <div className="rounded-lg bg-indigo-50 p-4">
                <p className="text-sm text-indigo-600">Projeção 30 dias</p>
                <p className="text-2xl font-bold text-indigo-700">{formatBRL(cashFlow.projection_30_days)}</p>
                <p className="text-xs text-indigo-500 mt-1">
                  {cashFlow.projection_30_days > cashFlow.current_balance ? '+' : ''}
                  {formatBRL(cashFlow.projection_30_days - cashFlow.current_balance)}
                </p>
              </div>
              <div className="rounded-lg bg-purple-50 p-4">
                <p className="text-sm text-purple-600">Projeção 60 dias</p>
                <p className="text-2xl font-bold text-purple-700">{formatBRL(cashFlow.projection_60_days)}</p>
                <p className="text-xs text-purple-500 mt-1">
                  {cashFlow.projection_60_days > cashFlow.current_balance ? '+' : ''}
                  {formatBRL(cashFlow.projection_60_days - cashFlow.current_balance)}
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-cyan-50 p-4">
              <p className="text-sm text-cyan-600">Projeção 90 dias</p>
              <p className="text-2xl font-bold text-cyan-700">{formatBRL(cashFlow.projection_90_days)}</p>
              <p className="text-xs text-cyan-500 mt-1">
                {cashFlow.projection_90_days > cashFlow.current_balance ? '+' : ''}
                {formatBRL(cashFlow.projection_90_days - cashFlow.current_balance)}
              </p>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900">Saldo Projetado (Final do Período)</span>
                <span
                  className={`text-lg font-bold ${
                    cashFlow.projected_balance > 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {formatBRL(cashFlow.projected_balance)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
