import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, getSaleMargin } from '../lib/api';
import type { SaleMargin } from '../types/financial';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; margin: SaleMargin };

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function SaleMarginPage() {
  const { saleId } = useParams<{ saleId: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!saleId) return;
    let cancelled = false;
    setState({ status: 'loading' });

    getSaleMargin(saleId)
      .then((margin) => {
        if (cancelled) return;
        setState({ status: 'success', margin });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message
            : 'Nao foi possivel carregar a margem.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, [saleId]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Margem da venda
        </h1>
        <p className="text-sm text-slate-500">
          Detalhamento de receita, custos e margem desta venda.
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
        <MarginDetail margin={state.margin} />
      )}
    </div>
  );
}

function MarginDetail({ margin }: { margin: SaleMargin }) {
  const marginPercent = margin.revenue > 0
    ? ((margin.margin / margin.revenue) * 100).toFixed(1)
    : '0.0';

  const rows = [
    { label: 'Receita', value: margin.revenue, highlight: false },
    { label: 'Custos com fornecedores', value: -margin.supplierCosts, highlight: false },
    { label: 'Custos operacionais', value: -margin.operationalCosts, highlight: false },
    { label: 'Comissao', value: -margin.commission, highlight: false },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-600">{row.label}</td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">
                  {formatCurrency(row.value)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 bg-slate-50">
              <td className="px-4 py-3 font-semibold text-slate-900">Margem</td>
              <td className="px-4 py-3 text-right">
                <span className={`text-lg font-bold ${margin.margin >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {formatCurrency(margin.margin)}
                </span>
                <span className="ml-2 text-sm text-slate-500">
                  ({marginPercent}%)
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Venda: {margin.saleId}
      </p>
    </div>
  );
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}
