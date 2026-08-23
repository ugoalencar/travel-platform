import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, getMyTrip } from '../../lib/customerApi';
import type { Trip } from '../../types/trip';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; trip: Trip };

export function CustomerTripDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getMyTrip(id)
      .then((trip) => {
        if (!cancelled) setState({ status: 'success', trip });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar esta viagem.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === 'loading') {
    return <p className="text-sm text-slate-500">Carregando...</p>;
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {state.message}
      </div>
    );
  }

  const { trip } = state;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{trip.name}</h1>
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Detail label="Destino" value={trip.destination} />
          <Detail label="Status" value={trip.status} />
          <Detail label="Início" value={new Date(trip.startDate).toLocaleDateString('pt-BR')} />
          <Detail label="Fim" value={new Date(trip.endDate).toLocaleDateString('pt-BR')} />
          {trip.description && (
            <div className="sm:col-span-2">
              <Detail label="Descrição" value={trip.description} />
            </div>
          )}
        </dl>
      </div>
    </div>
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
