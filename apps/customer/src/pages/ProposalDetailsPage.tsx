import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  acceptProposal,
  ApiError,
  cancelProposal,
  declineProposal,
  getCustomer,
  getOffer,
  getProposal,
  getWish,
  sendProposal,
} from '../lib/api';
import type { Proposal, ProposalStatus } from '../types/proposal';
import { Button } from '../components/ui/button';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import { getProposalStatusLabel } from '../lib/statusLabels';
import { StatusPill, proposalStatusTone } from '../components/ui/StatusPill';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      proposal: Proposal;
      customerName: string | null;
      offerName: string | null;
      wishDestination: string | null;
    };

type ProposalAction = 'send' | 'accept' | 'decline' | 'cancel';

// Mirrors the backend's allowed transitions in services/api/src/proposals.ts
// (transitionProposal's allowedFrom lists) so the UI only ever offers an
// action the backend will actually accept. Backend remains sole authority:
// this is a read of the same rule, never a place that invents new ones.
const ALLOWED_TRANSITIONS: Record<ProposalAction, ProposalStatus[]> = {
  send: ['DRAFT'],
  cancel: ['DRAFT', 'SENT'],
  accept: ['SENT'],
  decline: ['SENT'],
};

const ACTION_LABELS: Record<ProposalAction, string> = {
  send: 'Enviar',
  accept: 'Aceitar',
  decline: 'Recusar',
  cancel: 'Cancelar',
};

// Destructive/terminal transitions get a confirmation prompt before firing.
const CONFIRM_ACTIONS: ProposalAction[] = ['cancel', 'decline', 'accept'];

const CONFIRM_MESSAGES: Record<ProposalAction, string> = {
  send: '',
  accept: 'Confirma aceitar esta proposta? Esta ação não pode ser desfeita.',
  decline: 'Confirma recusar esta proposta? Esta ação não pode ser desfeita.',
  cancel: 'Confirma cancelar esta proposta? Esta ação não pode ser desfeita.',
};

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Proposta não encontrada.';
  }
  return 'Não foi possível carregar a proposta. Tente novamente.';
}

function mapActionErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 403:
        return 'Você não tem permissão para alterar esta proposta.';
      case 404:
        return 'Proposta não encontrada.';
      case 409:
        return 'Esta proposta não está mais em um estado que permite essa ação. Atualize a página.';
      default:
        return 'Não foi possível concluir a ação. Tente novamente.';
    }
  }
  return 'Não foi possível concluir a ação. Tente novamente.';
}

const ACTION_FN: Record<ProposalAction, (id: string) => Promise<Proposal>> = {
  send: sendProposal,
  accept: acceptProposal,
  decline: declineProposal,
  cancel: cancelProposal,
};

export function ProposalDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [pendingAction, setPendingAction] = useState<ProposalAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) {
      setState({ status: 'error', message: 'Proposta não encontrada.' });
      return () => {};
    }

    let cancelled = false;
    setState({ status: 'loading' });

    getProposal(id)
      .then(async (proposal) => {
        if (cancelled) return;

        const customerName = await getCustomer(proposal.customerId)
          .then((c) => c.name)
          .catch(() => null);

        const offerName = proposal.offerId
          ? await getOffer(proposal.offerId)
              .then((o) => o.name)
              .catch(() => null)
          : null;

        const wishDestination = proposal.wishId
          ? await getWish(proposal.wishId)
              .then((w) => w.destination ?? null)
              .catch(() => null)
          : null;

        if (cancelled) return;
        setState({ status: 'success', proposal, customerName, offerName, wishDestination });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ status: 'error', message: mapErrorToMessage(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const cancel = load();
    return cancel;
  }, [load]);

  async function runAction(action: ProposalAction) {
    if (!id || pendingAction) return;

    if (CONFIRM_ACTIONS.includes(action)) {
      const confirmed = window.confirm(CONFIRM_MESSAGES[action]);
      if (!confirmed) return;
    }

    setPendingAction(action);
    setActionError(null);

    try {
      await ACTION_FN[action](id);
      load();
    } catch (error: unknown) {
      setActionError(mapActionErrorToMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  const currentStatus = state.status === 'success' ? state.proposal.status : null;
  const availableActions =
    currentStatus !== null
      ? (Object.keys(ALLOWED_TRANSITIONS) as ProposalAction[]).filter((action) =>
          ALLOWED_TRANSITIONS[action].includes(currentStatus),
        )
      : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Detalhes da proposta
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => void navigate('/proposals')}>
            Voltar
          </Button>
          {state.status === 'success' && (
            <Button onClick={() => void navigate(`/proposals/${state.proposal.id}/edit`)}>
              Editar
            </Button>
          )}
          {availableActions.map((action) => (
            <Button
              key={action}
              variant={action === 'cancel' || action === 'decline' ? 'outline' : 'default'}
              disabled={pendingAction !== null}
              onClick={() => void runAction(action)}
            >
              {pendingAction === action ? 'Aguarde...' : ACTION_LABELS[action]}
            </Button>
          ))}
        </div>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando proposta...</p>
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

      {actionError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {state.status === 'success' && (
        <dl className="grid max-w-lg grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2">
          <Field label="Cliente" value={state.customerName ?? state.proposal.customerId} />
          <Field label="Oferta vinculada" value={state.offerName ?? undefined} />
          <Field label="Desejo vinculado" value={state.wishDestination ?? undefined} />
          <Field label="Preço proposto" value={formatBRL(state.proposal.proposedPrice)} />
          <Field label="Desconto" value={formatBRL(state.proposal.discount)} />
          <Field label="Total" value={formatBRL(state.proposal.total)} />
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Status
            </dt>
            <dd>
              <StatusPill tone={proposalStatusTone(state.proposal.status)}>
                {getProposalStatusLabel(state.proposal.status)}
              </StatusPill>
            </dd>
          </div>
          <Field
            label="Válida até"
            value={
              state.proposal.validUntil
                ? formatDateBR(state.proposal.validUntil, { assumeDateOnly: true })
                : undefined
            }
          />
          <Field label="Condições" value={state.proposal.conditions} />
          <Field label="Notas" value={state.proposal.notes} />
          <Field label="Criada em" value={formatDateBR(state.proposal.createdAt)} />
          <Field label="Atualizada em" value={formatDateBR(state.proposal.updatedAt)} />
        </dl>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="text-sm text-slate-900">{value ?? '—'}</dd>
    </div>
  );
}
