import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, getMyTrip } from '../../lib/customerApi';
import type { Trip } from '../../types/trip';
import { tripStatusLabel } from '../../lib/statusLabels';
import { BackLink } from '../BackLink';

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

  return (
    <div className="flex flex-col gap-4">
      <BackLink to="/customer-portal/trips" label="Voltar para minhas viagens" />

      <div aria-live="polite">
        {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
        {state.status === 'error' && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
      </div>

      {state.status === 'success' && <TripDetails trip={state.trip} />}
    </div>
  );
}

function TripDetails({ trip }: { trip: Trip }) {
  const startDate = new Date(trip.startDate);
  const endDate = new Date(trip.endDate);
  const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{trip.name}</h1>
          <p className="mt-2 text-xl text-slate-700">{trip.destination}</p>
        </div>
        <span className="inline-block rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-900">
          {tripStatusLabel(trip.status)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border-2 border-slate-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 mb-3">📅 Datas</h3>
          <div className="space-y-3">
            <DetailItem label="Início" value={startDate.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} />
            <DetailItem label="Fim" value={endDate.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} />
            <DetailItem label="Duração" value={`${durationDays} dias`} />
          </div>
        </div>

        {trip.description && (
          <div className="rounded-xl border-2 border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 mb-3">📝 Descrição</h3>
            <p className="text-slate-700 leading-relaxed">{trip.description}</p>
          </div>
        )}
      </div>
      {/* Trip.notes (internal agency notes) is intentionally never rendered
          here -- the backend already excludes it from the response (see
          services/api/src/customer-portal.ts toTrip), so it isn't even
          available on this object, but this component also never reads a
          `notes` field as defense in depth. */}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}
