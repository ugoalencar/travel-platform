import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getCustomer } from '../lib/api';
import type { Customer } from '../types/customer';
import { Customer360 } from '../components/commercial/Customer360';

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

  if (state.status === 'loading') {
    return (
      <div>
        <h1 className="sr-only">Detalhes do cliente</h1>
        <p className="text-sm text-slate-500">Carregando cliente...</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {state.message}
      </div>
    );
  }

  return (
    <Customer360
      customer={state.customer}
      onBack={() => void navigate('/customers')}
      onEdit={() => void navigate(`/customers/${state.customer.id}/edit`)}
    />
  );
}
