import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, getMyBooking } from '../../lib/customerApi';
import type { Booking, BookingPassenger } from '../../types/booking';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; booking: Booking; passengers: BookingPassenger[] };

export function CustomerBookingDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getMyBooking(id)
      .then(({ booking, passengers }) => {
        if (!cancelled) setState({ status: 'success', booking, passengers });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar esta reserva.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === 'loading') {
    return <p className="text-sm text-slate-500">Carregando...</p>;
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {state.message}
      </div>
    );
  }

  const { booking, passengers } = state;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {booking.tripType === 'ROUND_TRIP' ? 'Reserva de ida e volta' : 'Reserva de ida'}
      </h1>
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-600">
          Status: {booking.cancelled ? 'Cancelada' : 'Ativa'}
        </p>
        {booking.notes && <p className="mt-2 text-sm text-slate-600">{booking.notes}</p>}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">
          Passageiros
        </h2>
        {passengers.length === 0 && (
          <p className="text-sm text-slate-500">Nenhum passageiro cadastrado.</p>
        )}
        <ul className="flex flex-col gap-1">
          {passengers.map((passenger) => (
            <li key={passenger.id} className="text-sm text-slate-900">
              {passenger.name}
            </li>
          ))}
        </ul>
      </div>
      {/* Deliberately no cancel button in this vertical. */}
    </div>
  );
}
