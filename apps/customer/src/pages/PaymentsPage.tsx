import { useEffect, useState } from 'react';
import { ApiError, listPayments, listPaymentAllocations } from '../lib/api';
import type { Payment, PaymentAllocation } from '../types/financial';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; payments: Payment[] };

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

const DIRECTION_LABELS: Record<string, string> = {
  IN: 'Entrada',
  OUT: 'Saida',
};

const DIRECTION_STYLES: Record<string, string> = {
  IN: 'bg-green-50 text-green-700',
  OUT: 'bg-red-50 text-red-700',
};

export function PaymentsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [directionFilter, setDirectionFilter] = useState<string>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  const [loadingAllocations, setLoadingAllocations] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    listPayments()
      .then((payments) => {
        if (cancelled) return;
        setState({ status: 'success', payments });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message
            : 'Nao foi possivel carregar os pagamentos.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered =
    state.status === 'success' && directionFilter !== 'ALL'
      ? state.payments.filter((p) => p.direction === directionFilter)
      : state.status === 'success'
        ? state.payments
        : [];

  const handleToggleAllocations = async (paymentId: string) => {
    if (expandedId === paymentId) {
      setExpandedId(null);
      setAllocations([]);
      return;
    }
    setExpandedId(paymentId);
    setLoadingAllocations(true);
    try {
      const allocs = await listPaymentAllocations(paymentId);
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
          Pagamentos
        </h1>
        <p className="text-sm text-slate-500">
          Entradas e saidas de recursos financeiros.
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
            {['ALL', 'IN', 'OUT'].map((d) => (
              <button
                key={d}
                onClick={() => setDirectionFilter(d)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  directionFilter === d
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {d === 'ALL' ? 'Todos' : DIRECTION_LABELS[d] ?? d}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">
              {filtered.length} pagamentos
            </span>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum pagamento encontrado.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Valor</th>
                    <th className="px-4 py-3">Metodo</th>
                    <th className="px-4 py-3">Referencia</th>
                    <th className="px-4 py-3">Alocacoes</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((payment) => (
                    <>
                      <tr
                        key={payment.id}
                        className="border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50"
                        onClick={() => void handleToggleAllocations(payment.id)}
                      >
                        <td className="px-4 py-3">
                          <span className={`rounded-md px-2 py-1 text-xs font-medium ${DIRECTION_STYLES[payment.direction] ?? 'bg-slate-100 text-slate-700'}`}>
                            {DIRECTION_LABELS[payment.direction] ?? payment.direction}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDate(payment.occurredAt)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">
                          {formatCurrency(payment.amount)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {payment.method ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {payment.reference ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {expandedId === payment.id ? '▲' : '▼'}
                        </td>
                      </tr>
                      {expandedId === payment.id && (
                        <tr key={`${payment.id}-alloc`}>
                          <td colSpan={6} className="px-4 py-3 bg-slate-50">
                            {loadingAllocations ? (
                              <p className="text-xs text-slate-500">Carregando alocacoes...</p>
                            ) : allocations.length === 0 ? (
                              <p className="text-xs text-slate-500">Nenhuma alocacao vinculada.</p>
                            ) : (
                              <div className="flex flex-col gap-1">
                                <p className="text-xs font-medium text-slate-600">Alocacoes:</p>
                                {allocations.map((alloc) => (
                                  <div key={alloc.id} className="flex gap-4 text-xs text-slate-600">
                                    <span>{alloc.receivableId ? `Recebivel` : `Payable`}</span>
                                    <span className="font-medium">{formatCurrency(alloc.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
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
