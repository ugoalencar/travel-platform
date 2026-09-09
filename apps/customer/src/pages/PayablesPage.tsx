import { Fragment, useEffect, useState } from 'react';
import { ApiError, listPayables, listAllocationsForTarget } from '../lib/api';
import type { Payable, PaymentAllocation } from '../types/financial';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; payables: Payable[] };

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

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberto',
  PARTIALLY_PAID: 'Parcial',
  PAID: 'Pago',
  CANCELLED: 'Cancelado',
};

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-amber-50 text-amber-700',
  PARTIALLY_PAID: 'bg-blue-50 text-blue-700',
  PAID: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

export function PayablesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  const [loadingAllocations, setLoadingAllocations] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    listPayables()
      .then((payables) => {
        if (cancelled) return;
        setState({ status: 'success', payables });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar as contas a pagar.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered =
    state.status === 'success' && statusFilter !== 'ALL'
      ? state.payables.filter((p) => p.status === statusFilter)
      : state.status === 'success'
        ? state.payables
        : [];

  const handleToggleAllocations = async (payable: Payable) => {
    if (expandedId === payable.id) {
      setExpandedId(null);
      setAllocations([]);
      return;
    }
    setExpandedId(payable.id);
    setLoadingAllocations(true);
    try {
      const allocs = await listAllocationsForTarget({ payableId: payable.id });
      setAllocations(allocs);
    } catch {
      setAllocations([]);
    } finally {
      setLoadingAllocations(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Contas a pagar
        </h1>
        <p className="text-sm text-slate-500">
          Obrigações financeiras com fornecedores e terceiros.
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
          <div className="flex flex-wrap gap-2">
            {['ALL', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {s === 'ALL' ? 'Todos' : STATUS_LABELS[s] ?? s}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">
              {filtered.length} itens
            </span>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma conta a pagar encontrada.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Descrição</th>
                    <th className="px-4 py-3">Fornecedor</th>
                    <th className="px-4 py-3">Vencimento</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((payable) => (
                    <Fragment key={payable.id}>
                      <tr
                        className={`border-b border-slate-100 last:border-0 ${
                          payable.status === 'PARTIALLY_PAID' ? 'cursor-pointer hover:bg-slate-50' : ''
                        }`}
                        onClick={() => {
                          if (payable.status === 'PARTIALLY_PAID') {
                            void handleToggleAllocations(payable);
                          }
                        }}
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {payable.description}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {payable.supplierId ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDate(payable.dueAt)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-md px-2 py-1 text-xs font-medium ${STATUS_STYLES[payable.status] ?? 'bg-slate-100 text-slate-700'}`}>
                            {STATUS_LABELS[payable.status] ?? payable.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">
                          {formatCurrency(payable.amount)}
                        </td>
                      </tr>
                      {expandedId === payable.id && (
                        <tr key={`${payable.id}-detail`}>
                          <td colSpan={5} className="px-4 py-3 bg-slate-50">
                            <PartialPaymentDetail
                              amount={payable.amount}
                              status={payable.status}
                              allocations={allocations}
                              loading={loadingAllocations}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
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

function PartialPaymentDetail({
  amount,
  status,
  allocations,
  loading,
}: {
  amount: number;
  status: string;
  allocations: PaymentAllocation[];
  loading: boolean;
}) {
  const paid = allocations.reduce((sum, a) => sum + a.amount, 0);
  const remaining = amount - paid;

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex gap-6">
        <div>
          <span className="text-slate-500">Valor original: </span>
          <span className="font-medium text-slate-900">{formatCurrency(amount)}</span>
        </div>
        <div>
          <span className="text-slate-500">Já pago: </span>
          <span className="font-medium text-blue-700">{formatCurrency(paid)}</span>
        </div>
        <div>
          <span className="text-slate-500">Saldo restante: </span>
          <span className={`font-medium ${remaining > 0 ? 'text-amber-700' : 'text-green-700'}`}>
            {formatCurrency(remaining)}
          </span>
        </div>
      </div>
      {loading ? (
        <p className="text-slate-500">Carregando pagamentos...</p>
      ) : allocations.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-slate-600">Pagamentos relacionados:</span>
          {allocations.map((alloc) => (
            <div key={alloc.id} className="flex gap-4 text-slate-600">
              <span>Alocação</span>
              <span className="font-medium">{formatCurrency(alloc.amount)}</span>
            </div>
          ))}
        </div>
      ) : status === 'PARTIALLY_PAID' ? (
        <p className="text-slate-500">Pagamentos registrados.</p>
      ) : null}
    </div>
  );
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}
