import { useEffect, useState } from 'react';
import { ApiError, listMyPaymentSchedule } from '../../lib/customerApi';
import type { CustomerPaymentScheduleItem } from '../../types/customer-portal';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: CustomerPaymentScheduleItem[] };

function currency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

// Friendly copy for the schedule-item status, distinct from the raw
// enum value -- "menos tabelas administrativas" per the blueprint means
// this reads like a consumer bill, not an internal aging report.
const STATUS_COPY: Record<string, { label: string; className: string }> = {
  OPEN: { label: 'Em aberto', className: 'bg-amber-100 text-amber-900' },
  PARTIALLY_PAID: { label: 'Parcialmente paga', className: 'bg-blue-100 text-blue-900' },
  PAID: { label: 'Paga', className: 'bg-green-100 text-green-900' },
  CANCELLED: { label: 'Cancelada', className: 'bg-slate-100 text-slate-700' },
};

export function CustomerPaymentsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    listMyPaymentSchedule()
      .then((data) => {
        if (!cancelled) setState({ status: 'success', data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar seus pagamentos.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Pagamentos</h1>
        <p className="mt-2 text-slate-600">Acompanhe as parcelas da sua viagem, uma a uma.</p>
      </div>

      <div aria-live="polite">
        {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
        {state.status === 'error' && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            {state.message}
          </div>
        )}
        {state.status === 'success' && state.data.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
            <p className="text-2xl" aria-hidden="true">💳</p>
            <p className="mt-2 text-sm font-medium text-slate-600">
              Nenhuma parcela por aqui ainda.
            </p>
          </div>
        )}
      </div>

      {state.status === 'success' && state.data.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {state.data.map((item) => {
            const status = STATUS_COPY[item.status] ?? {
              label: item.status,
              className: 'bg-slate-100 text-slate-700',
            };
            const progress = item.amount > 0 ? Math.min(1, item.amountPaid / item.amount) : 0;
            return (
              <li
                key={item.id}
                className="rounded-xl border-2 border-blue-100 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{item.description}</p>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}>
                    {status.label}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Vencimento: {new Date(item.dueAt).toLocaleDateString('pt-BR')}
                </p>

                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[#2563eb]"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>

                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Total</p>
                    <p className="text-lg font-bold text-slate-900">{currency(item.amount)}</p>
                  </div>
                  {item.amountRemaining > 0 ? (
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Restante</p>
                      <p className="text-sm font-semibold text-amber-700">
                        {currency(item.amountRemaining)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-green-700">Quitada ✓</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
