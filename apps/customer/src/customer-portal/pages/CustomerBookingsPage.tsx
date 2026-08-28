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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Minhas reservas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Acompanhe suas viagens e reservas confirmadas.
        </p>
      </div>

      <div aria-live="polite">
        {state.status === 'loading' && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
            <span className="text-sm text-slate-500">Carregando reservas...</span>
          </div>
        )}
        {state.status === 'error' && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
        {state.status === 'success' && state.bookings.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <div className="text-4xl">📦</div>
            <p className="mt-3 text-sm font-medium text-slate-600">Nenhuma reserva ainda</p>
            <p className="mt-1 text-xs text-slate-400">
              Suas reservas aparecerão aqui após a confirmação.
            </p>
          </div>
        )}
      </div>

      {state.status === 'success' && state.bookings.length > 0 && (
        <div className="flex flex-col gap-4">
          {state.bookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} />
          ))}
        </div>
      )}
    </div>
  );
}

function BookingCard({ booking }: { booking: CustomerBookingView }) {
  const isFuture = booking.isFuture;
  const isCancelled = booking.cancelled;

  const statusColor = isCancelled
    ? 'bg-red-100 text-red-800'
    : booking.isFuture
      ? 'bg-green-100 text-green-800'
      : 'bg-slate-100 text-slate-600';

  const daysUntil = Math.ceil(
    (new Date(booking.departureAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <Link
      to={`/customer-portal/bookings/${booking.id}`}
      className={`group block overflow-hidden rounded-xl border shadow-sm transition-all hover:shadow-md ${
        isCancelled
          ? 'border-red-200 bg-red-50/50 opacity-75'
          : isFuture
            ? 'border-teal-200 bg-white hover:border-teal-300'
            : 'border-slate-200 bg-slate-50'
      }`}
    >
      {/* Route Header */}
      <div
        className={`relative p-5 ${
          isCancelled
            ? 'bg-gradient-to-br from-red-50 to-red-100'
            : isFuture
              ? 'bg-gradient-to-br from-teal-50 to-teal-100'
              : 'bg-gradient-to-br from-slate-50 to-slate-100'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✈️</span>
            <div>
              <p className="text-lg font-bold text-slate-900">
                {booking.origin} → {booking.destination}
              </p>
              <p className="text-sm text-slate-600">{booking.productName}</p>
            </div>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              statusColor
            }`}
          >
            {bookingStatusLabel(booking)}
          </span>
        </div>
      </div>

      {/* Booking Info */}
      <div className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500">
            📅 {new Date(booking.departureAt).toLocaleDateString('pt-BR')} às{' '}
            {new Date(booking.departureAt).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
          {!isFuture && !isCancelled && daysUntil > 0 && (
            <span className="text-xs font-semibold text-teal-600">
              Faltam {daysUntil} dias
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>{tripTypeLabel(booking.tripType)}</span>
          <span>
            {booking.passengerCount}{' '}
            {booking.passengerCount === 1 ? 'passageiro' : 'passageiros'}
          </span>
        </div>
      </div>
    </Link>
  );
}
