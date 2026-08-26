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
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Minhas reservas</h1>

      <div aria-live="polite">
        {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
        {state.status === 'error' && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
        {state.status === 'success' && state.bookings.length === 0 && (
          <p className="text-sm text-slate-500">Nenhuma reserva por aqui ainda.</p>
        )}
      </div>
      {state.status === 'success' && (
        <ul className="flex flex-col gap-3">
          {state.bookings.map((booking) => (
            <li key={booking.id}>
              <Link
                to={`/customer-portal/bookings/${booking.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-teal-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
              >
                <p className="font-medium text-slate-900">
                  {booking.origin} → {booking.destination}
                </p>
                <p className="text-sm text-slate-600">{booking.productName}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(booking.departureAt).toLocaleDateString('pt-BR')} às{' '}
                  {new Date(booking.departureAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {' · '}
                  {tripTypeLabel(booking.tripType)}
                  {' · '}
                  {booking.passengerCount}{' '}
                  {booking.passengerCount === 1 ? 'passageiro' : 'passageiros'}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {bookingStatusLabel(booking)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
