import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getCustomer, getWish } from '../lib/api';
import type { Wish } from '../types/wish';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; wish: Wish; customerName: string | null };

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return 'Desejo não encontrado.';
    }
    return 'Não foi possível carregar o desejo. Tente novamente.';
  }
  return 'Não foi possível carregar o desejo. Tente novamente.';
}

export function WishDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setState({ status: 'error', message: 'Desejo não encontrado.' });
      return;
    }

    setState({ status: 'loading' });

    getWish(id)
      .then((wish) => {
        if (cancelled) return;
        getCustomer(wish.customerId)
          .then((customer) => {
            if (cancelled) return;
            setState({ status: 'success', wish, customerName: customer.name });
          })
          .catch(() => {
            if (cancelled) return;
            setState({ status: 'success', wish, customerName: null });
          });
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
          Detalhes do desejo
        </h1>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => void navigate('/wishes')}>
            Voltar
          </Button>
          {state.status === 'success' && (
            <Button onClick={() => void navigate(`/wishes/${state.wish.id}/edit`)}>
              Editar
            </Button>
          )}
        </div>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando desejo...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <dl className="grid max-w-lg grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2">
          <Field label="Cliente" value={state.customerName ?? state.wish.customerId} />
          <Field label="Destino" value={state.wish.destination} />
          <Field label="Data de início" value={state.wish.startDate} />
          <Field label="Data de fim" value={state.wish.endDate} />
          <Field
            label="Orçamento"
            value={state.wish.budget !== undefined ? String(state.wish.budget) : undefined}
          />
          <Field
            label="Viajantes"
            value={
              state.wish.travelersCount !== undefined
                ? String(state.wish.travelersCount)
                : undefined
            }
          />
          <Field label="Notas" value={state.wish.notes} />
          <Field label="Status" value={state.wish.status} />
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
