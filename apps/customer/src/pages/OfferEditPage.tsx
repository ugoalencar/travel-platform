import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getOffer, updateOffer } from '../lib/api';
import type { OfferStatus, UpdateOfferInput } from '../types/offer';
import { Button } from '../components/ui/button';

interface FormFields {
  name: string;
  description: string;
  price: string;
  validFrom: string;
  validUntil: string;
  status: OfferStatus;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' };

const STATUS_OPTIONS: OfferStatus[] = ['ACTIVE', 'INACTIVE', 'EXPIRED'];

function mapLoadErrorToMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Oferta não encontrada.';
  }
  return 'Não foi possível carregar a oferta. Tente novamente.';
}

function mapSubmitErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Sessão local indisponível. Verifique a autenticação de desenvolvimento.';
      case 403:
        return 'Você não tem permissão para editar ofertas.';
      case 404:
        return 'Oferta não encontrada.';
      default:
        return 'Não foi possível salvar a oferta. Tente novamente.';
    }
  }
  return 'Não foi possível salvar a oferta. Tente novamente.';
}

function formatDateInput(iso: string): string {
  return iso.slice(0, 10);
}

export function OfferEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [fields, setFields] = useState<FormFields>({
    name: '',
    description: '',
    price: '',
    validFrom: '',
    validUntil: '',
    status: 'ACTIVE',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setLoadState({ status: 'error', message: 'Oferta não encontrada.' });
      return;
    }

    setLoadState({ status: 'loading' });

    getOffer(id)
      .then((offer) => {
        if (cancelled) return;
        setFields({
          name: offer.name,
          description: offer.description ?? '',
          price: String(offer.price),
          validFrom: offer.validFrom ? formatDateInput(offer.validFrom) : '',
          validUntil: offer.validUntil ? formatDateInput(offer.validUntil) : '',
          status: offer.status,
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

    const name = fields.name.trim();
    const priceValue = fields.price.trim();

    if (!name) {
      setError('Nome é obrigatório.');
      return;
    }
    if (!priceValue) {
      setError('Preço é obrigatório.');
      return;
    }
    const price = Number(priceValue);
    if (Number.isNaN(price) || price < 0) {
      setError('Preço deve ser um número não negativo.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const input: UpdateOfferInput = { name, price, status: fields.status };
    const description = fields.description.trim();
    input.description = description;
    if (fields.validFrom) input.validFrom = fields.validFrom;
    if (fields.validUntil) input.validUntil = fields.validUntil;

    try {
      await updateOffer(id, input);
      void navigate(`/offers/${id}`);
    } catch (err: unknown) {
      setError(mapSubmitErrorToMessage(err));
      setSubmitting(false);
    }
  }

  if (loadState.status === 'loading') {
    return <p className="text-sm text-slate-500">Carregando oferta...</p>;
  }

  if (loadState.status === 'error') {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Editar oferta
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
        Editar oferta
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
        noValidate
        className="flex max-w-lg flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="offer-name" className="text-sm font-medium text-slate-700">
            Nome
          </label>
          <input
            id="offer-name"
            name="name"
            type="text"
            required
            value={fields.name}
            onChange={(event) => updateField('name', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="offer-description" className="text-sm font-medium text-slate-700">
            Descrição
          </label>
          <textarea
            id="offer-description"
            name="description"
            value={fields.description}
            onChange={(event) => updateField('description', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            rows={3}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="offer-price" className="text-sm font-medium text-slate-700">
            Preço
          </label>
          <input
            id="offer-price"
            name="price"
            type="number"
            min="0"
            step="0.01"
            required
            value={fields.price}
            onChange={(event) => updateField('price', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="offer-valid-from" className="text-sm font-medium text-slate-700">
            Válido de
          </label>
          <input
            id="offer-valid-from"
            name="validFrom"
            type="date"
            value={fields.validFrom}
            onChange={(event) => updateField('validFrom', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="offer-valid-until" className="text-sm font-medium text-slate-700">
            Válido até
          </label>
          <input
            id="offer-valid-until"
            name="validUntil"
            type="date"
            value={fields.validUntil}
            onChange={(event) => updateField('validUntil', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="offer-status" className="text-sm font-medium text-slate-700">
            Status (armazenado)
          </label>
          <select
            id="offer-status"
            name="status"
            value={fields.status}
            onChange={(event) => updateField('status', event.target.value as OfferStatus)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500">
            Este é o status armazenado da oferta. O status efetivo exibido em outras
            telas é calculado pelo servidor com base na data de validade e pode
            aparecer como EXPIRED mesmo que o valor armazenado aqui seja diferente —
            esse valor efetivo nunca é editável.
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => void navigate(`/offers/${id}`)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
