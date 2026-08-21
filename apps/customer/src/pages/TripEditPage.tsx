import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getTrip, updateTrip } from '../lib/api';
import type { UpdateTripInput } from '../types/trip';
import { Button } from '../components/ui/button';

interface FormFields {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  description: string;
  notes: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' };

function mapLoadErrorToMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Viagem não encontrada.';
  }
  return 'Não foi possível carregar a viagem. Tente novamente.';
}

function mapSubmitErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Sessão local indisponível. Verifique a autenticação de desenvolvimento.';
      case 403:
        return 'Você não tem permissão para editar viagens.';
      case 404:
        return 'Viagem não encontrada.';
      default:
        return 'Não foi possível salvar a viagem. Tente novamente.';
    }
  }
  return 'Não foi possível salvar a viagem. Tente novamente.';
}

function formatDateInput(iso: string): string {
  return iso.slice(0, 10);
}

export function TripEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [fields, setFields] = useState<FormFields>({
    name: '',
    destination: '',
    startDate: '',
    endDate: '',
    description: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setLoadState({ status: 'error', message: 'Viagem não encontrada.' });
      return;
    }

    setLoadState({ status: 'loading' });

    getTrip(id)
      .then((trip) => {
        if (cancelled) return;
        setFields({
          name: trip.name,
          destination: trip.destination,
          startDate: formatDateInput(trip.startDate),
          endDate: formatDateInput(trip.endDate),
          description: trip.description ?? '',
          notes: trip.notes ?? '',
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

  function updateField<K extends keyof FormFields>(key: K, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting || !id) {
      return;
    }

    const name = fields.name.trim();
    const destination = fields.destination.trim();
    const startDate = fields.startDate;
    const endDate = fields.endDate;

    if (!name) {
      setError('Nome é obrigatório.');
      return;
    }
    if (!destination) {
      setError('Destino é obrigatório.');
      return;
    }
    if (!startDate) {
      setError('Data de início é obrigatória.');
      return;
    }
    if (!endDate) {
      setError('Data de fim é obrigatória.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const input: UpdateTripInput = { name, destination, startDate, endDate };
    const description = fields.description.trim();
    const notes = fields.notes.trim();
    if (description) input.description = description;
    else input.description = '';
    if (notes) input.notes = notes;
    else input.notes = '';

    try {
      await updateTrip(id, input);
      void navigate(`/trips/${id}`);
    } catch (err: unknown) {
      setError(mapSubmitErrorToMessage(err));
      setSubmitting(false);
    }
  }

  if (loadState.status === 'loading') {
    return <p className="text-sm text-slate-500">Carregando viagem...</p>;
  }

  if (loadState.status === 'error') {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Editar viagem
        </h1>
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadState.message}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Editar viagem
      </h1>

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
          <label htmlFor="trip-name" className="text-sm font-medium text-slate-700">
            Nome
          </label>
          <input
            id="trip-name"
            name="name"
            type="text"
            required
            value={fields.name}
            onChange={(event) => updateField('name', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="trip-destination" className="text-sm font-medium text-slate-700">
            Destino
          </label>
          <input
            id="trip-destination"
            name="destination"
            type="text"
            required
            value={fields.destination}
            onChange={(event) => updateField('destination', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="trip-start-date" className="text-sm font-medium text-slate-700">
            Data de início
          </label>
          <input
            id="trip-start-date"
            name="startDate"
            type="date"
            required
            value={fields.startDate}
            onChange={(event) => updateField('startDate', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="trip-end-date" className="text-sm font-medium text-slate-700">
            Data de fim
          </label>
          <input
            id="trip-end-date"
            name="endDate"
            type="date"
            required
            value={fields.endDate}
            onChange={(event) => updateField('endDate', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="trip-description" className="text-sm font-medium text-slate-700">
            Descrição
          </label>
          <textarea
            id="trip-description"
            name="description"
            value={fields.description}
            onChange={(event) => updateField('description', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            rows={3}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="trip-notes" className="text-sm font-medium text-slate-700">
            Notas
          </label>
          <textarea
            id="trip-notes"
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
            onClick={() => void navigate(`/trips/${id}`)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
