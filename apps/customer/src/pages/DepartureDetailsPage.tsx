import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getDeparture, getSupplier, getTransportProduct } from '../lib/api';
import type { ScheduledDeparture } from '../types/transport';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      departure: ScheduledDeparture;
      productName: string | null;
      supplierName: string | null;
    };

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Saída não encontrada.';
  }
  return 'Não foi possível carregar a saída. Tente novamente.';
}

export function DepartureDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setState({ status: 'error', message: 'Saída não encontrada.' });
      return;
    }

    setState({ status: 'loading' });

    getDeparture(id)
      .then(async (departure) => {
        if (cancelled) return;

        const productName = await getTransportProduct(departure.productId)
          .then((p) => p.name)
          .catch(() => null);

        const supplierName = departure.supplierId
          ? await getSupplier(departure.supplierId)
              .then((s) => s.name)
              .catch(() => null)
          : null;

        if (cancelled) return;
        setState({ status: 'success', departure, productName, supplierName });
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
          Detalhes da saída
        </h1>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => void navigate('/transport/departures')}>
            Voltar
          </Button>
          {state.status === 'success' && (
            <Button onClick={() => void navigate(`/transport/departures/${state.departure.id}/edit`)}>
              Editar
            </Button>
          )}
        </div>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando saída...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <dl className="grid max-w-lg grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2">
          <Field label="Produto" value={state.productName ?? state.departure.productId} />
          <Field label="Data/hora de saída" value={state.departure.departureAt} />
          <Field label="Chegada prevista" value={state.departure.arrivalExpectedAt} />
          <Field label="Capacidade" value={String(state.departure.capacity)} />
          <Field label="Vagas disponíveis" value={String(state.departure.cancelled ? 0 : state.departure.capacity)} />
          <Field label="Fornecedor" value={state.supplierName ?? undefined} />
          <Field label="Tipo de serviço" value={state.departure.serviceType} />
          <Field label="Cancelada" value={state.departure.cancelled ? 'Sim' : 'Não'} />
          <Field label="Notas" value={state.departure.notes} />
          <Field label="Criada em" value={state.departure.createdAt} />
          <Field label="Atualizada em" value={state.departure.updatedAt} />
        </dl>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{value ?? '—'}</dd>
    </div>
  );
}
