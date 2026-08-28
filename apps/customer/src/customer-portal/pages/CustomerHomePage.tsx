import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ApiError,
  getMyProfile,
  listAvailableOffers,
  listMyBookings,
  listMyProposals,
  listMyTrips,
} from '../../lib/customerApi';
import type { Trip } from '../../types/trip';
import { tripStatusLabel } from '../../lib/statusLabels';

interface HomeData {
  firstName: string;
  nextTrip: Trip | null;
  offersCount: number;
  activeBookingsCount: number;
  proposalsCount: number;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: HomeData };

export function CustomerHomePage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    Promise.all([getMyProfile(), listMyTrips(), listAvailableOffers(), listMyBookings(), listMyProposals()])
      .then(([profile, trips, offers, bookings, proposals]) => {
        if (cancelled) return;
        const nextTrip = pickNextTrip(trips);
        // Real counts only -- "active" bookings uses the same server-computed
        // isFuture flag the Bookings list relies on (NOT cancelled AND
        // departure in the future), never a fabricated metric.
        const activeBookingsCount = bookings.filter((b) => b.isFuture).length;
        setState({
          status: 'success',
          data: {
            firstName: firstNameOf(profile.name),
            nextTrip,
            offersCount: offers.length,
            activeBookingsCount,
            proposalsCount: proposals.length,
          },
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar seus dados.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {state.status === 'success' ? `Olá, ${state.data.firstName}!` : 'Olá!'}
      </h1>

      <div aria-live="polite">
        {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
        {state.status === 'error' && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
      </div>

      {state.status === 'success' && (
        <>
          <NextTripCard trip={state.data.nextTrip} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard
              title="Reservas ativas"
              value={String(state.data.activeBookingsCount)}
              linkTo="/customer-portal/bookings"
            />
            <SummaryCard
              title="Propostas"
              value={String(state.data.proposalsCount)}
              linkTo="/customer-portal/proposals"
            />
            <SummaryCard
              title="Ofertas disponíveis"
              value={String(state.data.offersCount)}
              linkTo="/customer-portal/offers"
            />
          </div>
        </>
      )}
    </div>
  );
}

function NextTripCard({ trip }: { trip: Trip | null }) {
  if (!trip) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Próxima viagem
        </p>
        <p className="mt-2 text-sm text-slate-500">Nenhuma viagem futura no momento.</p>
      </div>
    );
  }

  return (
    <Link
      to={`/customer-portal/trips/${trip.id}`}
      className="block rounded-lg border border-teal-200 bg-teal-50 p-5 shadow-sm hover:border-teal-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-teal-700">Próxima viagem</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{trip.name}</p>
      <p className="text-sm text-slate-700">{trip.destination}</p>
      <p className="mt-1 text-xs text-slate-500">
        {new Date(trip.startDate).toLocaleDateString('pt-BR')} ·{' '}
        {tripStatusLabel(trip.status)}
      </p>
    </Link>
  );
}

function SummaryCard({ title, value, linkTo }: { title: string; value: string; linkTo: string }) {
  return (
    <Link
      to={linkTo}
      className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-teal-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </Link>
  );
}

function pickNextTrip(trips: Trip[]): Trip | null {
  const now = Date.now();
  const upcoming = trips
    .filter((t) => new Date(t.startDate).getTime() >= now && t.status !== 'CANCELLED')
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  return upcoming[0] ?? null;
}

function firstNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}
