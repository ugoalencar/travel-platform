import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, listAvailableOffers, listMyBookings, listMyTrips } from '../../lib/customerApi';
import type { Trip } from '../../types/trip';
import type { Booking } from '../../types/booking';

interface HomeData {
  nextTrip: Trip | null;
  offersCount: number;
  upcomingBookingsCount: number;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: HomeData };

export function CustomerHomePage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    Promise.all([listMyTrips(), listAvailableOffers(), listMyBookings()])
      .then(([trips, offers, bookings]) => {
        if (cancelled) return;
        const nextTrip = pickNextTrip(trips);
        const upcomingBookingsCount = countUpcomingBookings(bookings);
        setState({
          status: 'success',
          data: { nextTrip, offersCount: offers.length, upcomingBookingsCount },
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
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Olá!</h1>

      {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}

      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard
            title="Próxima viagem"
            value={state.data.nextTrip ? state.data.nextTrip.destination : 'Nenhuma viagem futura'}
            {...(state.data.nextTrip
              ? { linkTo: `/customer-portal/trips/${state.data.nextTrip.id}` }
              : {})}
          />
          <SummaryCard
            title="Ofertas disponíveis"
            value={String(state.data.offersCount)}
            linkTo="/customer-portal/offers"
          />
          <SummaryCard
            title="Reservas futuras"
            value={String(state.data.upcomingBookingsCount)}
            linkTo="/customer-portal/bookings"
          />
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  linkTo,
}: {
  title: string;
  value: string;
  linkTo?: string;
}) {
  const content = (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );

  if (!linkTo) {
    return content;
  }

  return (
    <Link to={linkTo} className="block hover:opacity-80">
      {content}
    </Link>
  );
}

function pickNextTrip(trips: Trip[]): Trip | null {
  const now = Date.now();
  const upcoming = trips
    .filter((t) => new Date(t.startDate).getTime() >= now)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  return upcoming[0] ?? null;
}

function countUpcomingBookings(bookings: Booking[]): number {
  // Booking has no date of its own -- it links to a ScheduledDeparture --
  // so "upcoming" here is approximated as "not cancelled". A precise
  // date-based count would require fetching each linked departure, which
  // is out of scope for this summary card.
  return bookings.filter((b) => !b.cancelled).length;
}
