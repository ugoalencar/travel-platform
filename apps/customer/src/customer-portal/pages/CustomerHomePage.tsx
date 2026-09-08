import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ApiError,
  getMyProfile,
  listAvailableOffers,
  listMyBookings,
  listMyDocuments,
  listMyPaymentSchedule,
  listMyProposals,
  listMyTrips,
} from '../../lib/customerApi';
import type { Trip } from '../../types/trip';
import type { CustomerDocumentView, CustomerPaymentScheduleItem } from '../../types/customer-portal';
import { tripStatusLabel } from '../../lib/statusLabels';
import { destinationEmoji, destinationGradient } from '../destinationArt';

interface HomeData {
  firstName: string;
  nextTrip: Trip | null;
  offersCount: number;
  activeBookingsCount: number;
  proposalsCount: number;
  pendingDocuments: CustomerDocumentView[];
  nextPayment: CustomerPaymentScheduleItem | null;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: HomeData };

function currency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function CustomerHomePage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getMyProfile(),
      listMyTrips(),
      listAvailableOffers(),
      listMyBookings(),
      listMyProposals(),
      listMyDocuments(),
      listMyPaymentSchedule(),
    ])
      .then(([profile, trips, offers, bookings, proposals, documents, schedule]) => {
        if (cancelled) return;
        const nextTrip = pickNextTrip(trips);
        // Real counts only -- "active" bookings uses the same server-computed
        // isFuture flag the Bookings list relies on (NOT cancelled AND
        // departure in the future), never a fabricated metric.
        const activeBookingsCount = bookings.filter((b) => b.isFuture).length;
        const pendingDocuments = documents.filter(
          (doc) => doc.verificationStatus === 'PENDING' || doc.verificationStatus === 'MISMATCH',
        );
        const nextPayment = pickNextPayment(schedule);
        setState({
          status: 'success',
          data: {
            firstName: firstNameOf(profile.name),
            nextTrip,
            offersCount: offers.length,
            activeBookingsCount,
            proposalsCount: proposals.length,
            pendingDocuments,
            nextPayment,
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
          {state.status === 'success' ? `Olá, ${state.data.firstName}! 👋` : 'Olá! 👋'}
        </h1>
        <p className="text-lg text-slate-600">Aqui está tudo o que você precisa para sua viagem</p>
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AgencyMessageCard trip={state.data.nextTrip} />
            <NextPaymentCard payment={state.data.nextPayment} />
          </div>

          {state.data.pendingDocuments.length > 0 && (
            <PendingDocumentsCard documents={state.data.pendingDocuments} />
          )}

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

  const countdownDays = daysUntil(trip.startDate);
  const gradient = destinationGradient(trip.destination);
  const emoji = destinationEmoji(trip.destination);

  return (
    <Link
      to={`/customer-portal/trips/${trip.id}`}
      className={`block overflow-hidden rounded-2xl border-2 border-orange-100 bg-gradient-to-br ${gradient} shadow-md hover:shadow-lg transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f97362]`}
    >
      <div className="flex flex-col gap-4 bg-white/55 p-6 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            {emoji} Sua próxima viagem
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{trip.name}</p>
          <p className="text-base font-medium text-slate-700">{trip.destination}</p>
          <p className="mt-2 text-sm text-slate-600">
            {new Date(trip.startDate).toLocaleDateString('pt-BR', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
          <p className="mt-2 inline-block rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-800">
            {friendlyTripStatus(trip.status)}
          </p>
        </div>

        {countdownDays !== null && (
          <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl bg-white/90 px-6 py-4 text-center shadow-sm">
            <span className="text-4xl font-black text-[#f97362]">{countdownDays}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              {countdownDays === 1 ? 'dia para viajar' : 'dias para viajar'}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-white/60 bg-white/40 p-3 text-xs font-semibold">
        <span className="rounded-full bg-white/80 px-3 py-1 text-slate-700">
          📄 Ver itinerário e voucher →
        </span>
      </div>
    </Link>
  );
}

function AgencyMessageCard({ trip }: { trip: Trip | null }) {
  // "Mensagens da agência" -- no messaging/inbox system exists in this
  // codebase. Rather than inventing one, this shows a short, friendly
  // notice derived from the next trip's real status, kept intentionally
  // minimal per the blueprint's guidance to not over-build this section.
  const message = agencyMessageFor(trip);
  return (
    <div className="rounded-xl border-2 border-orange-100 bg-white p-5 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
        💬 Avisos da agência
      </h3>
      <p className="text-sm text-slate-700">{message}</p>
    </div>
  );
}

function agencyMessageFor(trip: Trip | null): string {
  if (!trip) return 'Nenhum aviso no momento. Assim que houver novidade, ela aparece aqui.';
  switch (trip.status) {
    case 'PLANNED':
      return `Sua viagem para ${trip.destination} está sendo organizada pela sua agência.`;
    case 'CONFIRMED':
      return `Boas notícias! Sua viagem para ${trip.destination} está confirmada.`;
    case 'IN_PROGRESS':
      return `Sua viagem para ${trip.destination} está em andamento. Aproveite!`;
    case 'COMPLETED':
      return 'Esperamos que sua última viagem tenha sido incrível!';
    default:
      return 'Nenhum aviso no momento.';
  }
}

function friendlyTripStatus(status: Trip['status']): string {
  const friendly: Record<Trip['status'], string> = {
    PLANNED: 'Em planejamento',
    CONFIRMED: 'Viagem confirmada!',
    IN_PROGRESS: 'Em andamento',
    COMPLETED: 'Concluída',
    CANCELLED: 'Cancelada',
  };
  return friendly[status] ?? tripStatusLabel(status);
}

function NextPaymentCard({ payment }: { payment: CustomerPaymentScheduleItem | null }) {
  return (
    <Link
      to="/customer-portal/payments"
      className="block rounded-xl border-2 border-orange-100 bg-white p-5 shadow-sm hover:shadow-md hover:border-orange-200 transition-all"
    >
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
        💳 Próximo pagamento
      </h3>
      {payment ? (
        <div>
          <p className="text-lg font-bold text-slate-900">{currency(payment.amountRemaining)}</p>
          <p className="text-sm text-slate-600">
            {payment.description} · vence em{' '}
            {new Date(payment.dueAt).toLocaleDateString('pt-BR')}
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Nenhuma parcela pendente. Tudo em dia! 🎉</p>
      )}
    </Link>
  );
}

function PendingDocumentsCard({ documents }: { documents: CustomerDocumentView[] }) {
  return (
    <Link
      to="/customer-portal/documents"
      className="block rounded-xl border-2 border-amber-200 bg-amber-50 p-5 shadow-sm hover:shadow-md hover:border-amber-300 transition-all"
    >
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-800">
        📎 Documentos pendentes
      </h3>
      <p className="text-sm text-amber-900">
        {documents.length === 1
          ? '1 documento precisa da sua atenção.'
          : `${documents.length} documentos precisam da sua atenção.`}
      </p>
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

function pickNextPayment(schedule: CustomerPaymentScheduleItem[]): CustomerPaymentScheduleItem | null {
  const pending = schedule
    .filter((item) => item.status !== 'PAID' && item.status !== 'CANCELLED' && item.amountRemaining > 0)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  return pending[0] ?? null;
}

function daysUntil(dateIso: string): number | null {
  const now = new Date();
  const target = new Date(dateIso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffMs = startOfTarget.getTime() - startOfToday.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return days >= 0 ? days : null;
}

function firstNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}
