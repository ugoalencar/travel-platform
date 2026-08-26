import { useEffect, useState } from 'react';
import { ApiError, getFinancialDashboard, listReceivables } from '../lib/api';
import type { CashFlowSummary, Receivable } from '../types/financial';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import { getReceivableStatusLabel } from '../lib/statusLabels';
import { StatusPill, receivableStatusTone } from '../components/ui/StatusPill';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; cashFlow: CashFlowSummary; receivables: Receivable[] };

export function FinancialPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading' });

    Promise.all([getFinancialDashboard(), listReceivables()])
      .then(([cashFlow, receivables]) => {
        if (cancelled) return;
        setState({ status: 'success', cashFlow, receivables });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message
            : 'Nao foi possivel carregar o financeiro.';
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
          Financeiro
        </h1>
        <p className="text-sm text-slate-500">
          Caixa projetado, caixa realizado e recebiveis em aberto.
        </p>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando financeiro...</p>
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
        <>
          <CashFlowCards cashFlow={state.cashFlow} />
          <ReceivablesTable receivables={state.receivables} />
        </>
      )}
    </div>
  );
}

function CashFlowCards({ cashFlow }: { cashFlow: CashFlowSummary }) {
  const cards = [
    { label: 'A receber', value: cashFlow.projected.receivablesDue },
    { label: 'A pagar', value: cashFlow.projected.payablesDue },
    { label: 'Saldo projetado', value: cashFlow.projected.balance },
    { label: 'Recebido no periodo', value: cashFlow.realized.paymentsIn },
    { label: 'Pago no periodo', value: cashFlow.realized.paymentsOut },
    { label: 'Saldo realizado', value: cashFlow.realized.balance },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-md border border-slate-200 bg-white p-4"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {card.label}
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {formatBRL(card.value)}
          </p>
        </div>
      ))}
    </section>
  );
}

function ReceivablesTable({ receivables }: { receivables: Receivable[] }) {
  if (receivables.length === 0) {
    return <p className="text-sm text-slate-500">Nenhum recebivel encontrado.</p>;
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Recebiveis</h2>
          <p className="text-sm text-slate-500">
            Titulo, vencimento, valor e status financeiro.
          </p>
        </div>
        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          {receivables.length} itens
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Descricao</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {receivables.map((receivable) => (
              <tr key={receivable.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {receivable.description}
                </td>
                <td className="px-4 py-3 text-slate-600">{receivable.customerId}</td>
                <td className="px-4 py-3 text-slate-600">
                  {formatDateBR(receivable.dueAt, { assumeDateOnly: true })}
                </td>
                <td className="px-4 py-3">
                  <StatusPill tone={receivableStatusTone(receivable.status)}>
                    {getReceivableStatusLabel(receivable.status)}
                  </StatusPill>
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">
                  {formatBRL(receivable.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
