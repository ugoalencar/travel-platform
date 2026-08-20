import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getCustomer } from '../lib/api';
import type { Customer } from '../types/customer';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; customer: Customer };

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return 'Cliente não encontrado.';
    }
    return 'Não foi possível carregar o cliente. Tente novamente.';
  }
  return 'Não foi possível carregar o cliente. Tente novamente.';
}

export function CustomerDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setState({ status: 'error', message: 'Cliente não encontrado.' });
      return;
    }

    setState({ status: 'loading' });

    getCustomer(id)
      .then((customer) => {
        if (!cancelled) {
          setState({ status: 'success', customer });
        }
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
          Detalhes do cliente
        </h1>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => void navigate('/customers')}>
            Voltar
          </Button>
          {state.status === 'success' && (
            <Button onClick={() => void navigate(`/customers/${state.customer.id}/edit`)}>
              Editar
            </Button>
          )}
        </div>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando cliente...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <dl className="grid max-w-lg grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2">
          <Field label="Nome" value={state.customer.name} />
          <Field label="Email" value={state.customer.email} />
          <Field label="Telefone" value={state.customer.phone} />
          <Field label="CPF" value={state.customer.cpf} />
          <Field label="Passaporte" value={state.customer.passport} />
          <Field label="Notas" value={state.customer.notes} />
        </dl>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="text-sm text-slate-900">{value ?? '—'}</dd>
    </div>
  );
}
