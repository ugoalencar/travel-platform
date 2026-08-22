import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getRoute, updateRoute } from '../lib/api';
import type { UpdateRouteInput } from '../types/transport';
import { Button } from '../components/ui/button';
import { RoutePointsEditor } from '../components/RoutePointsEditor';

interface FormFields {
  origin: string;
  destination: string;
  estimatedDuration: string;
  distance: string;
  notes: string;
  active: boolean;
}

const emptyFields: FormFields = {
  origin: '',
  destination: '',
  estimatedDuration: '',
  distance: '',
  notes: '',
  active: true,
};

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

function mapLoadErrorToMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Rota não encontrada.';
  }
  return 'Não foi possível carregar a rota. Tente novamente.';
}

function mapSubmitErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Sessão local indisponível. Verifique a autenticação de desenvolvimento.';
      case 403:
        return 'Você não tem permissão para editar rotas.';
      case 404:
        return 'Rota não encontrada.';
      default:
        return 'Não foi possível salvar a rota. Tente novamente.';
    }
  }
  return 'Não foi possível salvar a rota. Tente novamente.';
}

export function TransportRouteEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [fields, setFields] = useState<FormFields>(emptyFields);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setLoadState({ status: 'error', message: 'Rota não encontrada.' });
      return;
    }

    setLoadState({ status: 'loading' });

    getRoute(id)
      .then((route) => {
        if (cancelled) return;
        setFields({
          origin: route.origin,
          destination: route.destination,
          estimatedDuration:
            route.estimatedDuration !== undefined ? String(route.estimatedDuration) : '',
          distance: route.distance !== undefined ? String(route.distance) : '',
          notes: route.notes ?? '',
          active: route.active,
        });
        setLoadState({ status: 'ready' });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadState({ status: 'error', message: mapLoadErrorToMessage(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  function updateField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting || !id) {
      return;
    }

    const origin = fields.origin.trim();
    const destination = fields.destination.trim();
    if (!origin || !destination) {
      setError('Origem e destino são obrigatórios.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const input: UpdateRouteInput = { origin, destination, active: fields.active };
    if (fields.estimatedDuration.trim()) {
      input.estimatedDuration = Number(fields.estimatedDuration.trim());
    }
    if (fields.distance.trim()) {
      input.distance = Number(fields.distance.trim());
    }
    if (fields.notes.trim()) {
      input.notes = fields.notes.trim();
    }

    try {
      await updateRoute(id, input);
      void navigate(`/transport/routes/${id}`);
    } catch (err: unknown) {
      setError(mapSubmitErrorToMessage(err));
      setSubmitting(false);
    }
  }

  if (loadState.status === 'loading') {
    return <p className="text-sm text-slate-500">Carregando rota...</p>;
  }

  if (loadState.status === 'error') {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Editar rota</h1>
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadState.message}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Editar rota</h1>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="flex max-w-lg flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="route-origin" className="text-sm font-medium text-slate-700">
            Origem
          </label>
          <input
            id="route-origin"
            name="origin"
            value={fields.origin}
            onChange={(event) => updateField('origin', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="route-destination" className="text-sm font-medium text-slate-700">
            Destino
          </label>
          <input
            id="route-destination"
            name="destination"
            value={fields.destination}
            onChange={(event) => updateField('destination', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="route-duration" className="text-sm font-medium text-slate-700">
            Duração estimada (min)
          </label>
          <input
            id="route-duration"
            name="estimatedDuration"
            type="number"
            min="0"
            value={fields.estimatedDuration}
            onChange={(event) => updateField('estimatedDuration', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="route-distance" className="text-sm font-medium text-slate-700">
            Distância (km)
          </label>
          <input
            id="route-distance"
            name="distance"
            type="number"
            min="0"
            step="0.01"
            value={fields.distance}
            onChange={(event) => updateField('distance', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="route-notes" className="text-sm font-medium text-slate-700">
            Notas
          </label>
          <textarea
            id="route-notes"
            name="notes"
            value={fields.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            rows={3}
          />
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="active"
            checked={fields.active}
            onChange={(event) => updateField('active', event.target.checked)}
          />
          Ativa
        </label>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => void navigate(`/transport/routes/${id}`)}
          >
            Cancelar
          </Button>
        </div>
      </form>

      {/*
        RoutePoints require an existing routeId, so this editor only
        appears once the Route has been saved -- on the Create page
        (TransportRouteFormPage) points cannot be added until after the
        POST succeeds and the user lands here or on the details page.
      */}
      {id && <RoutePointsEditor routeId={id} />}
    </div>
  );
}
