import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getSale, updateSale } from '../lib/api';
import type { UpdateSaleInput } from '../types/sale';
import { Button } from '../components/ui/button';

interface FormFields {
  amount: string;
  discount: string;
  notes: string;
}

const emptyFields: FormFields = {
  amount: '',
  discount: '',
  notes: '',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; status_field: string };

function mapLoadErrorToMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Venda não encontrada.';
  }
  return 'Não foi possível carregar a venda. Tente novamente.';
}

function mapSubmitErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Sessão local indisponível. Verifique a autenticação de desenvolvimento.';
      case 403:
        return 'Você não tem permissão para editar vendas.';
      case 404:
        return 'Venda não encontrada.';
      default:
        return 'Não foi possível salvar a venda. Tente novamente.';
    }
  }
  return 'Não foi possível salvar a venda. Tente novamente.';
}

function previewTotal(amount: string, discount: string): number | null {
  const amountValue = Number(amount);
  if (amount.trim() === '' || Number.isNaN(amountValue)) {
    return null;
  }
  const discountValue = discount.trim() === '' ? 0 : Number(discount);
  if (Number.isNaN(discountValue)) {
    return null;
  }
  return amountValue - discountValue;
}

export function SaleEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [fields, setFields] = useState<FormFields>(emptyFields);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setLoadState({ status: 'error', message: 'Venda não encontrada.' });
      return;
    }

    setLoadState({ status: 'loading' });

    getSale(id)
      .then((sale) => {
        if (cancelled) return;
        setFields({
          amount: String(sale.amount),
          discount: String(sale.discount),
          notes: sale.notes ?? '',
        });
        setLoadState({ status: 'ready', status_field: sale.status });
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

    const input: UpdateSaleInput = {};
    const amount = fields.amount.trim();
    const discount = fields.discount.trim();
    const notes = fields.notes.trim();
    if (amount) input.amount = Number(amount);
    if (discount) input.discount = Number(discount);
    if (notes) input.notes = notes;

    try {
      await updateSale(id, input);
      void navigate(`/sales/${id}`);
    } catch (err: unknown) {
      setError(mapSubmitErrorToMessage(err));
      setSubmitting(false);
    }
  }

  if (loadState.status === 'loading') {
    return <p className="text-sm text-slate-500">Carregando venda...</p>;
  }

  if (loadState.status === 'error') {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Editar venda
        </h1>
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadState.message}
        </div>
      </div>
    );
  }

  const total = previewTotal(fields.amount, fields.discount);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Editar venda
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
          <label htmlFor="sale-amount" className="text-sm font-medium text-slate-700">
            Valor
          </label>
          <input
            id="sale-amount"
            name="amount"
            type="number"
            min="0"
            step="0.01"
            value={fields.amount}
            onChange={(event) => updateField('amount', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="sale-discount" className="text-sm font-medium text-slate-700">
            Desconto (valor absoluto)
          </label>
          <input
            id="sale-discount"
            name="discount"
            type="number"
            min="0"
            step="0.01"
            value={fields.discount}
            onChange={(event) => updateField('discount', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <span className="font-medium">Total (prévia):</span> {total !== null ? total : '—'}
          <p className="mt-1 text-xs text-slate-500">
            Prévia apenas para exibição — o servidor recalcula e retorna o total oficial.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="sale-notes" className="text-sm font-medium text-slate-700">
            Notas
          </label>
          <textarea
            id="sale-notes"
            name="notes"
            value={fields.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            rows={3}
          />
        </div>

        <p className="text-xs text-slate-500">
          Status atual: {loadState.status_field} (somente leitura — não editável nesta versão).
        </p>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => void navigate(`/sales/${id}`)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
