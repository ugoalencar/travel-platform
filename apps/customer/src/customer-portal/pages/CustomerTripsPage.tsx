import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, listMyTrips } from '../../lib/customerApi';
import type { Trip } from '../../types/trip';
import { tripStatusLabel } from '../../lib/statusLabels';
import { destinationEmoji, destinationGradient } from '../destinationArt';

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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Minhas viagens</h1>
        <p className="mt-2 text-slate-600">Explore e gerencie todas as suas aventuras planejadas</p>
      </div>

      <div aria-live="polite">
        {state.status === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="h-2 w-2 rounded-full bg-slate-300 animate-pulse"></div>
            Carregando...
          </div>
        )}
        {state.status === 'error' && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-medium">Ocorreu um erro</p>
            <p className="mt-1">{state.message}</p>
          </div>
        )}
        {state.status === 'success' && state.trips.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
            <p className="text-2xl" aria-hidden="true">🌍</p>
            <p className="mt-2 text-sm font-medium text-slate-600">Nenhuma viagem por aqui ainda.</p>
            <p className="mt-1 text-xs text-slate-500">Fale com sua agência para agendar sua próxima aventura!</p>
          </div>
        )}
      </div>
      {state.status === 'success' && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {state.trips.map((trip) => (
            <li key={trip.id}>
              <TripCard trip={trip} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const startDate = new Date(trip.startDate);
  const endDate = new Date(trip.endDate);
  const statusColorClass = getStatusColor(trip.status);
  const gradient = destinationGradient(trip.destination);
  const emoji = destinationEmoji(trip.destination);

  return (
    <Link
      to={`/customer-portal/trips/${trip.id}`}
      className={`block overflow-hidden rounded-2xl border-2 border-orange-100 shadow-md hover:shadow-lg transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f97362]`}
    >
      <div className={`flex h-24 items-center justify-center bg-gradient-to-br ${gradient} text-4xl`} aria-hidden="true">
        {emoji}
      </div>
      <div className="bg-white p-5">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="text-lg font-bold text-slate-900">{trip.name}</h3>
          <span className={`inline-block shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${statusColorClass}`}>
            {tripStatusLabel(trip.status)}
          </span>
        </div>
        <p className="text-sm font-medium text-slate-700">{trip.destination}</p>
        <div className="mt-3 flex items-center gap-1 text-xs text-slate-600">
          <span aria-hidden="true">📅</span>
          <span>
            {startDate.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })} –{' '}
            {endDate.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
          <span aria-hidden="true">⏱️</span>
          <span>{Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))} dias</span>
        </div>
      </div>
    </Link>
  );
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    PLANNED: 'bg-slate-100 text-slate-800',
    CONFIRMED: 'bg-green-100 text-green-800',
    IN_PROGRESS: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-purple-100 text-purple-800',
    CANCELLED: 'bg-red-100 text-red-800',
  };
  return colors[status] || 'bg-slate-100 text-slate-800';
}
