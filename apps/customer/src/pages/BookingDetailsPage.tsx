import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, cancelBooking, getBooking, getCustomer, getDeparture } from '../lib/api';
import type { Booking, BookingPassenger } from '../types/booking';
import type { ScheduledDeparture } from '../types/transport';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      booking: Booking;
      passengers: BookingPassenger[];
      bookerName: string | null;
      outboundDeparture: ScheduledDeparture | null;
      returnDeparture: ScheduledDeparture | null;
    };

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Reserva não encontrada.';
  }
  return 'Não foi possível carregar a reserva. Tente novamente.';
}

export function BookingDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [cancelling, setCancelling] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setState({ status: 'error', message: 'Reserva não encontrada.' });
      return;
    }

    setState({ status: 'loading' });

    getBooking(id)
      .then(async ({ booking, passengers }) => {
        if (cancelled) return;

        const bookerName = await getCustomer(booking.bookerCustomerId)
          .then((c) => c.name)
          .catch(() => null);

        const outboundDeparture = await getDeparture(booking.outboundDepartureId).catch(
          () => null,
        );
        const returnDeparture = booking.returnDepartureId
          ? await getDeparture(booking.returnDepartureId).catch(() => null)
          : null;

        if (cancelled) return;
        setState({
          status: 'success',
          booking,
          passengers,
          bookerName,
          outboundDeparture,
          returnDeparture,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ status: 'error', message: mapErrorToMessage(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === 'loading') {
    return <p className="text-sm text-slate-500">Carregando reserva...</p>;
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col gap-4">
        <div role="alert" aria-live="assertive" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
        <Button variant="outline" onClick={() => void navigate('/bookings')}>
          Voltar para reservas
        </Button>
      </div>
    );
  }

  const { booking, passengers, bookerName, outboundDeparture, returnDeparture } = state;

  const handleCancel = async () => {
    if (!id) return;
    setCancelling(true);
    try {
      const result = await cancelBooking(id);
      setState((prev) =>
        prev.status === 'success'
          ? { ...prev, booking: result.booking }
          : prev,
      );
      setConfirmVisible(false);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Não foi possível cancelar a reserva.';
      setState({ status: 'error', message });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Reserva {booking.cancelled ? '(Cancelada)' : ''}
        </h1>
        <div className="flex gap-3">
          {!booking.cancelled && (
            <>
              {confirmVisible ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">Tem certeza?</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={cancelling}
                    onClick={() => void handleCancel()}
                  >
                    {cancelling ? 'Cancelando...' : 'Sim, cancelar'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={cancelling}
                    onClick={() => setConfirmVisible(false)}
                  >
                    Não
                  </Button>
                </div>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmVisible(true)}
                >
                  Cancelar reserva
                </Button>
              )}
            </>
          )}
          <Button variant="outline" onClick={() => void navigate('/bookings')}>
            Voltar
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Cliente (comprador)
          </dt>
          <dd className="text-sm text-slate-900">{bookerName ?? booking.bookerCustomerId}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Tipo de viagem
          </dt>
          <dd className="text-sm text-slate-900">
            {booking.tripType === 'ROUND_TRIP' ? 'Ida e volta' : 'Somente ida'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Saída de ida
          </dt>
          <dd className="text-sm text-slate-900">
            {outboundDeparture
              ? new Date(outboundDeparture.departureAt).toLocaleString('pt-BR')
              : booking.outboundDepartureId}
          </dd>
        </div>
        {booking.tripType === 'ROUND_TRIP' && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Saída de volta
            </dt>
            <dd className="text-sm text-slate-900">
              {returnDeparture
                ? new Date(returnDeparture.departureAt).toLocaleString('pt-BR')
                : booking.returnDepartureId}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt>
          <dd className="text-sm text-slate-900">{booking.cancelled ? 'Cancelada' : 'Ativa'}</dd>
        </div>
        {booking.notes && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Notas</dt>
            <dd className="text-sm text-slate-900">{booking.notes}</dd>
          </div>
        )}
      </dl>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">
          Passageiros ({passengers.length})
        </h2>
        {passengers.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum passageiro.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {passengers.map((passenger) => (
              <li key={passenger.id} className="text-sm text-slate-900">
                {passenger.name}
                {passenger.notes && (
                  <span className="ml-2 text-xs text-slate-500">({passenger.notes})</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
