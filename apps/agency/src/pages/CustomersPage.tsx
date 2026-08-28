import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Users } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { StatusBadge } from '../components/ui/status-badge';
import { EmptyState } from '../components/ui/empty-state';
import { LoadingState } from '../components/ui/loading-state';
import { customers } from '../lib/fixtures';
import { getCustomerStatusLabel } from '../lib/statusLabels';
import { formatDateBR } from '../lib/formatDateBR';
import { useMockLoading } from '../lib/useMockLoading';
import type { CustomerStatus } from '../types/customer';

function statusTone(status: CustomerStatus) {
  if (status === 'ACTIVE') return 'positive';
  if (status === 'INACTIVE') return 'inactive';
  return 'attention' as const;
}

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | CustomerStatus>('ALL');
  const loadState = useMockLoading();

  const filtered = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search);
    const matchesFilter = filter === 'ALL' || c.status === filter;
    return matchesSearch && matchesFilter;
  });

  if (loadState === 'loading') {
    return <LoadingState label="Carregando clientes…" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Clientes</h1>
          <p className="text-sm text-slate-500">{customers.length} clientes cadastrados</p>
        </div>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Novo cliente
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar por nome, e-mail ou telefone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex rounded-md border border-slate-200 bg-white p-0.5">
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setFilter(opt)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === opt
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opt === 'ALL' ? 'Todos' : getCustomerStatusLabel(opt)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhum cliente encontrado"
          description={search ? 'Tente outro termo de busca.' : 'Comece adicionando um novo cliente.'}
          icon={<Users className="h-8 w-8" />}
          action={
            search ? (
              <Button variant="outline" size="sm" onClick={() => { setSearch(''); setFilter('ALL'); }}>
                Limpar filtros
              </Button>
            ) : (
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Novo cliente
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">E-mail</th>
                  <th className="px-4 py-3 font-medium">Telefone</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Cadastro</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/customers/${c.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.email ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={statusTone(c.status)}>
                        {getCustomerStatusLabel(c.status)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDateBR(c.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/customers/${c.id}`}
                        className="text-xs font-medium text-slate-600 hover:text-slate-900"
                      >
                        Detalhes →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
