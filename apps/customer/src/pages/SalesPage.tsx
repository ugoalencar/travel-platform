import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, listCustomers, listSales } from '../lib/api';
import type { Sale } from '../types/sale';
import type { Customer } from '../types/customer';
import { Button } from '../components/ui/button';
import { formatBRL } from '../lib/formatCurrency';
import { getSaleStatusLabel } from '../lib/statusLabels';
import { StatusPill, saleStatusTone } from '../components/ui/StatusPill';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; sales: Sale[]; customersById: Map<string, string> };

export function SalesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading' });

    Promise.all([listSales(), listCustomers().catch(() => [] as Customer[])])
      .then(([sales, customers]) => {
        if (cancelled) return;
        const customersById = new Map(customers.map((c) => [c.id, c.name]));
        setState({ status: 'success', sales, customersById });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar as vendas.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Vendas
        </h1>
        <Button onClick={() => void navigate('/sales/new')}>+ Nova venda</Button>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando vendas...</p>
      )}

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
        <SaleTable sales={state.sales} customersById={state.customersById} />
      )}
    </div>
  );
}

function SaleTable({
  sales,
  customersById,
}: {
  sales: Sale[];
  customersById: Map<string, string>;
}) {
  const navigate = useNavigate();

  if (sales.length === 0) {
    return <p className="text-sm text-slate-500">Nenhuma venda cadastrada ainda.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">Valor</th>
            <th className="px-4 py-3">Desconto</th>
            <th className="px-4 py-3">Total</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((sale) => (
            <tr key={sale.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3 font-medium text-slate-900">
                {customersById.get(sale.customerId) ?? sale.customerId}
              </td>
              <td className="px-4 py-3 text-slate-600">{formatBRL(sale.amount)}</td>
              <td className="px-4 py-3 text-slate-600">{formatBRL(sale.discount)}</td>
              <td className="px-4 py-3 font-medium text-slate-900">{formatBRL(sale.total)}</td>
              <td className="px-4 py-3">
                <StatusPill tone={saleStatusTone(sale.status)}>
                  {getSaleStatusLabel(sale.status)}
                </StatusPill>
              </td>
              <td className="px-4 py-3 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void navigate(`/sales/${sale.id}`)}
                >
                  Detalhes
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
