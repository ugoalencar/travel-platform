import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, getMyBooking } from '../../lib/customerApi';
import type { CustomerBookingView } from '../../types/customer-portal';
import { bookingStatusLabel } from '../../lib/statusLabels';
import { BackLink } from '../BackLink';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; booking: CustomerBookingView };

export function CustomerBookingDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getMyBooking(id)
      .then(({ booking }) => {
        if (!cancelled) setState({ status: 'success', booking });
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
    <div className="flex flex-col gap-6">
      <BackLink to="/customer-portal/bookings" label="Voltar para minhas reservas" />

      <div aria-live="polite">
        {state.status === 'loading' && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
            <span className="text-sm text-slate-500">Carregando reserva...</span>
          </div>
        )}
        {state.status === 'error' && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
      </div>

      {state.status === 'success' && <BookingDetails booking={state.booking} />}
    </div>
  );
}

function BookingDetails({ booking }: { booking: CustomerBookingView }) {
  const statusLabel = bookingStatusLabel(booking);
  const isCancelled = booking.cancelled;
  const isFuture = booking.isFuture;

  const statusColor = isCancelled
    ? 'bg-red-100 text-red-800'
    : isFuture
      ? 'bg-green-100 text-green-800'
      : 'bg-slate-100 text-slate-600';

  const daysUntil = Math.ceil(
    (new Date(booking.departureAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <>
      {/* Hero - Travel Route */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 p-8 text-white shadow-xl">
        <div className="absolute -right-8 -top-8 text-8xl opacity-20">✈️</div>
        <div className="relative">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                statusColor
              }`}
            >
              {statusLabel}
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">{booking.productName}</h1>

          <div className="mt-4 flex items-center gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold">
                {new Date(booking.departureAt).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'short',
                })}
              </p>
              <p className="text-xs text-teal-100">{booking.origin}</p>
            </div>
            <div className="flex-1 text-center">
              <div className="text-xs text-teal-200">
                {booking.tripType === 'ROUND_TRIP' ? '🔄 Ida e volta' : '➡️ Somente ida'}
              </div>
              <div className="mt-1 text-sm">✈️ ──────────── ✈️</div>
              {isFuture && daysUntil > 0 && (
                <p className="text-xs text-teal-100">Faltam {daysUntil} dias</p>
              )}
            </div>
            <div>
              <p className="text-2xl font-bold">
                {booking.arrivalExpectedAt
                  ? new Date(booking.arrivalExpectedAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                    })
                  : '--'}
              </p>
              <p className="text-xs text-teal-100">{booking.destination}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Flight Info */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Detalhes do voo
        </h2>
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-100 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Ida</span>
            </div>
            <div className="mt-3 flex items-center gap-4">
              <div className="text-right">
                <p className="text-xl font-bold text-slate-900">
                  {new Date(booking.departureAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <p className="text-xs text-slate-500">{booking.origin}</p>
              </div>
              <div className="flex-1 text-center">
                <div className="text-xs text-slate-400">✈️ ──── ✈️</div>
                <p className="text-xs text-slate-500">Classe executiva</p>
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">
                  {booking.arrivalExpectedAt
                    ? new Date(booking.arrivalExpectedAt).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '--'}
                </p>
                <p className="text-xs text-slate-500">{booking.destination}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Travel Info */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Informações de viagem
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500">Tipo de viagem</p>
            <p className="font-medium text-slate-900">
              {booking.tripType === 'ROUND_TRIP' ? 'Ida e volta' : 'Somente ida'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Número de passageiros</p>
            <p className="font-medium text-slate-900">{booking.passengerCount}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Data de ida</p>
            <p className="font-medium text-slate-900">
              {new Date(booking.departureAt).toLocaleDateString('pt-BR')}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Data de retorno</p>
            <p className="font-medium text-slate-900">
              {booking.arrivalExpectedAt
                ? new Date(booking.arrivalExpectedAt).toLocaleDateString('pt-BR')
                : 'Somente ida'}
            </p>
          </div>
        </div>
      </div>

      {/* Status Banner */}
      {!isCancelled && isFuture && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-lg">
              ✅
            </div>
            <div>
              <p className="text-sm font-semibold text-green-900">Reserva confirmada</p>
              <p className="text-xs text-green-700">
                Todos os passageiros estão confirmados. Tenha uma boa viagem!
              </p>
            </div>
          </div>
        </div>
      )}

      {isCancelled && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-lg">
              ❌
            </div>
            <div>
              <p className="text-sm font-semibold text-red-900">Reserva cancelada</p>
              <p className="text-xs text-red-700">
                Esta reserva foi cancelada. Entre em contato com sua agência para mais informações.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Note */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
        <p>
          Para informações adicionais, entre em contato com sua agência de viagens.
        </p>
      </div>
    </>
  );
}
