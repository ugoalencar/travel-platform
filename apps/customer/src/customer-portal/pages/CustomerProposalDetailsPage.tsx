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
    <div className="flex flex-col gap-6">
      <BackLink to="/customer-portal/proposals" label="Voltar para minhas propostas" />

      <div aria-live="polite">
        {state.status === 'loading' && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
            <span className="text-sm text-slate-500">Carregando proposta...</span>
          </div>
        )}
        {state.status === 'error' && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
      </div>

      {state.status === 'success' && <ProposalDetails proposal={state.proposal} />}
    </div>
  );
}

function ProposalDetails({ proposal }: { proposal: CustomerProposalView }) {
  const isPending = proposal.status === 'SENT';
  const isAccepted = proposal.status === 'ACCEPTED';

  const statusColors: Record<string, string> = {
    SENT: 'bg-amber-100 text-amber-800',
    ACCEPTED: 'bg-green-100 text-green-800',
    DECLINED: 'bg-red-100 text-red-800',
    EXPIRED: 'bg-slate-100 text-slate-600',
  };

  return (
    <>
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
              statusColors[proposal.status] ?? 'bg-slate-100 text-slate-600'
            }`}
          >
            {proposalStatusLabel(proposal.status)}
          </span>
          {isPending && (
            <span className="text-sm font-medium text-amber-600">Aguardando sua decisão</span>
          )}
        </div>
        <p className="mt-4 text-3xl font-bold text-slate-900">
          {proposal.total.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          })}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Proposta enviada em {new Date(proposal.createdAt).toLocaleDateString('pt-BR')}
        </p>
      </div>

      {/* Proposal Details */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Detalhes da proposta
        </h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Detail label="Preço proposto" value={formatCurrency(proposal.proposedPrice)} />
          <Detail label="Desconto" value={formatCurrency(proposal.discount)} />
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

      {/* What's Included (Prototype) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          O que está incluído
        </h2>
        <ul className="space-y-3">
          {[
            'Passagens aéreas ida e volta (Executiva)',
            '7 noites em vila sobre a água',
            'Transfer hidroavião ida e volta',
            'Mergulho com tubarões-baleia',
            'Passeio de barco ao pôr do sol',
            'Spa & Wellness',
            'Café da manhã e jantar inclusos',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-0.5 text-green-600">✓</span>
              <span className="text-sm text-slate-700">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Actions */}
      {isPending && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="mb-3 text-sm font-semibold text-amber-900">
            Próximos passos
          </h2>
          <p className="mb-4 text-sm text-amber-700">
            Esta proposta é informativa. Para aceitar ou negociar, entre em contato com sua agência.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
            >
              📞 Falar com a agência
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              💬 Enviar mensagem
            </button>
          </div>
        </div>
      )}

      {isAccepted && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-lg">
              ✅
            </div>
            <div>
              <p className="text-sm font-semibold text-green-900">Proposta aceita!</p>
              <p className="text-xs text-green-700">
                Sua reserva está sendo processada.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Note */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
        <p>
          Esta proposta é apenas informativa. Valores e condições podem ser negociados diretamente
          com sua agência de viagens.
        </p>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{value}</dd>
    </div>
  );
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}
