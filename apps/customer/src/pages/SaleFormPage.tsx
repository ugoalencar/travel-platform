import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createSale, listCustomers } from '../lib/api';
import type { CreateSaleInput } from '../types/sale';
import type { Customer } from '../types/customer';
import { Button } from '../components/ui/button';

// Proposal and Broker selectors are deferred in this first package: the
// Proposal application-code vertical is not merged into this branch (no
// listProposals()/GET /proposals available yet), and there is no existing
// frontend precedent or API client function for listing Brokers anywhere in
// the codebase. The backend still accepts proposalId/brokerId when provided
// directly, but this form does not expose selectors for them yet.

interface FormFields {
  customerId: string;
  amount: string;
  discount: string;
  notes: string;
}

const initialFields: FormFields = {
  customerId: '',
  amount: '',
  discount: '',
  notes: '',
};

type RelationsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; customers: Customer[] };

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Sessão local indisponível. Verifique a autenticação de desenvolvimento.';
      case 403:
        return 'Você não tem permissão para criar vendas.';
      case 404:
        return 'Cliente selecionado não encontrado.';
      case 409:
        return 'Já existe uma venda para a proposta selecionada.';
      default:
        return 'Não foi possível salvar a venda. Tente novamente.';
    }
  }
  return 'Não foi possível salvar a venda. Tente novamente.';
}

/** Client-side preview only; the server always computes the authoritative total. */
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

export function SaleFormPage() {
  const navigate = useNavigate();
  const [fields, setFields] = useState<FormFields>(initialFields);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relationsState, setRelationsState] = useState<RelationsState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    setRelationsState({ status: 'loading' });

    listCustomers()
      .then((customers) => {
        if (cancelled) return;
        setRelationsState({ status: 'ready', customers });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? err.message : 'Não foi possível carregar os clientes.';
        setRelationsState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function updateField<K extends keyof FormFields>(key: K, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const customerId = fields.customerId.trim();
    if (!customerId) {
      setError('Cliente é obrigatório.');
      return;
    }

    const amount = fields.amount.trim();
    if (!amount || Number.isNaN(Number(amount))) {
      setError('Valor é obrigatório.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const input: CreateSaleInput = {
      customerId,
      amount: Number(amount),
    };
    if (fields.discount.trim()) input.discount = Number(fields.discount.trim());
    if (fields.notes.trim()) input.notes = fields.notes.trim();

    try {
      const created = await createSale(input);
      void navigate(`/sales/${created.id}`);
    } catch (err: unknown) {
      setError(mapErrorToMessage(err));
      setSubmitting(false);
    }
  }

  const total = previewTotal(fields.amount, fields.discount);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Nova venda
      </h1>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {relationsState.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {relationsState.message}
        </div>
      )}

      {relationsState.status === 'ready' && relationsState.customers.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Nenhum cliente disponível. Cadastre um cliente antes de criar uma venda.{' '}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => void navigate('/customers/new')}
          >
            Cadastrar cliente
          </button>
        </div>
      )}

      {(relationsState.status === 'ready' || relationsState.status === 'loading') && (
        <form
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          className="flex max-w-lg flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="sale-customer" className="text-sm font-medium text-slate-700">
              Cliente
            </label>
            <select
              id="sale-customer"
              name="customerId"
              disabled={relationsState.status === 'loading'}
              value={fields.customerId}
              onChange={(event) => updateField('customerId', event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">
                {relationsState.status === 'loading' ? 'Carregando clientes...' : 'Selecione um cliente'}
              </option>
              {relationsState.status === 'ready' &&
                relationsState.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
            </select>
          </div>

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
            <span className="font-medium">Total (prévia):</span>{' '}
            {total !== null ? total : '—'}
            <p className="mt-1 text-xs text-slate-500">
              Prévia apenas para exibição — o servidor calcula e retorna o total oficial.
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

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => void navigate('/sales')}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
