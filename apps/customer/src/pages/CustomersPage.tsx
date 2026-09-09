import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Phone, Plus, Search, Users } from 'lucide-react';
import { ApiError, listCustomers } from '../lib/api';
import type { Customer } from '../types/customer';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; customers: Customer[] };

export function CustomersPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const navigate = useNavigate();

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
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar os clientes.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="grid gap-5 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_58%,#e0f2fe_100%)] p-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-blue-700">CRM & Comercial</p>
            <h1 className="mt-1">Clientes</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Base de relacionamento, preferencias e oportunidades da agencia.
            </p>
          </div>
          <Button onClick={() => void navigate('/customers/new')} className="h-10 rounded-xl bg-blue-600 px-4">
            <Plus size={16} />
            Novo cliente
          </Button>
        </div>
        <div className="grid gap-3 border-t border-blue-100 p-4 md:grid-cols-[1fr_auto_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              aria-label="Buscar clientes"
              placeholder="Buscar por nome, e-mail ou telefone"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm"
            />
          </label>
          <select aria-label="Status" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            <option>Todos os status</option>
            <option>Ativos</option>
            <option>Inativos</option>
          </select>
          <select aria-label="Carteira" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            <option>Todas as carteiras</option>
            <option>VIP</option>
            <option>Familia</option>
          </select>
        </div>
      </div>

      {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando clientes...</p>}

      {state.status === 'error' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{state.message}</div>
      )}

      {state.status === 'success' && <CustomerTable customers={state.customers} />}
    </div>
  );
}

function CustomerTable({ customers }: { customers: Customer[] }) {
  const navigate = useNavigate();

  if (customers.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="font-bold text-slate-900">Nenhum cliente cadastrado ainda.</p>
        <p className="mt-1 text-sm text-slate-500">Crie o primeiro perfil para iniciar o relacionamento.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-3">Nome</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Telefone</th>
            <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <Users size={16} />
                  </span>
                  <span>
                    <span className="block font-bold text-slate-900">{customer.name}</span>
                    <span className="block text-xs text-slate-500">Cliente desde {formatDate(customer.createdAt)}</span>
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-slate-600">
                <span className="inline-flex items-center gap-2">
                  <Mail size={14} className="text-slate-400" />
                  {customer.email ?? '—'}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-600">
                <span className="inline-flex items-center gap-2">
                  <Phone size={14} className="text-slate-400" />
                  {customer.phone ?? '—'}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                  {customer.status === 'ACTIVE' ? 'Ativo' : customer.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void navigate(`/customers/${customer.id}`)}
                >
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

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('pt-BR');
}
