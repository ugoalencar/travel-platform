import { useEffect, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { LoadingState } from '../components/ui/loading-state';
import { formatBRL } from '../lib/formatCurrency';
import { ApiError, getManagementDre, type ManagementDreReport } from '../lib/api';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; dre: ManagementDreReport };

type PeriodPreset = 'current-month' | 'last-3-months' | 'all-time';

function presetRange(preset: PeriodPreset): { from?: string; to?: string } {
  const now = new Date();
  if (preset === 'all-time') {
    return {};
  }
  if (preset === 'current-month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: from.toISOString().split('T')[0]!, to: now.toISOString().split('T')[0]! };
  }
  // last-3-months
  const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  return { from: from.toISOString().split('T')[0]!, to: now.toISOString().split('T')[0]! };
}

interface DreLineProps {
  label: string;
  value: number;
  tone?: 'total' | 'subtotal' | 'deduction' | 'default';
}

function DreLine({ label, value, tone = 'default' }: DreLineProps) {
  const isNegativeLine = tone === 'deduction';
  const displayValue = isNegativeLine ? `- ${formatBRL(Math.abs(value))}` : formatBRL(value);
  const rowClass =
    tone === 'total'
      ? 'flex items-center justify-between border-t-2 border-slate-800 py-3 text-base font-bold text-slate-900'
      : tone === 'subtotal'
        ? 'flex items-center justify-between border-t border-slate-300 py-2 text-sm font-semibold text-slate-800'
        : 'flex items-center justify-between py-1.5 text-sm text-slate-600';
  return (
    <div className={rowClass}>
      <span>{label}</span>
      <span className={value < 0 && tone !== 'deduction' ? 'text-red-600' : undefined}>{displayValue}</span>
    </div>
  );
}

export function DrePage() {
  const [preset, setPreset] = useState<PeriodPreset>('all-time');
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    getManagementDre(presetRange(preset))
      .then((dre) => {
        if (cancelled) return;
        setState({ status: 'success', dre });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar o DRE gerencial.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, [preset]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="DRE Gerencial"
        description="Demonstrativo de resultado simplificado para uso gerencial — não é um demonstrativo contábil/fiscal oficial."
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={preset === 'current-month' ? 'default' : 'outline'}
              onClick={() => setPreset('current-month')}
            >
              Mês atual
            </Button>
            <Button
              size="sm"
              variant={preset === 'last-3-months' ? 'default' : 'outline'}
              onClick={() => setPreset('last-3-months')}
            >
              Últimos 3 meses
            </Button>
            <Button
              size="sm"
              variant={preset === 'all-time' ? 'default' : 'outline'}
              onClick={() => setPreset('all-time')}
            >
              Todo o período
            </Button>
          </div>
        }
      />

      {state.status === 'loading' && <LoadingState label="Carregando DRE gerencial…" />}

      {state.status === 'error' && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <Card>
          <CardHeader>
            <CardTitle>
              Resultado gerencial — {state.dre.period.from} a {state.dre.period.to}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mx-auto max-w-2xl divide-y divide-slate-100">
              <DreLine label="RECEITA BRUTA" value={state.dre.grossRevenue} tone="subtotal" />
              <DreLine label="(-) Descontos comerciais" value={state.dre.commercialDiscounts} tone="deduction" />
              <DreLine label="= RECEITA LÍQUIDA" value={state.dre.netRevenue} tone="total" />

              <DreLine label="(-) Custos diretos de viagem (aéreo + terrestre)" value={state.dre.travelDirectCosts} tone="deduction" />
              <DreLine label="(-) Comissões" value={state.dre.commissions} tone="deduction" />
              <DreLine label="= MARGEM DE CONTRIBUIÇÃO" value={state.dre.contributionMargin} tone="total" />

              <DreLine label="(-) Folha de pagamento" value={state.dre.payroll} tone="deduction" />
              <DreLine label="(-) Despesas administrativas" value={state.dre.administrativeExpenses} tone="deduction" />
              <DreLine label="(-) Marketing" value={state.dre.marketingExpenses} tone="deduction" />
              <DreLine label="= RESULTADO OPERACIONAL" value={state.dre.operatingResult} tone="total" />

              <DreLine label="(-) Despesas financeiras" value={state.dre.financialExpenses} tone="deduction" />
              <DreLine label="(-) Impostos" value={state.dre.taxes} tone="deduction" />
              <DreLine label="= RESULTADO LÍQUIDO GERENCIAL" value={state.dre.netResult} tone="total" />
            </div>
            <p className="mx-auto mt-6 max-w-2xl text-xs text-slate-400">
              Folha de pagamento é apresentada líquida de comissões (já contabilizadas na linha “Comissões” acima)
              para evitar dupla contagem. Despesas administrativas somam todas as categorias de despesa exceto
              viagem, pessoal, marketing e financeiro/impostos — que aparecem em linhas próprias.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
