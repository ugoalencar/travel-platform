import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getTrip, getCustomer } from '../lib/api';
import type { Trip } from '../types/trip';
import type { Customer } from '../types/customer';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; trip: Trip; customer: Customer | null };

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return 'Viagem não encontrada.';
    }
    return 'Não foi possível carregar a viagem. Tente novamente.';
  }
  return 'Não foi possível carregar a viagem. Tente novamente.';
}

export function TripDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setState({ status: 'error', message: 'Viagem não encontrada.' });
      return;
    }

    setState({ status: 'loading' });

    getTrip(id)
      .then(async (trip) => {
        if (cancelled) return;
        let customer: Customer | null = null;
        try {
          customer = await getCustomer(trip.customerId);
        } catch {
          // Customer load failure is non-fatal for the details page
        }
        if (!cancelled) {
          setState({ status: 'success', trip, customer });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ status: 'error', message: mapErrorToMessage(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Detalhes da viagem
        </h1>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => void navigate('/trips')}>
            Voltar
          </Button>
          {state.status === 'success' && (
            <Button onClick={() => void navigate(`/trips/${state.trip.id}/edit`)}>
              Editar
            </Button>
          )}
        </div>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando viagem...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <dl className="grid max-w-lg grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2">
          <Field label="Nome" value={state.trip.name} />
          <Field label="Destino" value={state.trip.destination} />
          <Field
            label="Data de início"
            value={new Date(state.trip.startDate).toLocaleDateString('pt-BR')}
          />
          <Field
            label="Data de fim"
            value={new Date(state.trip.endDate).toLocaleDateString('pt-BR')}
          />
          <Field label="Status" value={state.trip.status} />
          <Field label="Cliente" value={state.customer?.name} />
          <Field label="Descrição" value={state.trip.description} />
          <Field label="Notas" value={state.trip.notes} />
        </dl>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="text-sm text-slate-900">{value ?? '—'}</dd>
    </div>
  );
}
