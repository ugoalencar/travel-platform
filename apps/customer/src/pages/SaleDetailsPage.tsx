import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, cancelSale, confirmSale, getCustomer, getSale, markSalePaid } from '../lib/api';
import type { Sale, SaleStatus } from '../types/sale';
import { Button } from '../components/ui/button';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import { getSaleStatusLabel } from '../lib/statusLabels';
import { StatusPill, saleStatusTone } from '../components/ui/StatusPill';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      sale: Sale;
      customerName: string | null;
    };

type SaleAction = 'confirm' | 'cancel' | 'markPaid';

// Mirrors the backend's allowed transitions in services/api/src/sales.ts
// (confirmSale/cancelSale/markSalePaid's allowedFrom checks) so the UI only
// ever offers an action the backend will actually accept. Backend remains
// sole authority: this is a read of the same rule, never a place that
// invents new ones.
const ALLOWED_TRANSITIONS: Record<SaleAction, SaleStatus[]> = {
  confirm: ['PENDING'],
  cancel: ['PENDING', 'CONFIRMED'],
  markPaid: ['CONFIRMED'],
};

const ACTION_LABELS: Record<SaleAction, string> = {
  confirm: 'Confirmar',
  cancel: 'Cancelar',
  markPaid: 'Marcar como paga',
};

// Destructive/terminal transitions get a confirmation prompt before firing.
const CONFIRM_ACTIONS: SaleAction[] = ['cancel', 'markPaid'];

const CONFIRM_MESSAGES: Record<SaleAction, string> = {
  confirm: '',
  cancel: 'Confirma cancelar esta venda? Esta ação não pode ser desfeita.',
  markPaid: 'Confirma marcar esta venda como paga?',
};

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Venda não encontrada.';
  }
  return 'Não foi possível carregar a venda. Tente novamente.';
}

function mapActionErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 403:
        return 'Você não tem permissão para alterar esta venda.';
      case 404:
        return 'Venda não encontrada.';
      case 409:
        return 'Esta venda não está mais em um estado que permite essa ação. Atualize a página.';
      default:
        return 'Não foi possível concluir a ação. Tente novamente.';
    }
  }
  return 'Não foi possível concluir a ação. Tente novamente.';
}

const ACTION_FN: Record<SaleAction, (id: string) => Promise<Sale>> = {
  confirm: confirmSale,
  cancel: cancelSale,
  markPaid: markSalePaid,
};

export function SaleDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [pendingAction, setPendingAction] = useState<SaleAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) {
      setState({ status: 'error', message: 'Venda não encontrada.' });
      return () => {};
    }

    let cancelled = false;
    setState({ status: 'loading' });

    getSale(id)
      .then(async (sale) => {
        if (cancelled) return;

        const customerName = await getCustomer(sale.customerId)
          .then((c) => c.name)
          .catch(() => null);

        if (cancelled) return;
        setState({ status: 'success', sale, customerName });
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

  async function runAction(action: SaleAction) {
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

  const currentStatus = state.status === 'success' ? state.sale.status : null;
  const availableActions =
    currentStatus !== null
      ? (Object.keys(ALLOWED_TRANSITIONS) as SaleAction[]).filter((action) =>
          ALLOWED_TRANSITIONS[action].includes(currentStatus),
        )
      : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Detalhes da venda
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => void navigate('/sales')}>
            Voltar
          </Button>
          {state.status === 'success' && (
            <Button onClick={() => void navigate(`/sales/${state.sale.id}/edit`)}>
              Editar
            </Button>
          )}
          {availableActions.map((action) => (
            <Button
              key={action}
              variant={action === 'cancel' ? 'outline' : 'default'}
              disabled={pendingAction !== null}
              onClick={() => void runAction(action)}
            >
              {pendingAction === action ? 'Aguarde...' : ACTION_LABELS[action]}
            </Button>
          ))}
        </div>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando venda...</p>
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
          <Field label="Cliente" value={state.customerName ?? state.sale.customerId} />
          <Field label="Proposta vinculada" value={state.sale.proposalId} />
          <Field label="Valor" value={formatBRL(state.sale.amount)} />
          <Field label="Desconto" value={formatBRL(state.sale.discount)} />
          <Field label="Total" value={formatBRL(state.sale.total)} />
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Status
            </dt>
            <dd>
              <StatusPill tone={saleStatusTone(state.sale.status)}>
                {getSaleStatusLabel(state.sale.status)}
              </StatusPill>
            </dd>
          </div>
          <Field label="Notas" value={state.sale.notes} />
          <Field label="Criada em" value={formatDateBR(state.sale.createdAt)} />
          <Field label="Atualizada em" value={formatDateBR(state.sale.updatedAt)} />
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
