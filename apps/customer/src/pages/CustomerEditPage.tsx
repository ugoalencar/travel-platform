import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getCustomer, updateCustomer } from '../lib/api';
import type { UpdateCustomerInput } from '../types/customer';
import { Button } from '../components/ui/button';

interface FormFields {
  name: string;
  email: string;
  phone: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' };

function mapLoadErrorToMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Cliente não encontrado.';
  }
  return 'Não foi possível carregar o cliente. Tente novamente.';
}

function mapSubmitErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Sessão local indisponível. Verifique a autenticação de desenvolvimento.';
      case 403:
        return 'Você não tem permissão para editar clientes.';
      case 404:
        return 'Cliente não encontrado.';
      case 409:
        return error.message || 'Já existe um cliente com este CPF ou email.';
      default:
        return 'Não foi possível salvar o cliente. Tente novamente.';
    }
  }
  return 'Não foi possível salvar o cliente. Tente novamente.';
}

export function CustomerEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [fields, setFields] = useState<FormFields>({ name: '', email: '', phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setLoadState({ status: 'error', message: 'Cliente não encontrado.' });
      return;
    }

    setLoadState({ status: 'loading' });

    getCustomer(id)
      .then((customer) => {
        if (cancelled) return;
        setFields({
          name: customer.name,
          email: customer.email ?? '',
          phone: customer.phone ?? '',
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
    if (!name) {
      setError('Nome é obrigatório.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const input: UpdateCustomerInput = { name };
    const email = fields.email.trim();
    const phone = fields.phone.trim();
    if (email) input.email = email;
    if (phone) input.phone = phone;

    try {
      await updateCustomer(id, input);
      void navigate(`/customers/${id}`);
    } catch (err: unknown) {
      setError(mapSubmitErrorToMessage(err));
      setSubmitting(false);
    }
  }

  if (loadState.status === 'loading') {
    return <p className="text-sm text-slate-500">Carregando cliente...</p>;
  }

  if (loadState.status === 'error') {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Editar cliente
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
        Editar cliente
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
          <label htmlFor="customer-name" className="text-sm font-medium text-slate-700">
            Nome
          </label>
          <input
            id="customer-name"
            name="name"
            type="text"
            required
            autoComplete="name"
            value={fields.name}
            onChange={(event) => updateField('name', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="customer-email" className="text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="customer-email"
            name="email"
            type="email"
            autoComplete="email"
            value={fields.email}
            onChange={(event) => updateField('email', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="customer-phone" className="text-sm font-medium text-slate-700">
            Telefone
          </label>
          <input
            id="customer-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={fields.phone}
            onChange={(event) => updateField('phone', event.target.value)}
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
            onClick={() => void navigate(`/customers/${id}`)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
