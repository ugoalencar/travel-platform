import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, getMyBooking } from '../../lib/customerApi';
import type { BookingPassenger } from '../../types/booking';
import type { CustomerBookingView } from '../../types/customer-portal';
import { bookingStatusLabel, tripTypeLabel } from '../../lib/statusLabels';
import { BackLink } from '../BackLink';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; booking: CustomerBookingView; passengers: BookingPassenger[] };

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

  return (
    <div className="flex flex-col gap-4">
      <BackLink to="/customer-portal/bookings" label="Voltar para minhas reservas" />

      <div aria-live="polite">
        {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
        {state.status === 'error' && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
      </div>

      {state.status === 'success' && (
        <BookingDetails booking={state.booking} passengers={state.passengers} />
      )}
    </div>
  );
}

function BookingDetails({
  booking,
  passengers,
}: {
  booking: CustomerBookingView;
  passengers: BookingPassenger[];
}) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {booking.origin} → {booking.destination}
      </h1>
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Detail label="Produto" value={booking.productName} />
          <Detail label="Tipo de viagem" value={tripTypeLabel(booking.tripType)} />
          <Detail
            label="Data de partida"
            value={new Date(booking.departureAt).toLocaleDateString('pt-BR')}
          />
          <Detail
            label="Horário de partida"
            value={new Date(booking.departureAt).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          />
          <Detail label="Status" value={bookingStatusLabel(booking)} />
          <Detail label="Passageiros" value={String(booking.passengerCount)} />
        </dl>
        {booking.notes && <p className="mt-3 text-sm text-slate-600">{booking.notes}</p>}
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
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{value}</dd>
    </div>
  );
}
