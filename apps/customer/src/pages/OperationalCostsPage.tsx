import { useEffect, useState } from 'react';
import { ApiError, listOperationalCosts } from '../lib/api';
import type { OperationalCost } from '../types/financial';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; costs: OperationalCost[] };

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

const COST_TYPE_LABELS: Record<string, string> = {
  TRANSPORT: 'Transporte',
  SUPPLIER: 'Fornecedor',
  COMMISSION: 'Comissão',
  PLATFORM_FEE: 'Taxa da plataforma',
  TAX: 'Imposto',
  OTHER: 'Outro',
};

export function OperationalCostsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    listOperationalCosts()
      .then((costs) => {
        if (cancelled) return;
        setState({ status: 'success', costs });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os custos operacionais.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Custos operacionais
        </h1>
        <p className="text-sm text-slate-500">
          Despesas vinculadas a operações de transporte e vendas.
        </p>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando...</p>
      )}

      {state.status === 'error' && (
        <div role="alert" aria-live="assertive" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">
              {state.costs.length} custos
            </span>
          </div>

          {state.costs.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum custo operacional encontrado.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Descrição</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Fornecedor</th>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3 text-right">Previsto</th>
                    <th className="px-4 py-3 text-right">Realizado</th>
                  </tr>
                </thead>
                <tbody>
                  {state.costs.map((cost) => (
                    <tr key={cost.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {cost.description}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {COST_TYPE_LABELS[cost.costType] ?? cost.costType}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {cost.supplierId ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(cost.incurredAt)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {cost.expectedAmount != null ? formatCurrency(cost.expectedAmount) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {cost.actualAmount != null ? formatCurrency(cost.actualAmount) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}
