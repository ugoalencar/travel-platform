import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createSupplier } from '../lib/api';
import type { CreateSupplierInput } from '../types/transport';
import { Button } from '../components/ui/button';

interface FormFields {
  name: string;
  document: string;
  contact: string;
}

const initialFields: FormFields = { name: '', document: '', contact: '' };

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Sessão local indisponível. Verifique a autenticação de desenvolvimento.';
      case 403:
        return 'Você não tem permissão para criar fornecedores.';
      default:
        return 'Não foi possível salvar o fornecedor. Tente novamente.';
    }
  }
  return 'Não foi possível salvar o fornecedor. Tente novamente.';
}

export function SupplierFormPage() {
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

    const input: CreateSupplierInput = { name };
    if (fields.document.trim()) input.document = fields.document.trim();
    if (fields.contact.trim()) input.contact = fields.contact.trim();

    try {
      const created = await createSupplier(input);
      void navigate(`/transport/suppliers/${created.id}`);
    } catch (err: unknown) {
      setError(mapErrorToMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Novo fornecedor</h1>

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
          <label htmlFor="supplier-name" className="text-sm font-medium text-slate-700">
            Nome
          </label>
          <input
            id="supplier-name"
            name="name"
            value={fields.name}
            onChange={(event) => updateField('name', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="supplier-document" className="text-sm font-medium text-slate-700">
            Documento
          </label>
          <input
            id="supplier-document"
            name="document"
            value={fields.document}
            onChange={(event) => updateField('document', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="supplier-contact" className="text-sm font-medium text-slate-700">
            Contato
          </label>
          <input
            id="supplier-contact"
            name="contact"
            value={fields.contact}
            onChange={(event) => updateField('contact', event.target.value)}
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
            onClick={() => void navigate('/transport/suppliers')}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
