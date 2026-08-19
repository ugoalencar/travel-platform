import { useEffect, useState } from 'react';
import { ApiError, listCustomers } from '../lib/api';
import type { Customer } from '../types/customer';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; customers: Customer[] };

export function CustomersPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading' });

    listCustomers()
      .then((customers) => {
        if (!cancelled) {
          setState({ status: 'success', customers });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os clientes.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Clientes
        </h1>
        <Button disabled title="Cadastro de cliente em breve">
          + Novo cliente
        </Button>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando clientes...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <CustomerTable customers={state.customers} />
      )}
    </div>
  );
}

function CustomerTable({ customers }: { customers: Customer[] }) {
  if (customers.length === 0) {
    return (
      <p className="text-sm text-slate-500">Nenhum cliente cadastrado ainda.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Nome</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Telefone</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3 font-medium text-slate-900">{customer.name}</td>
              <td className="px-4 py-3 text-slate-600">{customer.email ?? '—'}</td>
              <td className="px-4 py-3 text-slate-600">{customer.phone ?? '—'}</td>
              <td className="px-4 py-3 text-right">
                <Button variant="ghost" size="sm" disabled title="Em breve">
                  Detalhes
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
