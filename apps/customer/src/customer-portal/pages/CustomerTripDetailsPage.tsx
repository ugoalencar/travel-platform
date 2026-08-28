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
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{trip.name}</h1>
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Detail label="Destino" value={trip.destination} />
          <Detail label="Status" value={tripStatusLabel(trip.status)} />
          <Detail label="Início" value={new Date(trip.startDate).toLocaleDateString('pt-BR')} />
          <Detail label="Fim" value={new Date(trip.endDate).toLocaleDateString('pt-BR')} />
          {trip.description && (
            <div className="sm:col-span-2">
              <Detail label="Descrição" value={trip.description} />
            </div>
          )}
        </dl>
      </div>
      {/* Trip.notes (internal agency notes) is intentionally never rendered
          here -- the backend already excludes it from the response (see
          services/api/src/customer-portal.ts toTrip), so it isn't even
          available on this object, but this component also never reads a
          `notes` field as defense in depth. */}
    </>
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
