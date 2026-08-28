import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, listMyProposals } from '../../lib/customerApi';
import type { CustomerProposalView } from '../../types/customer-portal';
import { proposalStatusLabel } from '../../lib/statusLabels';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; proposals: CustomerProposalView[] };

export function CustomerProposalsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    listMyProposals()
      .then((proposals) => {
        if (!cancelled) setState({ status: 'success', proposals });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar as propostas.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Minhas propostas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Propostas personalizadas para você.
        </p>
      </div>

      <div aria-live="polite">
        {state.status === 'loading' && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
            <span className="text-sm text-slate-500">Carregando propostas...</span>
          </div>
        )}
        {state.status === 'error' && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
        {state.status === 'success' && state.proposals.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <div className="text-4xl">📋</div>
            <p className="mt-3 text-sm font-medium text-slate-600">Nenhuma proposta ainda</p>
            <p className="mt-1 text-xs text-slate-400">
              Suas propostas aparecerão aqui quando sua agência as enviar.
            </p>
          </div>
        )}
      </div>

      {state.status === 'success' && state.proposals.length > 0 && (
        <div className="flex flex-col gap-4">
          {state.proposals.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProposalCard({ proposal }: { proposal: CustomerProposalView }) {
  const statusColors: Record<string, string> = {
    SENT: 'bg-amber-100 text-amber-800',
    ACCEPTED: 'bg-green-100 text-green-800',
    DECLINED: 'bg-red-100 text-red-800',
    EXPIRED: 'bg-slate-100 text-slate-600',
  };

  const isPending = proposal.status === 'SENT';

  return (
    <Link
      to={`/customer-portal/proposals/${proposal.id}`}
      className={`group block overflow-hidden rounded-xl border shadow-sm transition-all hover:shadow-md ${
        isPending
          ? 'border-amber-200 bg-white hover:border-amber-300'
          : 'border-slate-200 bg-white'
      }`}
    >
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  statusColors[proposal.status] ?? 'bg-slate-100 text-slate-600'
                }`}
              >
                {proposalStatusLabel(proposal.status)}
              </span>
              {isPending && (
                <span className="text-xs font-medium text-amber-600">Aguardando decisão</span>
              )}
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-900">
              {proposal.total.toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </p>
          </div>
          <div className="text-2xl text-slate-300 transition-transform group-hover:translate-x-1">
            →
          </div>
        </div>

        {isPending && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-medium text-amber-800">
              📋 Toque para ver os detalhes e continuar
            </p>
          </div>
        )}
      </div>
    </Link>
  );
}
