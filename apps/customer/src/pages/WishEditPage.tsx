import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getWish, updateWish } from '../lib/api';
import type { UpdateWishInput } from '../types/wish';
import { Button } from '../components/ui/button';

interface FormFields {
  destination: string;
  startDate: string;
  endDate: string;
  budget: string;
  travelersCount: string;
  notes: string;
}

const emptyFields: FormFields = {
  destination: '',
  startDate: '',
  endDate: '',
  budget: '',
  travelersCount: '',
  notes: '',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' };

function mapLoadErrorToMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Desejo não encontrado.';
  }
  return 'Não foi possível carregar o desejo. Tente novamente.';
}

function mapSubmitErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Sessão local indisponível. Verifique a autenticação de desenvolvimento.';
      case 403:
        return 'Você não tem permissão para editar desejos.';
      case 404:
        return 'Desejo não encontrado.';
      default:
        return 'Não foi possível salvar o desejo. Tente novamente.';
    }
  }
  return 'Não foi possível salvar o desejo. Tente novamente.';
}

export function WishEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [fields, setFields] = useState<FormFields>(emptyFields);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setLoadState({ status: 'error', message: 'Desejo não encontrado.' });
      return;
    }

    setLoadState({ status: 'loading' });

    getWish(id)
      .then((wish) => {
        if (cancelled) return;
        setFields({
          destination: wish.destination ?? '',
          startDate: wish.startDate ?? '',
          endDate: wish.endDate ?? '',
          budget: wish.budget !== undefined ? String(wish.budget) : '',
          travelersCount:
            wish.travelersCount !== undefined ? String(wish.travelersCount) : '',
          notes: wish.notes ?? '',
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

    setSubmitting(true);
    setError(null);

    const input: UpdateWishInput = {};
    const destination = fields.destination.trim();
    const startDate = fields.startDate.trim();
    const endDate = fields.endDate.trim();
    const budget = fields.budget.trim();
    const travelersCount = fields.travelersCount.trim();
    const notes = fields.notes.trim();
    if (destination) input.destination = destination;
    if (startDate) input.startDate = startDate;
    if (endDate) input.endDate = endDate;
    if (budget) input.budget = Number(budget);
    if (travelersCount) input.travelersCount = Number(travelersCount);
    if (notes) input.notes = notes;

    try {
      await updateWish(id, input);
      void navigate(`/wishes/${id}`);
    } catch (err: unknown) {
      setError(mapSubmitErrorToMessage(err));
      setSubmitting(false);
    }
  }

  if (loadState.status === 'loading') {
    return <p className="text-sm text-slate-500">Carregando desejo...</p>;
  }

  if (loadState.status === 'error') {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Editar desejo
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
        Editar desejo
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
          <label htmlFor="wish-destination" className="text-sm font-medium text-slate-700">
            Destino
          </label>
          <input
            id="wish-destination"
            name="destination"
            type="text"
            value={fields.destination}
            onChange={(event) => updateField('destination', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="wish-start-date" className="text-sm font-medium text-slate-700">
            Data de início
          </label>
          <input
            id="wish-start-date"
            name="startDate"
            type="date"
            value={fields.startDate}
            onChange={(event) => updateField('startDate', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="wish-end-date" className="text-sm font-medium text-slate-700">
            Data de fim
          </label>
          <input
            id="wish-end-date"
            name="endDate"
            type="date"
            value={fields.endDate}
            onChange={(event) => updateField('endDate', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="wish-budget" className="text-sm font-medium text-slate-700">
            Orçamento
          </label>
          <input
            id="wish-budget"
            name="budget"
            type="number"
            min="0"
            step="0.01"
            value={fields.budget}
            onChange={(event) => updateField('budget', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="wish-travelers" className="text-sm font-medium text-slate-700">
            Número de viajantes
          </label>
          <input
            id="wish-travelers"
            name="travelersCount"
            type="number"
            min="1"
            step="1"
            value={fields.travelersCount}
            onChange={(event) => updateField('travelersCount', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="wish-notes" className="text-sm font-medium text-slate-700">
            Notas
          </label>
          <textarea
            id="wish-notes"
            name="notes"
            value={fields.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            rows={4}
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
            onClick={() => void navigate(`/wishes/${id}`)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
