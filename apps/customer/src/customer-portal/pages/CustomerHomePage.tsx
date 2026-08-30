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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">
          {state.status === 'success' ? `Bem-vindo, ${state.data.firstName}! 👋` : 'Bem-vindo! 👋'}
        </h1>
        <p className="text-lg text-slate-600">Você está pronto para suas próximas aventuras</p>
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
      </div>

      {state.status === 'success' && (
        <div className="flex flex-col gap-8">
          <NextTripCard trip={state.data.nextTrip} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard
              title="Reservas ativas"
              value={String(state.data.activeBookingsCount)}
              linkTo="/customer-portal/bookings"
              icon="✈️"
              color="blue"
            />
            <SummaryCard
              title="Propostas"
              value={String(state.data.proposalsCount)}
              linkTo="/customer-portal/proposals"
              icon="📋"
              color="amber"
            />
            <SummaryCard
              title="Ofertas disponíveis"
              value={String(state.data.offersCount)}
              linkTo="/customer-portal/offers"
              icon="🎁"
              color="purple"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function NextTripCard({ trip }: { trip: Trip | null }) {
  if (!trip) {
    return (
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Próxima viagem
        </p>
        <p className="mt-3 text-sm text-slate-500">Nenhuma viagem futura no momento.</p>
      </div>
    );
  }

  return (
    <Link
      to={`/customer-portal/trips/${trip.id}`}
      className="block rounded-xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-md hover:shadow-lg hover:border-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">🗺️ Próxima viagem</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{trip.name}</p>
          <p className="text-base text-slate-700 font-medium">{trip.destination}</p>
          <p className="mt-2 text-sm text-slate-600">
            {new Date(trip.startDate).toLocaleDateString('pt-BR', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
          <p className="mt-1 inline-block rounded-full bg-amber-200 px-3 py-1 text-xs font-semibold text-amber-900">
            {tripStatusLabel(trip.status)}
          </p>
        </div>
      </div>
    </Link>
  );
}

interface SummaryCardProps {
  title: string;
  value: string;
  linkTo: string;
  icon?: string;
  color?: 'blue' | 'amber' | 'purple';
}

const colorSchemes = {
  blue: {
    bg: 'from-blue-50 to-indigo-50',
    border: 'border-blue-200 hover:border-blue-300',
    icon: 'text-blue-600',
    badge: 'text-blue-900 bg-blue-100',
    focus: 'focus-visible:outline-blue-600',
  },
  amber: {
    bg: 'from-amber-50 to-orange-50',
    border: 'border-amber-200 hover:border-amber-300',
    icon: 'text-amber-600',
    badge: 'text-amber-900 bg-amber-100',
    focus: 'focus-visible:outline-amber-600',
  },
  purple: {
    bg: 'from-purple-50 to-indigo-50',
    border: 'border-purple-200 hover:border-purple-300',
    icon: 'text-purple-600',
    badge: 'text-purple-900 bg-purple-100',
    focus: 'focus-visible:outline-purple-600',
  },
};

function SummaryCard({ title, value, linkTo, icon, color = 'blue' }: SummaryCardProps) {
  const scheme = colorSchemes[color];
  return (
    <Link
      to={linkTo}
      className={`block rounded-xl border-2 bg-gradient-to-br ${scheme.bg} p-6 shadow-md hover:shadow-lg transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${scheme.border} ${scheme.focus}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-3 text-4xl font-bold text-slate-900">{value}</p>
        </div>
        {icon && <span className="text-3xl" aria-hidden="true">{icon}</span>}
      </div>
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
