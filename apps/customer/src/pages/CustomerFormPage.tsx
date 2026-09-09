import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Save, UserRound } from 'lucide-react';
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

    if (submitting) return;

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
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_58%,#e0f2fe_100%)] p-5">
          <button
            type="button"
            onClick={() => void navigate('/customers')}
            className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-blue-700"
          >
            <ArrowLeft size={16} />
            Clientes
          </button>
          <h1>Novo cliente</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Cadastre dados essenciais para relacionamento, documentos e próximas oportunidades.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="space-y-5"
      >
        <FormPanel
          icon={<UserRound size={18} />}
          title="Dados pessoais"
          description="Identificação do viajante e dados civis."
        >
          <Field label="Nome" htmlFor="customer-name">
            <input
              id="customer-name"
              name="name"
              type="text"
              required
              autoComplete="name"
              value={fields.name}
              onChange={(event) => updateField('name', event.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="CPF" htmlFor="customer-cpf">
            <input
              id="customer-cpf"
              name="cpf"
              type="text"
              value={fields.cpf}
              onChange={(event) => updateField('cpf', event.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Passaporte" htmlFor="customer-passport">
            <input
              id="customer-passport"
              name="passport"
              type="text"
              value={fields.passport}
              onChange={(event) => updateField('passport', event.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
            />
          </Field>
        </FormPanel>

        <FormPanel icon={<Mail size={18} />} title="Contato" description="Canais para atendimento e pós-venda.">
          <Field label="Email" htmlFor="customer-email">
            <input
              id="customer-email"
              name="email"
              type="email"
              autoComplete="email"
              value={fields.email}
              onChange={(event) => updateField('email', event.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Telefone" htmlFor="customer-phone">
            <input
              id="customer-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              value={fields.phone}
              onChange={(event) => updateField('phone', event.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Notas" htmlFor="customer-notes" wide>
            <textarea
              id="customer-notes"
              name="notes"
              value={fields.notes}
              onChange={(event) => updateField('notes', event.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
              rows={4}
            />
          </Field>
        </FormPanel>

        <div className="sticky bottom-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg shadow-slate-200/70 backdrop-blur sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="outline" disabled={submitting} onClick={() => void navigate('/customers')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
            <Save size={16} />
            {submitting ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function FormPanel({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <span className="rounded-xl bg-blue-50 p-2 text-blue-700">{icon}</span>
        <div>
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
  wide = false,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'flex flex-col gap-1 md:col-span-2' : 'flex flex-col gap-1'}>
      <label htmlFor={htmlFor} className="text-sm font-bold text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}
