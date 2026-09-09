import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Users } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { StatusBadge } from '../components/ui/status-badge';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import { Modal } from '../components/ui/modal';
import { ApiError, createCustomer, listCustomers } from '../lib/api';
import { getCustomerStatusLabel } from '../lib/statusLabels';
import { formatDateBR } from '../lib/formatDateBR';
import type { Customer } from '../types/customer';
import type { CustomerStatus } from '../types/customer';

function statusTone(status: CustomerStatus) {
  if (status === 'ACTIVE') return 'positive';
  if (status === 'INACTIVE') return 'inactive';
  return 'attention' as const;
}

const emptyNewCustomer = { name: '', email: '', phone: '', notes: '' };

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | CustomerStatus>('ALL');
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState(emptyNewCustomer);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    setCustomers(null);
    listCustomers()
      .then(setCustomers)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os clientes.');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return <ErrorState description={error} onRetry={load} />;
  }

  if (!customers) {
    return <LoadingState label="Carregando clientes…" />;
  }

  const filtered = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (c.phone?.includes(search) ?? false);
    const matchesFilter = filter === 'ALL' || c.status === filter;
    return matchesSearch && matchesFilter;
  });

  async function handleCreate() {
    if (!newCustomer.name.trim()) {
      setFormError('Informe o nome do cliente.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createCustomer({
        name: newCustomer.name.trim(),
        email: newCustomer.email.trim() || undefined,
        phone: newCustomer.phone.trim() || undefined,
        notes: newCustomer.notes.trim() || undefined,
      });
      setShowNewCustomer(false);
      setNewCustomer(emptyNewCustomer);
      load();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o cliente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description={`${customers.length} clientes cadastrados`}
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'CRM & Comercial' }, { label: 'Clientes' }]}
        actions={
          <Button size="sm" onClick={() => setShowNewCustomer(true)}>
            <Plus className="h-4 w-4" />
            Novo cliente
          </Button>
        }
      />

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <label htmlFor="customers-search" className="sr-only">
            Buscar clientes
          </label>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input
            id="customers-search"
            placeholder="Buscar por nome, e-mail ou telefone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Buscar clientes"
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
              <Button size="sm" onClick={() => setShowNewCustomer(true)}>
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

      <Modal
        open={showNewCustomer}
        onClose={() => { setShowNewCustomer(false); setFormError(null); }}
        title="Novo cliente"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => { setShowNewCustomer(false); setFormError(null); }} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => { void handleCreate(); }} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <p role="alert" className="rounded-md bg-red-50 p-2 text-xs text-red-700">{formError}</p>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Nome *</label>
            <Input
              placeholder="Nome completo"
              value={newCustomer.name}
              onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">E-mail</label>
              <Input
                type="email"
                placeholder="email@exemplo.com"
                value={newCustomer.email}
                onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Telefone</label>
              <Input
                placeholder="(11) 99999-9999"
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Observações</label>
            <Textarea
              placeholder="Preferências, restrições, detalhes…"
              value={newCustomer.notes}
              onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
