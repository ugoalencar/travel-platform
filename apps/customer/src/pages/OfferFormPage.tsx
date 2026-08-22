import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createOffer } from '../lib/api';
import type { CreateOfferInput } from '../types/offer';
import { Button } from '../components/ui/button';

interface FormFields {
  name: string;
  description: string;
  price: string;
  validFrom: string;
  validUntil: string;
}

const initialFields: FormFields = {
  name: '',
  description: '',
  price: '',
  validFrom: '',
  validUntil: '',
};

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Sessão local indisponível. Verifique a autenticação de desenvolvimento.';
      case 403:
        return 'Você não tem permissão para criar ofertas.';
      default:
        return 'Não foi possível salvar a oferta. Tente novamente.';
    }
  }
  return 'Não foi possível salvar a oferta. Tente novamente.';
}

export function OfferFormPage() {
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

    const input: CreateOfferInput = { name, price };
    const description = fields.description.trim();
    if (description) input.description = description;
    if (fields.validFrom) input.validFrom = fields.validFrom;
    if (fields.validUntil) input.validUntil = fields.validUntil;

    try {
      const offer = await createOffer(input);
      void navigate(`/offers/${offer.id}`);
    } catch (err: unknown) {
      setError(mapErrorToMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Nova oferta
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

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => void navigate('/offers')}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
