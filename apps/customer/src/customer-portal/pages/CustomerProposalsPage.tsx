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
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Minhas propostas</h1>
        <p className="mt-2 text-slate-600">Revise as propostas da sua agência e customize sua viagem</p>
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p className="font-medium">💡 Informativo</p>
          <p className="mt-1">Fale com sua agência para negociar condições ou fazer perguntas sobre as propostas.</p>
        </div>
      </div>

      <div aria-live="polite">
        {state.status === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="h-2 w-2 rounded-full bg-slate-300 animate-pulse"></div>
            Carregando...
          </div>
        )}
        {state.status === 'error' && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-medium">Ocorreu um erro</p>
            <p className="mt-1">{state.message}</p>
          </div>
        )}
        {state.status === 'success' && state.proposals.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
            <p className="text-2xl" aria-hidden="true">📋</p>
            <p className="mt-2 text-sm font-medium text-slate-600">Nenhuma proposta no momento.</p>
            <p className="mt-1 text-xs text-slate-500">Você receberá propostas assim que sua agência as enviar!</p>
          </div>
        )}
      </div>
      {state.status === 'success' && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {state.proposals.map((proposal) => (
            <li key={proposal.id}>
              <ProposalCard proposal={proposal} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProposalCard({ proposal }: { proposal: CustomerProposalView }) {
  const statusColorClass = getProposalStatusColor(proposal.status);
  const isExpired = proposal.status === 'EXPIRED' || proposal.status === 'CANCELLED';
  const validUntilDate = proposal.validUntil ? new Date(proposal.validUntil) : null;

  return (
    <Link
      to={`/customer-portal/proposals/${proposal.id}`}
      className={`block rounded-xl border-2 p-5 shadow-md hover:shadow-lg transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
        isExpired
          ? 'border-slate-200 bg-white hover:border-slate-300 focus-visible:outline-slate-600 opacity-75'
          : 'border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 hover:border-indigo-300 focus-visible:outline-indigo-600'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-2xl" aria-hidden="true">📊</span>
        <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${statusColorClass}`}>
          {proposalStatusLabel(proposal.status)}
        </span>
      </div>

      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-600">Valor total</p>
        <p className="mt-1 text-3xl font-bold text-slate-900">
          {proposal.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </p>
      </div>

      <div className="space-y-2 border-t border-slate-200 pt-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Preço proposto:</span>
          <span className="font-medium text-slate-900">
            {proposal.proposedPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        </div>
        {proposal.discount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) !== 'R$ 0,00' && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Desconto:</span>
            <span className="font-medium text-green-700">
              {proposal.discount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
        )}
        {validUntilDate && (
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-2 pt-2 border-t border-slate-200">
            <span aria-hidden="true">⏰</span>
            <span>Válida até {validUntilDate.toLocaleDateString('pt-BR')}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

function getProposalStatusColor(status: string): string {
  const colors: Record<string, string> = {
    DRAFT: 'bg-slate-100 text-slate-800',
    SENT: 'bg-blue-100 text-blue-800',
    ACCEPTED: 'bg-green-100 text-green-800',
    DECLINED: 'bg-red-100 text-red-800',
    EXPIRED: 'bg-orange-100 text-orange-800',
    CANCELLED: 'bg-red-100 text-red-800',
  };
  return colors[status] || 'bg-slate-100 text-slate-800';
}
