import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createRoute } from '../lib/api';
import type { CreateRouteInput } from '../types/transport';
import { Button } from '../components/ui/button';

interface FormFields {
  origin: string;
  destination: string;
  estimatedDuration: string;
  distance: string;
  notes: string;
}

const initialFields: FormFields = {
  origin: '',
  destination: '',
  estimatedDuration: '',
  distance: '',
  notes: '',
};

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Sessão local indisponível. Verifique a autenticação de desenvolvimento.';
      case 403:
        return 'Você não tem permissão para criar rotas.';
      default:
        return 'Não foi possível salvar a rota. Tente novamente.';
    }
  }
  return 'Não foi possível salvar a rota. Tente novamente.';
}

export function TransportRouteFormPage() {
  const navigate = useNavigate();
  const [fields, setFields] = useState<FormFields>(initialFields);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof FormFields>(key: K, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
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

    const input: CreateRouteInput = { origin, destination };
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
      const created = await createRoute(input);
      void navigate(`/transport/routes/${created.id}`);
    } catch (err: unknown) {
      setError(mapErrorToMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Nova rota</h1>

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

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => void navigate('/transport/routes')}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
