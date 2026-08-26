import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, listMyTrips } from '../../lib/customerApi';
import type { Trip } from '../../types/trip';
import { tripStatusLabel } from '../../lib/statusLabels';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; trips: Trip[] };

export function CustomerTripsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    listMyTrips()
      .then((trips) => {
        if (!cancelled) setState({ status: 'success', trips });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar suas viagens.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Minhas viagens</h1>

      <div aria-live="polite">
        {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
        {state.status === 'error' && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
        {state.status === 'success' && state.trips.length === 0 && (
          <p className="text-sm text-slate-500">Nenhuma viagem por aqui ainda.</p>
        )}
      </div>
      {state.status === 'success' && (
        <ul className="flex flex-col gap-3">
          {state.trips.map((trip) => (
            <li key={trip.id}>
              <Link
                to={`/customer-portal/trips/${trip.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-teal-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
              >
                <p className="font-medium text-slate-900">{trip.name}</p>
                <p className="text-sm text-slate-600">{trip.destination}</p>
                <p className="text-xs text-slate-500">
                  {new Date(trip.startDate).toLocaleDateString('pt-BR')} –{' '}
                  {new Date(trip.endDate).toLocaleDateString('pt-BR')} ·{' '}
                  {tripStatusLabel(trip.status)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
