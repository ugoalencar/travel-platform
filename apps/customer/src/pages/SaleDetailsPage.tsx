import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getCustomer, getSale } from '../lib/api';
import type { Sale } from '../types/sale';
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

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Venda não encontrada.';
  }
  return 'Não foi possível carregar a venda. Tente novamente.';
}

export function SaleDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setState({ status: 'error', message: 'Venda não encontrada.' });
      return;
    }

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Detalhes da venda
        </h1>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => void navigate('/sales')}>
            Voltar
          </Button>
          {state.status === 'success' && (
            <Button onClick={() => void navigate(`/sales/${state.sale.id}/edit`)}>
              Editar
            </Button>
          )}
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
