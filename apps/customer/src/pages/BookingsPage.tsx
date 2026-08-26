import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, listBookings, listCustomers, listDepartures } from '../lib/api';
import type { Booking } from '../types/booking';
import type { Customer } from '../types/customer';
import type { ScheduledDeparture } from '../types/transport';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      bookings: Booking[];
      customersById: Map<string, string>;
      departuresById: Map<string, ScheduledDeparture>;
    };

export function BookingsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading' });

    Promise.all([
      listBookings(),
      listCustomers().catch(() => [] as Customer[]),
      listDepartures().catch(() => [] as ScheduledDeparture[]),
    ])
      .then(([bookings, customers, departures]) => {
        if (cancelled) return;
        const customersById = new Map(customers.map((c) => [c.id, c.name]));
        const departuresById = new Map(departures.map((d) => [d.id, d]));
        setState({ status: 'success', bookings, customersById, departuresById });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar as reservas.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reservas</h1>
        <Button onClick={() => void navigate('/bookings/new')}>+ Nova reserva</Button>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando reservas...</p>
      )}

      {state.status === 'error' && (
        <div role="alert" aria-live="assertive" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <BookingTable
          bookings={state.bookings}
          customersById={state.customersById}
          departuresById={state.departuresById}
        />
      )}
    </div>
  );
}

function BookingTable({
  bookings,
  customersById,
  departuresById,
}: {
  bookings: Booking[];
  customersById: Map<string, string>;
  departuresById: Map<string, ScheduledDeparture>;
}) {
  const navigate = useNavigate();

  if (bookings.length === 0) {
    return <p className="text-sm text-slate-500">Nenhuma reserva cadastrada ainda.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Cliente (comprador)</th>
            <th className="px-4 py-3">Tipo</th>
            <th className="px-4 py-3">Saída</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((booking) => {
            const departure = departuresById.get(booking.outboundDepartureId);
            return (
              <tr key={booking.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {customersById.get(booking.bookerCustomerId) ?? booking.bookerCustomerId}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {booking.tripType === 'ROUND_TRIP' ? 'Ida e volta' : 'Somente ida'}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {departure ? new Date(departure.departureAt).toLocaleString('pt-BR') : '—'}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {booking.cancelled ? 'Cancelada' : 'Ativa'}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void navigate(`/bookings/${booking.id}`)}
                  >
                    Detalhes
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
