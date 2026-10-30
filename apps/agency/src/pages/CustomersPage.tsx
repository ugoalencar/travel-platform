import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import {
  ApiError,
  createCustomer,
  getCustomerFieldSettings,
  listCustomers,
  type CustomerFieldSetting,
} from '../lib/api';
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
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | CustomerStatus>('ALL');
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState(emptyNewCustomer);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Registration-form configuration (Frente 2). The server enforces it; this
  // only hides disabled fields and marks required ones. Defaults if unavailable.
  const [fieldSettings, setFieldSettings] = useState<CustomerFieldSetting[]>([]);
  const [extraValues, setExtraValues] = useState<Record<string, string>>({});
  const [addressCity, setAddressCity] = useState('');

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

  useEffect(() => {
    getCustomerFieldSettings()
      .then(setFieldSettings)
      .catch(() => setFieldSettings([]));
  }, []);

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

  const fieldRule = (key: string) => {
    const found = fieldSettings.find((field) => field.fieldKey === key);
    return { enabled: found?.enabled ?? true, required: found?.required ?? false };
  };
  const emailRule = fieldRule('email');
  const phoneRule = fieldRule('phone');
  const notesRule = fieldRule('notes');
  // Required fields this quick form has no dedicated input for still must be fillable here,
  // otherwise an administrator's configuration would make every quick add fail with a 422.
  const quickKeys = ['name', 'email', 'phone', 'notes', 'address'];
  const extraRequired = fieldSettings.filter(
    (field) => field.enabled && field.required && !field.locked && !quickKeys.includes(field.fieldKey),
  );
  const addressRequired = fieldRule('address').enabled && fieldRule('address').required;

  async function handleCreate() {
    if (!newCustomer.name.trim()) {
      setFormError('Informe o nome do cliente.');
      return;
    }
    for (const field of extraRequired) {
      if (!(extraValues[field.apiField] ?? '').trim()) {
        setFormError(`Informe o campo obrigatório: ${field.label}.`);
        return;
      }
    }
    if (addressRequired && !addressCity.trim()) {
      setFormError('Informe o campo obrigatório: Endereço (cidade).');
      return;
    }
    for (const [rule, value, label] of [
      [emailRule, newCustomer.email, 'E-mail'],
      [phoneRule, newCustomer.phone, 'Telefone'],
      [notesRule, newCustomer.notes, 'Observações'],
    ] as const) {
      if (rule.enabled && rule.required && !value.trim()) {
        setFormError(`Informe o campo obrigatório: ${label}.`);
        return;
      }
    }
    setSaving(true);
    setFormError(null);
    try {
      const extras: Record<string, string> = {};
      for (const field of extraRequired) extras[field.apiField] = (extraValues[field.apiField] ?? '').trim();
      const created = await createCustomer({
        ...extras,
        ...(addressRequired ? { address: { city: addressCity.trim() } } : {}),
        name: newCustomer.name.trim(),
        email: emailRule.enabled ? newCustomer.email.trim() || undefined : undefined,
        phone: phoneRule.enabled ? newCustomer.phone.trim() || undefined : undefined,
        notes: notesRule.enabled ? newCustomer.notes.trim() || undefined : undefined,
      });
      setShowNewCustomer(false);
      setNewCustomer(emptyNewCustomer);
      // Straight to the detail page instead of back to the list -- the
      // quick-add form only captures the essentials; dependents,
      // documents and travel requirements live on the detail page and
      // were easy to never discover otherwise. Reported directly: "o
      // cadastro de cliente parece um cadastro bem simples... não
      // encontrei em nenhum lugar onde será feito um cadastro completo."
      void navigate(`/customers/${created.id}?new=1`);
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
                      <p className="text-xs text-slate-400">{c.protocolNumber}</p>
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
            {emailRule.enabled && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">E-mail{emailRule.required ? ' *' : ''}</label>
              <Input
                type="email"
                placeholder="email@exemplo.com"
                value={newCustomer.email}
                onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
              />
            </div>
            )}
            {phoneRule.enabled && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Telefone{phoneRule.required ? ' *' : ''}</label>
              <Input
                placeholder="(11) 99999-9999"
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
              />
            </div>
            )}
          </div>
          {extraRequired.map((field) => (
            <div key={field.fieldKey}>
              <label className="mb-1 block text-xs font-medium text-slate-700">{field.label} *</label>
              <Input
                value={extraValues[field.apiField] ?? ''}
                onChange={(e) => setExtraValues({ ...extraValues, [field.apiField]: e.target.value })}
              />
            </div>
          ))}
          {addressRequired && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Endereço (cidade) *</label>
              <Input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} />
            </div>
          )}
          {notesRule.enabled && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Observações{notesRule.required ? ' *' : ''}</label>
            <Textarea
              placeholder="Preferências, restrições, detalhes…"
              value={newCustomer.notes}
              onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })}
            />
          </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
