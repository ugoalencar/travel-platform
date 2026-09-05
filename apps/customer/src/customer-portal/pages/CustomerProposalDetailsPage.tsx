import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, getMyProposal } from '../../lib/customerApi';
import type { CustomerProposalView } from '../../types/customer-portal';
import { proposalStatusLabel } from '../../lib/statusLabels';
import { BackLink } from '../BackLink';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; proposal: CustomerProposalView };

export function CustomerProposalDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getMyProposal(id)
      .then((proposal) => {
        if (!cancelled) setState({ status: 'success', proposal });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar esta proposta.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="flex flex-col gap-4">
      <BackLink to="/customer-portal/proposals" label="Voltar para minhas propostas" />

      <div aria-live="polite">
        {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
        {state.status === 'error' && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
      </div>

      {state.status === 'success' && <ProposalDetails proposal={state.proposal} />}
    </div>
  );
}

function ProposalDetails({ proposal }: { proposal: CustomerProposalView }) {
  const validUntilDate = proposal.validUntil ? new Date(proposal.validUntil) : null;
  const isExpired = proposal.status === 'EXPIRED' || proposal.status === 'CANCELLED';

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-medium">💡 Informativo</p>
        <p className="mt-1">Esta proposta é apenas informativa. Fale com sua agência para negociar ou confirmar.</p>
      </div>

      <div className={`flex items-start justify-between gap-4 ${isExpired ? 'opacity-75' : ''}`}>
        <div>
          <p className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Valor total</p>
          <h1 className="mt-2 text-4xl font-bold text-slate-900">
            {proposal.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </h1>
        </div>
        <span className={`inline-block rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap ${
          isExpired
            ? 'bg-slate-100 text-slate-800'
            : 'bg-indigo-100 text-indigo-900'
        }`}>
          {proposalStatusLabel(proposal.status)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border-2 border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 mb-3">💰 Valores</h3>
          <div className="space-y-3">
            <DetailItem
              label="Preço proposto"
              value={proposal.proposedPrice.toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            />
            <DetailItem
              label="Desconto"
              value={proposal.discount.toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
              highlight={proposal.discount > 0}
            />
          </div>
        </div>

        {(validUntilDate || proposal.conditions) && (
          <div className="rounded-xl border-2 border-slate-200 bg-gradient-to-br from-indigo-50 to-purple-50 p-5 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 mb-3">📋 Informações</h3>
            <div className="space-y-3">
              {validUntilDate && (
                <DetailItem
                  label="Válido até"
                  value={validUntilDate.toLocaleDateString('pt-BR', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
                />
              )}
              {proposal.conditions && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">Condições</dt>
                  <dd className="mt-1 text-sm text-slate-900">{proposal.conditions}</dd>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {/* Sem controles de aceitar/recusar nesta vertical. */}
    </div>
  );
}

function DetailItem({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</dt>
      <dd className={`mt-1 text-sm font-medium ${highlight ? 'text-green-700' : 'text-slate-900'}`}>{value}</dd>
    </div>
  );
}
