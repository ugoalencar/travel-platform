import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createTrip, listCustomers } from '../lib/api';
import type { CreateTripInput } from '../types/trip';
import type { Customer } from '../types/customer';
import { Button } from '../components/ui/button';

interface FormFields {
  customerId: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  description: string;
  notes: string;
}

const initialFields: FormFields = {
  customerId: '',
  name: '',
  destination: '',
  startDate: '',
  endDate: '',
  description: '',
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
        return 'Você não tem permissão para criar viagens.';
      case 404:
        return 'Cliente não encontrado.';
      default:
        return 'Não foi possível salvar a viagem. Tente novamente.';
    }
  }
  return 'Não foi possível salvar a viagem. Tente novamente.';
}

export function TripFormPage() {
  const navigate = useNavigate();
  const [fields, setFields] = useState<FormFields>(initialFields);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    listCustomers()
      .then((list) => {
        if (!cancelled) {
          setCustomers(list);
          setLoadingCustomers(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadingCustomers(false);
        }
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
    const name = fields.name.trim();
    const destination = fields.destination.trim();
    const startDate = fields.startDate;
    const endDate = fields.endDate;

    if (!customerId) {
      setError('Cliente é obrigatório.');
      return;
    }
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

    const input: CreateTripInput = {
      customerId,
      name,
      destination,
      startDate,
      endDate,
    };
    const description = fields.description.trim();
    const notes = fields.notes.trim();
    if (description) input.description = description;
    if (notes) input.notes = notes;

    try {
      const trip = await createTrip(input);
      void navigate(`/trips/${trip.id}`);
    } catch (err: unknown) {
      setError(mapErrorToMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Nova viagem
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
          <label htmlFor="trip-customer" className="text-sm font-medium text-slate-700">
            Cliente
          </label>
          {loadingCustomers ? (
            <p className="text-sm text-slate-500">Carregando clientes...</p>
          ) : (
            <select
              id="trip-customer"
              name="customerId"
              value={fields.customerId}
              onChange={(event) => updateField('customerId', event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Selecione um cliente</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="trip-name" className="text-sm font-medium text-slate-700">
            Nome
          </label>
          <input
            id="trip-name"
            name="name"
            type="text"
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
            onClick={() => void navigate('/trips')}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
