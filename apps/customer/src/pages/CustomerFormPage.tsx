import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createCustomer } from '../lib/api';
import type { CreateCustomerInput } from '../types/customer';
import { Button } from '../components/ui/button';

interface FormFields {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  passport: string;
  notes: string;
}

const initialFields: FormFields = {
  name: '',
  email: '',
  phone: '',
  cpf: '',
  passport: '',
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
        return 'Você não tem permissão para criar clientes.';
      case 409:
        return error.message || 'Já existe um cliente com este CPF ou email.';
      default:
        return 'Não foi possível salvar o cliente. Tente novamente.';
    }
  }
  return 'Não foi possível salvar o cliente. Tente novamente.';
}

export function CustomerFormPage() {
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
    if (!name) {
      setError('Nome é obrigatório.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const input: CreateCustomerInput = { name };
    const email = fields.email.trim();
    const phone = fields.phone.trim();
    const cpf = fields.cpf.trim();
    const passport = fields.passport.trim();
    const notes = fields.notes.trim();
    if (email) input.email = email;
    if (phone) input.phone = phone;
    if (cpf) input.cpf = cpf;
    if (passport) input.passport = passport;
    if (notes) input.notes = notes;

    try {
      await createCustomer(input);
      void navigate('/customers');
    } catch (err: unknown) {
      setError(mapErrorToMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Novo cliente
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

        <div className="flex flex-col gap-1">
          <label htmlFor="customer-cpf" className="text-sm font-medium text-slate-700">
            CPF
          </label>
          <input
            id="customer-cpf"
            name="cpf"
            type="text"
            value={fields.cpf}
            onChange={(event) => updateField('cpf', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="customer-passport" className="text-sm font-medium text-slate-700">
            Passaporte
          </label>
          <input
            id="customer-passport"
            name="passport"
            type="text"
            value={fields.passport}
            onChange={(event) => updateField('passport', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="customer-notes" className="text-sm font-medium text-slate-700">
            Notas
          </label>
          <textarea
            id="customer-notes"
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
            onClick={() => void navigate('/customers')}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
