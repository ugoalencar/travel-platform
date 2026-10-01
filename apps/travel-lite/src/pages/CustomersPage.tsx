import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { ErrorNote, Pager, StatusBadge } from '../ui';

const OPTIONAL_FIELDS = [
  'email',
  'cpf',
  'birth_date',
  'phone',
  'whatsapp',
  'zip_code',
  'street',
  'number',
  'complement',
  'neighborhood',
  'city',
  'state',
  'notes',
] as const;

type OptionalField = (typeof OPTIONAL_FIELDS)[number];

type Customer = { id: string; name: string; status: string } & Record<OptionalField, string | null>;

interface ListJson {
  items: Customer[];
  page: number;
  pageSize: number;
  total: number;
}

type FormState = { name: string; status: string } & Record<OptionalField, string>;

const EMPTY_FORM = {
  name: '',
  status: 'ACTIVE',
  ...Object.fromEntries(OPTIONAL_FIELDS.map((field) => [field, ''])),
} as FormState;

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export function CustomersPage() {
  const [items, setItems] = useState<Customer[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (search.trim()) params.set('search', search.trim());
    if (status) params.set('status', status);
    try {
      const response = await api<ListJson>(`/customers?${params.toString()}`);
      setItems(response.items);
      setTotal(response.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar');
    }
  }, [page, search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function startEdit(customer: Customer) {
    setEditingId(customer.id);
    setForm({
      name: customer.name,
      status: customer.status,
      ...Object.fromEntries(OPTIONAL_FIELDS.map((field) => [field, customer[field] ?? ''])),
    } as FormState);
    setFormOpen(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    // Editing sends every field (blank -> null) so a value can be cleared;
    // creating omits blanks.
    const payload: Record<string, unknown> = { name: form.name.trim() };
    for (const field of OPTIONAL_FIELDS) {
      const value = form[field].trim();
      if (value) payload[field] = value;
      else if (editingId) payload[field] = null;
    }
    if (editingId) payload.status = form.status;
    try {
      if (editingId) {
        await api(`/customers/${editingId}`, { method: 'PATCH', body: payload });
      } else {
        await api('/customers', { method: 'POST', body: payload });
      }
      setFormOpen(false);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar');
    }
  }

  async function toggleStatus(customer: Customer) {
    try {
      await api(`/customers/${customer.id}`, {
        method: 'PATCH',
        body: { status: customer.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar');
    }
  }

  return (
    <>
      <h1>Clientes</h1>
      <div className="lite-toolbar">
        <input
          placeholder="Buscar por nome, e-mail ou CPF"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos os status</option>
          <option value="ACTIVE">Ativos</option>
          <option value="INACTIVE">Inativos</option>
        </select>
        <span className="spacer" />
        <button type="button" className="btn btn-primary" onClick={startCreate}>
          Novo cliente
        </button>
      </div>
      <ErrorNote error={error} />
      {formOpen ? (
        <form className="lite-form" onSubmit={(event) => void onSubmit(event)}>
          <label className="field">
            <span>Nome *</span>
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>CPF</span>
            <input
              value={form.cpf}
              onChange={(event) => setForm({ ...form, cpf: event.target.value })}
              placeholder="000.000.000-00"
            />
          </label>
          <label className="field">
            <span>Data de nascimento</span>
            <input
              type="date"
              value={form.birth_date}
              onChange={(event) => setForm({ ...form, birth_date: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Telefone</span>
            <input
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </label>
          <label className="field">
            <span>WhatsApp</span>
            <input
              value={form.whatsapp}
              onChange={(event) => setForm({ ...form, whatsapp: event.target.value })}
            />
          </label>
          <label className="field">
            <span>E-mail</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </label>
          <label className="field">
            <span>CEP</span>
            <input
              value={form.zip_code}
              onChange={(event) => setForm({ ...form, zip_code: event.target.value })}
              placeholder="00000-000"
              maxLength={12}
            />
          </label>
          <label className="field">
            <span>Rua</span>
            <input
              value={form.street}
              onChange={(event) => setForm({ ...form, street: event.target.value })}
              maxLength={200}
            />
          </label>
          <label className="field">
            <span>Número</span>
            <input
              value={form.number}
              onChange={(event) => setForm({ ...form, number: event.target.value })}
              maxLength={20}
            />
          </label>
          <label className="field">
            <span>Complemento</span>
            <input
              value={form.complement}
              onChange={(event) => setForm({ ...form, complement: event.target.value })}
              maxLength={100}
            />
          </label>
          <label className="field">
            <span>Bairro</span>
            <input
              value={form.neighborhood}
              onChange={(event) => setForm({ ...form, neighborhood: event.target.value })}
              maxLength={100}
            />
          </label>
          <label className="field">
            <span>Cidade</span>
            <input
              value={form.city}
              onChange={(event) => setForm({ ...form, city: event.target.value })}
              maxLength={100}
            />
          </label>
          <label className="field">
            <span>UF</span>
            <select value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })}>
              <option value="">—</option>
              {/* Keeps a legacy free-text value selectable instead of silently dropping it. */}
              {form.state && !UF_OPTIONS.includes(form.state) ? (
                <option value={form.state}>{form.state}</option>
              ) : null}
              {UF_OPTIONS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </label>
          {editingId ? (
            <label className="field">
              <span>Status</span>
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option value="ACTIVE">Ativo</option>
                <option value="INACTIVE">Inativo</option>
              </select>
            </label>
          ) : null}
          <label className="field field-wide">
            <span>Observações</span>
            <textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              maxLength={2000}
              rows={3}
            />
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setFormOpen(false);
                setEditingId(null);
              }}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              {editingId ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      ) : null}
      <div className="lite-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>CPF</th>
              <th>Telefone</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((customer) => (
              <tr key={customer.id}>
                <td>{customer.name}</td>
                <td>{customer.email ?? '—'}</td>
                <td>{customer.cpf ?? '—'}</td>
                <td>{customer.phone ?? '—'}</td>
                <td>
                  <StatusBadge status={customer.status} />
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => startEdit(customer)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => void toggleStatus(customer)}
                    >
                      {customer.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? <p className="lite-empty">Nenhum cliente encontrado.</p> : null}
      </div>
      <Pager page={page} pageSize={20} total={total} onPage={setPage} />
    </>
  );
}
