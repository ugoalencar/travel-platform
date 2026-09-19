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
  const departureDate = new Date(booking.departureAt);
  const isFuture = booking.isFuture !== false;
  const statusLabel = bookingStatusLabel(booking);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {booking.origin} <span className="text-slate-400">→</span> {booking.destination}
          </h1>
          <p className="mt-2 text-lg text-slate-700">{booking.productName}</p>
        </div>
        <span className={`inline-block rounded-full px-4 py-2 text-sm font-semibold ${
          isFuture && !booking.cancelled
            ? 'bg-green-100 text-green-900'
            : 'bg-slate-100 text-slate-900'
        }`}>
          {statusLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border-2 border-slate-200 bg-gradient-to-br from-green-50 to-emerald-50 p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 mb-3">✈️ Detalhes da viagem</h3>
          <div className="space-y-3">
            <DetailItem label="Tipo de viagem" value={tripTypeLabel(booking.tripType)} />
            <DetailItem
              label="Data de partida"
              value={departureDate.toLocaleDateString('pt-BR', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <DetailItem
              label="Horário de partida"
              value={departureDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            />
          </div>
        </div>

        <div className="rounded-xl border-2 border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 mb-3">👥 Passageiros</h3>
          {passengers.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum passageiro cadastrado.</p>
          ) : (
            <ul className="space-y-2">
              {passengers.map((passenger) => (
                <li key={passenger.id} className="flex items-center gap-2">
                  <span className="text-slate-400" aria-hidden="true">•</span>
                  <span className="text-sm font-medium text-slate-900">{passenger.name}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500 pt-3 border-t border-slate-200">
            Total: {booking.passengerCount} {booking.passengerCount === 1 ? 'passageiro' : 'passageiros'}
          </p>
        </div>
      </div>

      {booking.notes && (
        <div className="rounded-xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100 p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-900 mb-2">📌 Observações</h3>
          <p className="text-sm text-amber-800">{booking.notes}</p>
        </div>
      )}
      {/* Deliberately no cancel button in this vertical. */}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}
