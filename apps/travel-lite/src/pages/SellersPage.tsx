import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useCan } from '../auth';
import { sellerReportQuery, sellerSalesLink, type SellerReport } from '../sellerReport';
import { ErrorNote, Pager, StatusBadge, formatBRL } from '../ui';

interface Seller {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  status: string;
  commission_rule_type: string;
  commission_rate: number | null;
  commission_fixed_amount: number | null;
}

interface ListJson {
  items: Seller[];
  page: number;
  pageSize: number;
  total: number;
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  ruleType: string;
  rate: string;
  fixedAmount: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  phone: '',
  cpf: '',
  ruleType: 'UNDEFINED',
  rate: '',
  fixedAmount: '',
};

export function SellersPage() {
  const canManage = useCan('sellers.manage');
  const [items, setItems] = useState<Seller[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summarySeller, setSummarySeller] = useState<Seller | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (search.trim()) params.set('search', search.trim());
    if (status) params.set('status', status);
    try {
      const response = await api<ListJson>(`/sellers?${params.toString()}`);
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

  function startEdit(seller: Seller) {
    setEditingId(seller.id);
    setForm({
      name: seller.name,
      email: seller.email ?? '',
      phone: seller.phone ?? '',
      cpf: seller.cpf ?? '',
      ruleType: seller.commission_rule_type,
      rate: seller.commission_rate !== null ? String(seller.commission_rate) : '',
      fixedAmount:
        seller.commission_fixed_amount !== null ? String(seller.commission_fixed_amount) : '',
    });
    setFormOpen(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      commission_rule_type: form.ruleType,
    };
    if (form.email.trim()) payload.email = form.email.trim();
    if (form.phone.trim()) payload.phone = form.phone.trim();
    if (form.cpf.trim()) payload.cpf = form.cpf.trim();
    if (form.ruleType === 'PERCENTAGE_ON_GROSS' || form.ruleType === 'PERCENTAGE_ON_MARGIN') {
      payload.commission_rate = Number(form.rate);
    }
    if (form.ruleType === 'FIXED') {
      payload.commission_fixed_amount = Number(form.fixedAmount);
    }
    try {
      if (editingId) {
        await api(`/sellers/${editingId}`, { method: 'PATCH', body: payload });
      } else {
        await api('/sellers', { method: 'POST', body: payload });
      }
      setFormOpen(false);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar');
    }
  }

  async function toggleStatus(seller: Seller) {
    try {
      await api(`/sellers/${seller.id}`, {
        method: 'PATCH',
        body: { status: seller.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar');
    }
  }

  function ruleDescription(seller: Seller): string {
    if (seller.commission_rule_type === 'PERCENTAGE_ON_GROSS') {
      return `${seller.commission_rate}% bruto`;
    }
    if (seller.commission_rule_type === 'PERCENTAGE_ON_MARGIN') {
      return `${seller.commission_rate}% margem`;
    }
    if (seller.commission_rule_type === 'FIXED') {
      return `R$ ${seller.commission_fixed_amount}`;
    }
    return 'Sem regra';
  }

  return (
    <>
      <h1>Vendedores</h1>
      <div className="lite-toolbar">
        <input
          placeholder="Buscar por nome ou e-mail"
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
        {canManage ? (
          <button type="button" className="btn btn-primary" onClick={startCreate}>
            Novo vendedor
          </button>
        ) : null}
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
            <span>E-mail</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
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
            <span>CPF</span>
            <input
              value={form.cpf}
              onChange={(event) => setForm({ ...form, cpf: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Regra de comissão</span>
            <select
              value={form.ruleType}
              onChange={(event) => setForm({ ...form, ruleType: event.target.value })}
            >
              <option value="UNDEFINED">Sem regra</option>
              <option value="PERCENTAGE_ON_GROSS">% sobre bruto</option>
              <option value="PERCENTAGE_ON_MARGIN">% sobre margem</option>
              <option value="FIXED">Valor fixo</option>
            </select>
          </label>
          {form.ruleType === 'PERCENTAGE_ON_GROSS' || form.ruleType === 'PERCENTAGE_ON_MARGIN' ? (
            <label className="field">
              <span>Percentual (%) *</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.rate}
                onChange={(event) => setForm({ ...form, rate: event.target.value })}
                required
              />
            </label>
          ) : null}
          {form.ruleType === 'FIXED' ? (
            <label className="field">
              <span>Valor fixo (R$) *</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.fixedAmount}
                onChange={(event) => setForm({ ...form, fixedAmount: event.target.value })}
                required
              />
            </label>
          ) : null}
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
      {summarySeller ? (
        <SellerSummary seller={summarySeller} onClose={() => setSummarySeller(null)} />
      ) : null}
      <div className="lite-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Regra</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((seller) => (
              <tr key={seller.id}>
                <td>{seller.name}</td>
                <td>{seller.email ?? '—'}</td>
                <td>{ruleDescription(seller)}</td>
                <td>
                  <StatusBadge status={seller.status} />
                </td>
                <td>
                  <div className="row-actions">
                    <button type="button" className="btn btn-small" onClick={() => setSummarySeller(seller)}>
                      Resumo
                    </button>
                    {canManage ? (
                      <>
                        <button type="button" className="btn btn-small" onClick={() => startEdit(seller)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={() => void toggleStatus(seller)}
                        >
                          {seller.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? <p className="lite-empty">Nenhum vendedor encontrado.</p> : null}
      </div>
      <Pager page={page} pageSize={20} total={total} onPage={setPage} />
    </>
  );
}

function monthBounds(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: iso(first), to: iso(last) };
}

/** Seller history card: same numbers as Reports > Vendedores for this seller. */
function SellerSummary({ seller, onClose }: { seller: Seller; onClose: () => void }) {
  const [period, setPeriod] = useState(monthBounds);
  const [report, setReport] = useState<SellerReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = sellerReportQuery({ ...period, sellerId: seller.id, categoryId: '', status: '' });
    api<SellerReport>(`/reports/sellers?${query}`)
      .then((response) => {
        setReport(response);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Falha ao carregar o resumo'));
  }, [seller.id, period]);

  const row = report?.items.find((item) => item.seller_id === seller.id);

  return (
    <section className="lite-card">
      <div className="lite-toolbar">
        <h2>Resumo de {seller.name}</h2>
        <label className="field">
          <span>De</span>
          <input
            type="date"
            value={period.from}
            onChange={(event) => setPeriod({ ...period, from: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Até</span>
          <input type="date" value={period.to} onChange={(event) => setPeriod({ ...period, to: event.target.value })} />
        </label>
        <span className="spacer" />
        <Link className="btn btn-primary" to={sellerSalesLink(seller.id, period.from, period.to)}>
          Ver vendas deste vendedor
        </Link>
        <button type="button" className="btn" onClick={onClose}>
          Fechar
        </button>
      </div>
      <ErrorNote error={error} />
      <div className="lite-grid">
        <div className="stat">
          <div className="stat-label">Vendas no período</div>
          <div className="stat-value">{row?.sales_count ?? 0}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Valor vendido</div>
          <div className="stat-value">{formatBRL(row?.gross_amount ?? 0)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Margem</div>
          <div className="stat-value">{formatBRL(row?.margin_amount ?? 0)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Comissão a pagar</div>
          <div className="stat-value">{formatBRL(row?.commission_pending_amount ?? 0)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Comissão paga</div>
          <div className="stat-value">{formatBRL(row?.commission_paid_amount ?? 0)}</div>
        </div>
      </div>
      {row && row.commission_pending_rule_count > 0 ? (
        <p className="lite-muted">
          {row.commission_pending_rule_count} venda(s) com comissão aguardando definição de regra.
        </p>
      ) : null}
    </section>
  );
}
