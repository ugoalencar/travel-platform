import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, listMyBookings } from '../../lib/customerApi';
import type { CustomerBookingView } from '../../types/customer-portal';
import { bookingStatusLabel, tripTypeLabel } from '../../lib/statusLabels';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; bookings: CustomerBookingView[] };

export function CustomerBookingsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    listMyBookings()
      .then((bookings) => {
        if (!cancelled) setState({ status: 'success', bookings });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar suas reservas.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Minhas reservas</h1>
        <p className="mt-2 text-slate-600">Acompanhe todas as suas reservas confirmadas</p>
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
        {state.status === 'success' && state.bookings.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
            <p className="text-2xl" aria-hidden="true">🎫</p>
            <p className="mt-2 text-sm font-medium text-slate-600">Nenhuma reserva por aqui ainda.</p>
            <p className="mt-1 text-xs text-slate-500">Confira as ofertas e propostas disponíveis!</p>
          </div>
        )}
      </div>
      {state.status === 'success' && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {state.bookings.map((booking) => (
            <li key={booking.id}>
              <BookingCard booking={booking} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BookingCard({ booking }: { booking: CustomerBookingView }) {
  const departureDate = new Date(booking.departureAt);
  const isFuture = booking.isFuture !== false;
  const statusLabel = bookingStatusLabel(booking);
  const statusColorClass = getBookingStatusColor(booking.cancelled, isFuture);

  return (
    <Link
      to={`/customer-portal/bookings/${booking.id}`}
      className={`block rounded-xl border-2 p-5 shadow-md hover:shadow-lg transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
        isFuture && !booking.cancelled
          ? 'border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 hover:border-green-300 focus-visible:outline-green-600'
          : 'border-slate-200 bg-white hover:border-slate-300 focus-visible:outline-slate-600'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-2xl" aria-hidden="true">✈️</span>
        <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${statusColorClass}`}>
          {statusLabel}
        </span>
      </div>

      <div className="mb-3">
        <h3 className="text-lg font-bold text-slate-900">
          {booking.origin} <span className="text-slate-400">→</span> {booking.destination}
        </h3>
        <p className="mt-1 text-sm text-slate-600">{booking.productName}</p>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-slate-700">
          <span aria-hidden="true">📅</span>
          <span>{departureDate.toLocaleDateString('pt-BR', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-700">
          <span aria-hidden="true">🕐</span>
          <span>{departureDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600 text-xs">
          <span aria-hidden="true">👥</span>
          <span>{booking.passengerCount} {booking.passengerCount === 1 ? 'passageiro' : 'passageiros'}</span>
        </div>
      </div>
    </Link>
  );
}

function getBookingStatusColor(cancelled: boolean, isFuture: boolean): string {
  if (cancelled) return 'bg-red-100 text-red-800';
  if (!isFuture) return 'bg-slate-100 text-slate-800';
  return 'bg-green-100 text-green-800';
}
