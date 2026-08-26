import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getSupplier } from '../lib/api';
import type { Supplier } from '../types/transport';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; supplier: Supplier };

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Fornecedor não encontrado.';
  }
  return 'Não foi possível carregar o fornecedor. Tente novamente.';
}

export function SupplierDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setState({ status: 'error', message: 'Fornecedor não encontrado.' });
      return;
    }

    setState({ status: 'loading' });

    getSupplier(id)
      .then((supplier) => {
        if (cancelled) return;
        setState({ status: 'success', supplier });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ status: 'error', message: mapErrorToMessage(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Detalhes do fornecedor
        </h1>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => void navigate('/transport/suppliers')}>
            Voltar
          </Button>
          {state.status === 'success' && (
            <Button onClick={() => void navigate(`/transport/suppliers/${state.supplier.id}/edit`)}>
              Editar
            </Button>
          )}
        </div>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando fornecedor...</p>
      )}

      {state.status === 'error' && (
        <div role="alert" aria-live="assertive" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <dl className="grid max-w-lg grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2">
          <Field label="Nome" value={state.supplier.name} />
          <Field label="CNPJ/CPF" value={state.supplier.document} />
          <Field label="Telefone/e-mail de contato" value={state.supplier.contact} />
          <Field label="Ativo" value={state.supplier.active ? 'Sim' : 'Não'} />
          <Field label="Criado em" value={state.supplier.createdAt} />
          <Field label="Atualizado em" value={state.supplier.updatedAt} />
        </dl>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{value ?? '—'}</dd>
    </div>
  );
}
