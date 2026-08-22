import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getRoute } from '../lib/api';
import type { Route } from '../types/transport';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; route: Route };

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Rota não encontrada.';
  }
  return 'Não foi possível carregar a rota. Tente novamente.';
}

export function TransportRouteDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setState({ status: 'error', message: 'Rota não encontrada.' });
      return;
    }

    setState({ status: 'loading' });

    getRoute(id)
      .then((route) => {
        if (cancelled) return;
        setState({ status: 'success', route });
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
          Detalhes da rota
        </h1>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => void navigate('/transport/routes')}>
            Voltar
          </Button>
          {state.status === 'success' && (
            <Button onClick={() => void navigate(`/transport/routes/${state.route.id}/edit`)}>
              Editar
            </Button>
          )}
        </div>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando rota...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <dl className="grid max-w-lg grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2">
          <Field label="Origem" value={state.route.origin} />
          <Field label="Destino" value={state.route.destination} />
          <Field
            label="Duração estimada (min)"
            value={state.route.estimatedDuration !== undefined ? String(state.route.estimatedDuration) : undefined}
          />
          <Field
            label="Distância (km)"
            value={state.route.distance !== undefined ? String(state.route.distance) : undefined}
          />
          <Field label="Ativa" value={state.route.active ? 'Sim' : 'Não'} />
          <Field label="Notas" value={state.route.notes} />
          <Field label="Criada em" value={state.route.createdAt} />
          <Field label="Atualizada em" value={state.route.updatedAt} />
        </dl>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{value ?? '—'}</dd>
    </div>
  );
}
