import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createWish, listCustomers } from '../lib/api';
import type { CreateWishInput } from '../types/wish';
import type { Customer } from '../types/customer';
import { Button } from '../components/ui/button';

interface FormFields {
  customerId: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: string;
  travelersCount: string;
  notes: string;
}

const initialFields: FormFields = {
  customerId: '',
  destination: '',
  startDate: '',
  endDate: '',
  budget: '',
  travelersCount: '',
  notes: '',
};

type CustomersState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; customers: Customer[] };

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Sessão local indisponível. Verifique a autenticação de desenvolvimento.';
      case 403:
        return 'Você não tem permissão para criar desejos.';
      case 404:
        return 'Cliente selecionado não encontrado.';
      default:
        return 'Não foi possível salvar o desejo. Tente novamente.';
    }
  }
  return 'Não foi possível salvar o desejo. Tente novamente.';
}

export function WishFormPage() {
  const navigate = useNavigate();
  const [fields, setFields] = useState<FormFields>(initialFields);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customersState, setCustomersState] = useState<CustomersState>({
    status: 'loading',
  });

  useEffect(() => {
    let cancelled = false;

    setCustomersState({ status: 'loading' });

    listCustomers()
      .then((customers) => {
        if (cancelled) return;
        if (customers.length === 0) {
          setCustomersState({ status: 'empty' });
        } else {
          setCustomersState({ status: 'ready', customers });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? err.message
            : 'Não foi possível carregar os clientes.';
        setCustomersState({ status: 'error', message });
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

    setSubmitting(true);
    setError(null);

    const input: CreateWishInput = { customerId };
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
      await createWish(input);
      void navigate('/wishes');
    } catch (err: unknown) {
      setError(mapErrorToMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Novo desejo
      </h1>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {customersState.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {customersState.message}
        </div>
      )}

      {customersState.status === 'empty' && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Nenhum cliente disponível. Cadastre um cliente antes de criar um desejo.{' '}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => void navigate('/customers/new')}
          >
            Cadastrar cliente
          </button>
        </div>
      )}

      {(customersState.status === 'ready' ||
        customersState.status === 'loading') && (
        <form
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          className="flex max-w-lg flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="wish-customer" className="text-sm font-medium text-slate-700">
              Cliente
            </label>
            <select
              id="wish-customer"
              name="customerId"
              disabled={customersState.status === 'loading'}
              value={fields.customerId}
              onChange={(event) => updateField('customerId', event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">
                {customersState.status === 'loading'
                  ? 'Carregando clientes...'
                  : 'Selecione um cliente'}
              </option>
              {customersState.status === 'ready' &&
                customersState.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
            </select>
          </div>

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
              onClick={() => void navigate('/wishes')}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
