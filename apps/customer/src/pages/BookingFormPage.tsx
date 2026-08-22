import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createBooking, listCustomers, listDepartures } from '../lib/api';
import type { CreateBookingInput } from '../types/booking';
import type { Customer } from '../types/customer';
import type { ScheduledDeparture } from '../types/transport';
import { Button } from '../components/ui/button';

type RelationsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; customers: Customer[]; departures: ScheduledDeparture[] };

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Sessão local indisponível. Verifique a autenticação de desenvolvimento.';
      case 403:
        return 'Você não tem permissão para criar reservas.';
      case 404:
        return 'Cliente ou saída selecionada não foi encontrada.';
      case 409:
        return 'Não há assentos suficientes disponíveis nessa saída para o número de passageiros informado.';
      default:
        return 'Não foi possível salvar a reserva. Tente novamente.';
    }
  }
  return 'Não foi possível salvar a reserva. Tente novamente.';
}

export function BookingFormPage() {
  const navigate = useNavigate();
  const [bookerCustomerId, setBookerCustomerId] = useState('');
  const [tripType, setTripType] = useState<'ONE_WAY' | 'ROUND_TRIP'>('ONE_WAY');
  const [outboundDepartureId, setOutboundDepartureId] = useState('');
  const [returnDepartureId, setReturnDepartureId] = useState('');
  const [notes, setNotes] = useState('');
  const [passengerNames, setPassengerNames] = useState<string[]>(['']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relationsState, setRelationsState] = useState<RelationsState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    setRelationsState({ status: 'loading' });

    Promise.all([listCustomers(), listDepartures()])
      .then(([customers, departures]) => {
        if (cancelled) return;
        setRelationsState({ status: 'ready', customers, departures });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? err.message : 'Não foi possível carregar os dados relacionados.';
        setRelationsState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const outboundDeparture =
    relationsState.status === 'ready'
      ? relationsState.departures.find((d) => d.id === outboundDepartureId)
      : undefined;

  // Client-side UX filter only: only departures later than the selected
  // outbound are offered as a return. Not authoritative -- the backend
  // re-validates temporal ordering on submit regardless.
  const eligibleReturnDepartures =
    relationsState.status === 'ready' && outboundDeparture
      ? relationsState.departures.filter(
          (d) => d.id !== outboundDepartureId && new Date(d.departureAt) > new Date(outboundDeparture.departureAt),
        )
      : [];

  function addPassenger() {
    setPassengerNames((prev) => [...prev, '']);
  }

  function removePassenger(index: number) {
    setPassengerNames((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function updatePassenger(index: number, value: string) {
    setPassengerNames((prev) => prev.map((name, i) => (i === index ? value : name)));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    if (!bookerCustomerId.trim()) {
      setError('Cliente (comprador) é obrigatório.');
      return;
    }
    if (!outboundDepartureId.trim()) {
      setError('Saída de ida é obrigatória.');
      return;
    }
    if (tripType === 'ROUND_TRIP' && !returnDepartureId.trim()) {
      setError('Saída de volta é obrigatória para ida e volta.');
      return;
    }

    const passengers = passengerNames
      .map((name) => name.trim())
      .filter((name) => name.length > 0)
      .map((name) => ({ name }));

    if (passengers.length === 0) {
      setError('É necessário informar ao menos um passageiro.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const input: CreateBookingInput = {
      bookerCustomerId: bookerCustomerId.trim(),
      tripType,
      outboundDepartureId: outboundDepartureId.trim(),
      passengers,
    };
    if (tripType === 'ROUND_TRIP') {
      input.returnDepartureId = returnDepartureId.trim();
    }
    if (notes.trim()) {
      input.notes = notes.trim();
    }

    try {
      const created = await createBooking(input);
      void navigate(`/bookings/${created.booking.id}`);
    } catch (err: unknown) {
      setError(mapErrorToMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Nova reserva</h1>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {relationsState.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {relationsState.message}
        </div>
      )}

      {(relationsState.status === 'ready' || relationsState.status === 'loading') && (
        <form
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          className="flex max-w-lg flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="booking-customer" className="text-sm font-medium text-slate-700">
              Cliente (comprador da reserva)
            </label>
            <select
              id="booking-customer"
              disabled={relationsState.status === 'loading'}
              value={bookerCustomerId}
              onChange={(event) => setBookerCustomerId(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">
                {relationsState.status === 'loading' ? 'Carregando clientes...' : 'Selecione um cliente'}
              </option>
              {relationsState.status === 'ready' &&
                relationsState.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="booking-trip-type" className="text-sm font-medium text-slate-700">
              Tipo de viagem
            </label>
            <select
              id="booking-trip-type"
              value={tripType}
              onChange={(event) => {
                setTripType(event.target.value as 'ONE_WAY' | 'ROUND_TRIP');
                setReturnDepartureId('');
              }}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="ONE_WAY">Somente ida</option>
              <option value="ROUND_TRIP">Ida e volta</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="booking-outbound" className="text-sm font-medium text-slate-700">
              Saída de ida
            </label>
            <select
              id="booking-outbound"
              disabled={relationsState.status === 'loading'}
              value={outboundDepartureId}
              onChange={(event) => {
                setOutboundDepartureId(event.target.value);
                setReturnDepartureId('');
              }}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">
                {relationsState.status === 'loading' ? 'Carregando saídas...' : 'Selecione uma saída'}
              </option>
              {relationsState.status === 'ready' &&
                relationsState.departures.map((departure) => (
                  <option key={departure.id} value={departure.id}>
                    {new Date(departure.departureAt).toLocaleString('pt-BR')} — capacidade{' '}
                    {departure.capacity}
                  </option>
                ))}
            </select>
            {outboundDeparture && (
              <p className="text-xs text-slate-500">
                Capacidade: {outboundDeparture.capacity} (exibição apenas informativa — o servidor é
                a autoridade real na hora de confirmar).
              </p>
            )}
          </div>

          {tripType === 'ROUND_TRIP' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="booking-return" className="text-sm font-medium text-slate-700">
                Saída de volta
              </label>
              <select
                id="booking-return"
                disabled={!outboundDepartureId}
                value={returnDepartureId}
                onChange={(event) => setReturnDepartureId(event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">
                  {!outboundDepartureId ? 'Selecione a saída de ida primeiro' : 'Selecione a saída de volta'}
                </option>
                {eligibleReturnDepartures.map((departure) => (
                  <option key={departure.id} value={departure.id}>
                    {new Date(departure.departureAt).toLocaleString('pt-BR')} — capacidade{' '}
                    {departure.capacity}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-700">Passageiros</span>
            {passengerNames.map((name, index) => (
              <div key={index} className="flex gap-2">
                <input
                  aria-label={`Nome do passageiro ${index + 1}`}
                  value={name}
                  onChange={(event) => updatePassenger(index, event.target.value)}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Nome do passageiro"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={passengerNames.length <= 1}
                  onClick={() => removePassenger(index)}
                >
                  Remover
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addPassenger}>
              + Adicionar passageiro
            </Button>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="booking-notes" className="text-sm font-medium text-slate-700">
              Notas
            </label>
            <textarea
              id="booking-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => void navigate('/bookings')}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
