import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createTransportProduct, listRoutes } from '../lib/api';
import type { CreateTransportProductInput, Route, TripType } from '../types/transport';
import { Button } from '../components/ui/button';

interface FormFields {
  name: string;
  tripType: TripType;
  outboundRouteId: string;
  returnRouteId: string;
  price: string;
  publiclyBookable: boolean;
  notes: string;
}

const initialFields: FormFields = {
  name: '',
  tripType: 'ONE_WAY',
  outboundRouteId: '',
  returnRouteId: '',
  price: '',
  publiclyBookable: false,
  notes: '',
};

type RoutesState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; routes: Route[] };

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Sessão local indisponível. Verifique a autenticação de desenvolvimento.';
      case 403:
        return 'Você não tem permissão para criar produtos de transporte.';
      case 404:
        return 'Rota selecionada não encontrada.';
      default:
        return 'Não foi possível salvar o produto. Tente novamente.';
    }
  }
  return 'Não foi possível salvar o produto. Tente novamente.';
}

export function TransportProductFormPage() {
  const navigate = useNavigate();
  const [fields, setFields] = useState<FormFields>(initialFields);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routesState, setRoutesState] = useState<RoutesState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    setRoutesState({ status: 'loading' });

    listRoutes()
      .then((routes) => {
        if (cancelled) return;
        setRoutesState({ status: 'ready', routes });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? err.message : 'Não foi possível carregar as rotas.';
        setRoutesState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function updateField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleTripTypeChange(tripType: TripType) {
    setFields((prev) => ({
      ...prev,
      tripType,
      // When switching to ONE_WAY, the return-route field is hidden and its
      // value cleared -- ONE_WAY products must not carry a returnRouteId
      // (matches the backend CHECK constraint / ValidationError).
      returnRouteId: tripType === 'ONE_WAY' ? '' : prev.returnRouteId,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const name = fields.name.trim();
    const outboundRouteId = fields.outboundRouteId.trim();
    if (!name) {
      setError('Nome é obrigatório.');
      return;
    }
    if (!outboundRouteId) {
      setError('Rota de ida é obrigatória.');
      return;
    }
    if (!fields.price.trim() || Number.isNaN(Number(fields.price))) {
      setError('Preço é obrigatório.');
      return;
    }
    if (fields.tripType === 'ROUND_TRIP' && !fields.returnRouteId.trim()) {
      setError('Rota de volta é obrigatória para viagens de ida e volta.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const input: CreateTransportProductInput = {
      name,
      tripType: fields.tripType,
      outboundRouteId,
      price: Number(fields.price),
    };
    if (fields.tripType === 'ROUND_TRIP' && fields.returnRouteId.trim()) {
      input.returnRouteId = fields.returnRouteId.trim();
    }
    if (fields.publiclyBookable) input.publiclyBookable = true;
    if (fields.notes.trim()) input.notes = fields.notes.trim();

    try {
      const created = await createTransportProduct(input);
      void navigate(`/transport/products/${created.id}`);
    } catch (err: unknown) {
      setError(mapErrorToMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Novo produto</h1>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {routesState.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {routesState.message}
        </div>
      )}

      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="flex max-w-lg flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="product-name" className="text-sm font-medium text-slate-700">
            Nome
          </label>
          <input
            id="product-name"
            name="name"
            value={fields.name}
            onChange={(event) => updateField('name', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="product-trip-type" className="text-sm font-medium text-slate-700">
            Tipo de viagem
          </label>
          <select
            id="product-trip-type"
            name="tripType"
            value={fields.tripType}
            onChange={(event) => handleTripTypeChange(event.target.value as TripType)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="ONE_WAY">Somente ida</option>
            <option value="ROUND_TRIP">Ida e volta</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="product-outbound-route" className="text-sm font-medium text-slate-700">
            Rota de ida
          </label>
          <select
            id="product-outbound-route"
            name="outboundRouteId"
            disabled={routesState.status === 'loading'}
            value={fields.outboundRouteId}
            onChange={(event) => updateField('outboundRouteId', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">
              {routesState.status === 'loading' ? 'Carregando rotas...' : 'Selecione uma rota'}
            </option>
            {routesState.status === 'ready' &&
              routesState.routes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.origin} → {route.destination}
                </option>
              ))}
          </select>
        </div>

        {fields.tripType === 'ROUND_TRIP' && (
          <div className="flex flex-col gap-1" data-testid="return-route-field">
            <label htmlFor="product-return-route" className="text-sm font-medium text-slate-700">
              Rota de volta
            </label>
            <select
              id="product-return-route"
              name="returnRouteId"
              disabled={routesState.status === 'loading'}
              value={fields.returnRouteId}
              onChange={(event) => updateField('returnRouteId', event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">
                {routesState.status === 'loading' ? 'Carregando rotas...' : 'Selecione uma rota'}
              </option>
              {routesState.status === 'ready' &&
                routesState.routes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.origin} → {route.destination}
                  </option>
                ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="product-price" className="text-sm font-medium text-slate-700">
            Preço
          </label>
          <input
            id="product-price"
            name="price"
            type="number"
            min="0"
            step="0.01"
            value={fields.price}
            onChange={(event) => updateField('price', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="publiclyBookable"
            checked={fields.publiclyBookable}
            onChange={(event) => updateField('publiclyBookable', event.target.checked)}
          />
          Vendável publicamente
        </label>

        <div className="flex flex-col gap-1">
          <label htmlFor="product-notes" className="text-sm font-medium text-slate-700">
            Notas
          </label>
          <textarea
            id="product-notes"
            name="notes"
            value={fields.notes}
            onChange={(event) => updateField('notes', event.target.value)}
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
            onClick={() => void navigate('/transport/products')}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
