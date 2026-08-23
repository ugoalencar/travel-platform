import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, listMyBookings } from '../../lib/customerApi';
import type { Booking } from '../../types/booking';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; bookings: Booking[] };

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

      {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}
      {state.status === 'success' && state.bookings.length === 0 && (
        <p className="text-sm text-slate-500">Nenhuma reserva por aqui ainda.</p>
      )}
      {state.status === 'success' && (
        <ul className="flex flex-col gap-3">
          {state.bookings.map((booking) => (
            <li key={booking.id}>
              <Link
                to={`/customer-portal/bookings/${booking.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-teal-300"
              >
                <p className="font-medium text-slate-900">
                  {booking.tripType === 'ROUND_TRIP' ? 'Ida e volta' : 'Somente ida'}
                </p>
                <p className="text-xs text-slate-500">
                  {booking.cancelled ? 'Cancelada' : 'Ativa'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
