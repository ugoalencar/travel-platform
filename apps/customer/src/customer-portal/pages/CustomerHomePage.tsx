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
  pendingProposal: boolean;
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
        const activeBookingsCount = bookings.filter((b) => b.isFuture).length;
        const pendingProposal = proposals.some((p) => p.status === 'SENT');
        setState({
          status: 'success',
          data: {
            firstName: firstNameOf(profile.name),
            nextTrip,
            offersCount: offers.length,
            activeBookingsCount,
            proposalsCount: proposals.length,
            pendingProposal,
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
      {/* Hero greeting */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 p-8 text-white shadow-xl">
        <div className="absolute -right-8 -top-8 text-8xl opacity-20">✈️</div>
        <div className="relative">
          <p className="text-sm font-medium uppercase tracking-wider text-teal-100">
            Bem-vinda de volta
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            {state.status === 'success' ? `Olá, ${state.data.firstName}!` : 'Olá!'}
          </h1>
          <p className="mt-2 text-teal-100">
            Sua próxima aventura está chegando
          </p>
        </div>
      </div>

      <div aria-live="polite">
        {state.status === 'loading' && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
            <span className="text-sm text-slate-500">Carregando suas viagens...</span>
          </div>
        )}
        {state.status === 'error' && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
      </div>

      {state.status === 'success' && (
        <>
          {/* Next Trip Hero Card */}
          <NextTripHero trip={state.data.nextTrip} />

          {/* Pending Proposal Alert */}
          {state.data.pendingProposal && (
            <Link
              to="/customer-portal/proposals"
              className="group flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm transition-all hover:border-amber-300 hover:shadow-md"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">
                📋
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900">
                  Proposta aguardando sua decisão
                </p>
                <p className="text-xs text-amber-700">
                  Você tem uma proposta pendente. Toque para ver os detalhes.
                </p>
              </div>
              <div className="text-amber-600 transition-transform group-hover:translate-x-1">
                →
              </div>
            </Link>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard
              icon="✈️"
              title="Reservas ativas"
              value={String(state.data.activeBookingsCount)}
              linkTo="/customer-portal/bookings"
              color="teal"
            />
            <SummaryCard
              icon="📋"
              title="Propostas"
              value={String(state.data.proposalsCount)}
              linkTo="/customer-portal/proposals"
              color="amber"
            />
            <SummaryCard
              icon="🎯"
              title="Ofertas disponíveis"
              value={String(state.data.offersCount)}
              linkTo="/customer-portal/offers"
              color="purple"
            />
          </div>

          {/* Quick Actions */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Acesso rápido
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <QuickAction icon="🌍" label="Minhas viagens" linkTo="/customer-portal/trips" />
              <QuickAction icon="📦" label="Minhas reservas" linkTo="/customer-portal/bookings" />
              <QuickAction icon="💬" label="Propostas" linkTo="/customer-portal/proposals" />
              <QuickAction icon="👤" label="Meu perfil" linkTo="/customer-portal/profile" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NextTripHero({ trip }: { trip: Trip | null }) {
  if (!trip) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <div className="text-4xl">🌴</div>
        <p className="mt-3 text-sm font-medium text-slate-600">Nenhuma viagem futura</p>
        <p className="mt-1 text-xs text-slate-400">
          Converse com sua agência para planejar sua próxima aventura.
        </p>
      </div>
    );
  }

  const daysUntil = Math.ceil(
    (new Date(trip.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <Link
      to={`/customer-portal/trips/${trip.id}`}
      className="group block overflow-hidden rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white shadow-sm transition-all hover:border-teal-300 hover:shadow-md"
    >
      <div className="relative p-6">
        <div className="absolute -right-4 -top-4 text-7xl opacity-10 transition-transform group-hover:scale-110">
          {trip.destination === 'Portugal' ? '🇵🇹' : trip.destination === 'Islândia' ? '🌋' : '✈️'}
        </div>
        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-800">
              Próxima viagem
            </span>
            {daysUntil > 0 && (
              <span className="text-xs font-medium text-teal-600">
                Faltam {daysUntil} dias
              </span>
            )}
          </div>
          <h2 className="mt-3 text-xl font-bold text-slate-900 group-hover:text-teal-700">
            {trip.name}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{trip.destination}</p>
          <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
            <span>
              📅 {new Date(trip.startDate).toLocaleDateString('pt-BR')} –{' '}
              {new Date(trip.endDate).toLocaleDateString('pt-BR')}
            </span>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              {tripStatusLabel(trip.status)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function SummaryCard({
  icon,
  title,
  value,
  linkTo,
  color,
}: {
  icon: string;
  title: string;
  value: string;
  linkTo: string;
  color: 'teal' | 'amber' | 'purple';
}) {
  const colorMap = {
    teal: 'border-teal-200 bg-teal-50 hover:border-teal-300',
    amber: 'border-amber-200 bg-amber-50 hover:border-amber-300',
    purple: 'border-purple-200 bg-purple-50 hover:border-purple-300',
  };

  return (
    <Link
      to={linkTo}
      className={`block rounded-xl border p-5 shadow-sm transition-all hover:shadow-md ${colorMap[color]}`}
    >
      <div className="text-2xl">{icon}</div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs font-medium text-slate-600">{title}</p>
    </Link>
  );
}

function QuickAction({
  icon,
  label,
  linkTo,
}: {
  icon: string;
  label: string;
  linkTo: string;
}) {
  return (
    <Link
      to={linkTo}
      className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-4 text-center transition-all hover:border-teal-300 hover:bg-teal-50"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-medium text-slate-700">{label}</span>
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
