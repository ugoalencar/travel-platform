import { useEffect, useState } from 'react';
import { ApiError, getFinancialDashboard, listReceivables, listAllocationsForTarget } from '../lib/api';
import type { CashFlowSummary, PaymentAllocation, Receivable } from '../types/financial';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import { getReceivableStatusLabel } from '../lib/statusLabels';
import { StatusPill, receivableStatusTone } from '../components/ui/StatusPill';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; cashFlow: CashFlowSummary; receivables: Receivable[] };

function isOverdue(dueAt: string): boolean {
  return new Date(dueAt) < new Date();
}

function isDueSoon(dueAt: string, days = 7): boolean {
  const due = new Date(dueAt);
  const now = new Date();
  const diff = due.getTime() - now.getTime();
  return diff > 0 && diff <= days * 24 * 60 * 60 * 1000;
}

export function FinancialPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  const [loadingAllocations, setLoadingAllocations] = useState(false);

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

  const handleToggleAllocations = async (receivable: Receivable) => {
    if (expandedId === receivable.id) {
      setExpandedId(null);
      setAllocations([]);
      return;
    }
    setExpandedId(receivable.id);
    setLoadingAllocations(true);
    try {
      const allocs = await listAllocationsForTarget({ receivableId: receivable.id });
      setAllocations(allocs);
    } catch {
      setAllocations([]);
    } finally {
      setLoadingAllocations(false);
    }
  };

  const overdueReceivables =
    state.status === 'success'
      ? state.receivables.filter(
          (r) => r.status !== 'PAID' && r.status !== 'CANCELLED' && isOverdue(r.dueAt),
        )
      : [];

  const upcomingReceivables =
    state.status === 'success'
      ? state.receivables.filter(
          (r) =>
            r.status !== 'PAID' &&
            r.status !== 'CANCELLED' &&
            !isOverdue(r.dueAt) &&
            isDueSoon(r.dueAt),
        )
      : [];

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

          {(overdueReceivables.length > 0 || upcomingReceivables.length > 0) && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Alertas</h2>
              <div className="flex flex-wrap gap-3">
                {overdueReceivables.length > 0 && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3">
                    <p className="text-sm font-medium text-red-700">
                      {overdueReceivables.length} recebivel(is) vencido(s)
                    </p>
                    <p className="text-xs text-red-600">
                      Valor total: {formatBRL(overdueReceivables.reduce((s, r) => s + r.amount, 0))}
                    </p>
                  </div>
                )}
                {upcomingReceivables.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-medium text-amber-700">
                      {upcomingReceivables.length} recebivel(is) vencendo em breve
                    </p>
                    <p className="text-xs text-amber-600">
                      Valor total: {formatBRL(upcomingReceivables.reduce((s, r) => s + r.amount, 0))}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          <ReceivablesTable
            receivables={state.receivables}
            expandedId={expandedId}
            allocations={allocations}
            loadingAllocations={loadingAllocations}
            onToggleAllocations={(r) => { void handleToggleAllocations(r); }}
          />
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

function ReceivablesTable({
  receivables,
  expandedId,
  allocations,
  loadingAllocations,
  onToggleAllocations,
}: {
  receivables: Receivable[];
  expandedId: string | null;
  allocations: PaymentAllocation[];
  loadingAllocations: boolean;
  onToggleAllocations: (receivable: Receivable) => void;
}) {
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
        <table className="w-full min-w-[800px] text-left text-sm">
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
            {receivables.map((receivable) => {
              const overdue = receivable.status !== 'PAID' && receivable.status !== 'CANCELLED' && isOverdue(receivable.dueAt);
              const isExpandable = receivable.status === 'PARTIALLY_PAID';
              return (
                <>
                  <tr
                    key={receivable.id}
                    className={`border-b border-slate-100 last:border-0 ${
                      overdue ? 'bg-red-50/50' : ''
                    } ${isExpandable ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                    onClick={() => {
                      if (isExpandable) onToggleAllocations(receivable);
                    }}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {receivable.description}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{receivable.customerId}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className={overdue ? 'font-medium text-red-600' : ''}>
                        {formatDateBR(receivable.dueAt, { assumeDateOnly: true })}
                      </span>
                      {overdue && (
                        <span className="ml-2 text-xs text-red-500">vencido</span>
                      )}
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
                  {expandedId === receivable.id && (
                    <tr key={`${receivable.id}-detail`}>
                      <td colSpan={5} className="px-4 py-3 bg-slate-50">
                        <PartialPaymentDetail
                          amount={receivable.amount}
                          status={receivable.status}
                          allocations={allocations}
                          loading={loadingAllocations}
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
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
          <span className="font-medium text-slate-900">{formatBRL(amount)}</span>
        </div>
        <div>
          <span className="text-slate-500">Ja pago: </span>
          <span className="font-medium text-blue-700">{formatBRL(paid)}</span>
        </div>
        <div>
          <span className="text-slate-500">Saldo restante: </span>
          <span className={`font-medium ${remaining > 0 ? 'text-amber-700' : 'text-green-700'}`}>
            {formatBRL(remaining)}
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
              <span>Alocacao</span>
              <span className="font-medium">{formatBRL(alloc.amount)}</span>
            </div>
          ))}
        </div>
      ) : status === 'PARTIALLY_PAID' ? (
        <p className="text-slate-500">Pagamentos registrados.</p>
      ) : null}
    </div>
  );
}
