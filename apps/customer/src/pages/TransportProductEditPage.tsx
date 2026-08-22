import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getTransportProduct, updateTransportProduct } from '../lib/api';
import type { TransportProduct, UpdateTransportProductInput } from '../types/transport';
import { Button } from '../components/ui/button';

// The real backend (parseUpdateTransportProductInput) only allows
// name/price/active/publiclyBookable/notes on PATCH -- tripType,
// outboundRouteId and returnRouteId are immutable after creation, so this
// form intentionally does not expose them as editable fields (shown
// read-only instead for context).

interface FormFields {
  name: string;
  price: string;
  active: boolean;
  publiclyBookable: boolean;
  notes: string;
}

const emptyFields: FormFields = {
  name: '',
  price: '',
  active: true,
  publiclyBookable: false,
  notes: '',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; product: TransportProduct };

function mapLoadErrorToMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Produto não encontrado.';
  }
  return 'Não foi possível carregar o produto. Tente novamente.';
}

function mapSubmitErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Sessão local indisponível. Verifique a autenticação de desenvolvimento.';
      case 403:
        return 'Você não tem permissão para editar produtos de transporte.';
      case 404:
        return 'Produto não encontrado.';
      default:
        return 'Não foi possível salvar o produto. Tente novamente.';
    }
  }
  return 'Não foi possível salvar o produto. Tente novamente.';
}

export function TransportProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [fields, setFields] = useState<FormFields>(emptyFields);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setLoadState({ status: 'error', message: 'Produto não encontrado.' });
      return;
    }

    setLoadState({ status: 'loading' });

    getTransportProduct(id)
      .then((product) => {
        if (cancelled) return;
        setFields({
          name: product.name,
          price: String(product.price),
          active: product.active,
          publiclyBookable: product.publiclyBookable,
          notes: product.notes ?? '',
        });
        setLoadState({ status: 'ready', product });
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
    if (!name || !fields.price.trim() || Number.isNaN(Number(fields.price))) {
      setError('Nome e preço são obrigatórios.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const input: UpdateTransportProductInput = {
      name,
      price: Number(fields.price),
      active: fields.active,
      publiclyBookable: fields.publiclyBookable,
    };
    if (fields.notes.trim()) input.notes = fields.notes.trim();

    try {
      await updateTransportProduct(id, input);
      void navigate(`/transport/products/${id}`);
    } catch (err: unknown) {
      setError(mapSubmitErrorToMessage(err));
      setSubmitting(false);
    }
  }

  if (loadState.status === 'loading') {
    return <p className="text-sm text-slate-500">Carregando produto...</p>;
  }

  if (loadState.status === 'error') {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Editar produto</h1>
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadState.message}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Editar produto</h1>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <p className="max-w-lg text-xs text-slate-500">
        Tipo de viagem: {loadState.product.tripType} — rota de ida e volta não podem ser
        alteradas depois de criado o produto (não suportado pela API).
      </p>

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

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="active"
            checked={fields.active}
            onChange={(event) => updateField('active', event.target.checked)}
          />
          Ativo
        </label>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => void navigate(`/transport/products/${id}`)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
