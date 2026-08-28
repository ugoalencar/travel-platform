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
  return (
    <>
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        Esta proposta é apenas informativa. Fale com sua agência para negociar ou confirmar.
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {proposal.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      </h1>
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Detail label="Status" value={proposalStatusLabel(proposal.status)} />
          <Detail
            label="Preço proposto"
            value={proposal.proposedPrice.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}
          />
          <Detail
            label="Desconto"
            value={proposal.discount.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}
          />
          {proposal.validUntil && (
            <Detail
              label="Válido até"
              value={new Date(proposal.validUntil).toLocaleDateString('pt-BR')}
            />
          )}
          {proposal.conditions && (
            <div className="sm:col-span-2">
              <Detail label="Condições" value={proposal.conditions} />
            </div>
          )}
        </dl>
      </div>
      {/* Deliberately no accept/decline controls in this vertical. */}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{value}</dd>
    </div>
  );
}
