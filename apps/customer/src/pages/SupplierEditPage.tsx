import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getSupplier, updateSupplier } from '../lib/api';
import type { UpdateSupplierInput } from '../types/transport';
import { Button } from '../components/ui/button';

interface FormFields {
  name: string;
  document: string;
  contact: string;
  active: boolean;
}

const emptyFields: FormFields = { name: '', document: '', contact: '', active: true };

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

function mapLoadErrorToMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Fornecedor não encontrado.';
  }
  return 'Não foi possível carregar o fornecedor. Tente novamente.';
}

function mapSubmitErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Sessão local indisponível. Verifique a autenticação de desenvolvimento.';
      case 403:
        return 'Você não tem permissão para editar fornecedores.';
      case 404:
        return 'Fornecedor não encontrado.';
      default:
        return 'Não foi possível salvar o fornecedor. Tente novamente.';
    }
  }
  return 'Não foi possível salvar o fornecedor. Tente novamente.';
}

export function SupplierEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [fields, setFields] = useState<FormFields>(emptyFields);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setLoadState({ status: 'error', message: 'Fornecedor não encontrado.' });
      return;
    }

    setLoadState({ status: 'loading' });

    getSupplier(id)
      .then((supplier) => {
        if (cancelled) return;
        setFields({
          name: supplier.name,
          document: supplier.document ?? '',
          contact: supplier.contact ?? '',
          active: supplier.active,
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

  function updateField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
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

    const input: UpdateSupplierInput = { name, active: fields.active };
    if (fields.document.trim()) input.document = fields.document.trim();
    if (fields.contact.trim()) input.contact = fields.contact.trim();

    try {
      await updateSupplier(id, input);
      void navigate(`/transport/suppliers/${id}`);
    } catch (err: unknown) {
      setError(mapSubmitErrorToMessage(err));
      setSubmitting(false);
    }
  }

  if (loadState.status === 'loading') {
    return <p className="text-sm text-slate-500">Carregando fornecedor...</p>;
  }

  if (loadState.status === 'error') {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Editar fornecedor
        </h1>
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadState.message}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Editar fornecedor</h1>

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
            onClick={() => void navigate(`/transport/suppliers/${id}`)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
