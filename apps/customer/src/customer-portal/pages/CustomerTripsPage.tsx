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
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Minhas viagens</h1>
        <p className="mt-1 text-sm text-slate-500">
          Todas as suas aventuras em um só lugar.
        </p>
      </div>

      <div aria-live="polite">
        {state.status === 'loading' && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
            <span className="text-sm text-slate-500">Carregando viagens...</span>
          </div>
        )}
        {state.status === 'error' && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
        {state.status === 'success' && state.trips.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <div className="text-4xl">🌍</div>
            <p className="mt-3 text-sm font-medium text-slate-600">Nenhuma viagem ainda</p>
            <p className="mt-1 text-xs text-slate-400">
              Converse com sua agência para planejar sua primeira aventura.
            </p>
          </div>
        )}
      </div>

      {state.status === 'success' && state.trips.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {state.trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const isPast = new Date(trip.endDate).getTime() < Date.now();
  const isCancelled = trip.status === 'CANCELLED';
  const daysUntil = Math.ceil(
    (new Date(trip.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const statusColors: Record<string, string> = {
    PLANNED: 'bg-blue-100 text-blue-800',
    CONFIRMED: 'bg-teal-100 text-teal-800',
    IN_PROGRESS: 'bg-green-100 text-green-800',
    COMPLETED: 'bg-slate-100 text-slate-600',
    CANCELLED: 'bg-red-100 text-red-800',
  };

  return (
    <Link
      to={`/customer-portal/trips/${trip.id}`}
      className={`group block overflow-hidden rounded-xl border shadow-sm transition-all hover:shadow-md ${
        isCancelled
          ? 'border-red-200 bg-red-50/50 opacity-75'
          : isPast
            ? 'border-slate-200 bg-slate-50'
            : 'border-teal-200 bg-white hover:border-teal-300'
      }`}
    >
      {/* Trip Image Placeholder */}
      <div
        className={`relative h-32 ${
          isCancelled
            ? 'bg-gradient-to-br from-red-100 to-red-200'
            : isPast
              ? 'bg-gradient-to-br from-slate-100 to-slate-200'
              : 'bg-gradient-to-br from-teal-100 to-teal-200'
        }`}
      >
        <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-60">
          {trip.destination === 'Maldivas' ? '🏝️' : trip.destination === 'Europa' ? '🏛️' : '✈️'}
        </div>
        <div className="absolute right-3 top-3">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              statusColors[trip.status] ?? 'bg-slate-100 text-slate-600'
            }`}
          >
            {tripStatusLabel(trip.status)}
          </span>
        </div>
      </div>

      {/* Trip Info */}
      <div className="p-4">
        <h3 className="text-lg font-semibold text-slate-900 group-hover:text-teal-700">
          {trip.name}
        </h3>
        <p className="mt-1 text-sm text-slate-600">{trip.destination}</p>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            📅 {new Date(trip.startDate).toLocaleDateString('pt-BR')} –{' '}
            {new Date(trip.endDate).toLocaleDateString('pt-BR')}
          </div>
          {!isPast && !isCancelled && daysUntil > 0 && (
            <span className="text-xs font-semibold text-teal-600">
              Faltam {daysUntil} dias
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
