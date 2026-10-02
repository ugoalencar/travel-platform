import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useCan } from '../auth';
import { EmptyState, ErrorNote, Pager, StatusBadge, SuccessNote, formatBRL } from '../ui';

interface SaleListItem {
  id: string;
  sale_number: string;
  status: string;
  sale_date: string;
  due_date: string;
  gross_amount: number;
  cost_amount: number;
  margin_amount: number;
  installment_count: number;
  customer: { id: string; name: string };
  seller: { id: string; name: string };
  category: { id: string; name: string };
}

interface ListJson {
  items: SaleListItem[];
  page: number;
  pageSize: number;
  total: number;
}

interface Receivable {
  id: string;
  installment_number: number;
  amount: number;
  paid_amount: number;
  due_at: string;
  status: string;
}

interface SaleCost {
  id: string;
  financial_party_id: string | null;
  financial_party_name: string | null;
  cost_type: string;
  description: string;
  amount: number;
  due_date: string | null;
  payable_id: string | null;
}

interface DetailJson {
  sale: SaleListItem & { description: string | null };
  saleCosts: SaleCost[];
  receivables: Receivable[];
  commission: {
    id: string;
    status: string;
    commission_amount: number | null;
    calculation_type: string | null;
  } | null;
}

interface NamedItem {
  id: string;
  name: string;
}

interface FormState {
  customer_id: string;
  seller_id: string;
  category_id: string;
  payment_method_id: string;
  gross_amount: string;
  due_date: string;
  installment_count: string;
  description: string;
}

const EMPTY_FORM: FormState = {
  customer_id: '',
  seller_id: '',
  category_id: '',
  payment_method_id: '',
  gross_amount: '',
  due_date: '',
  installment_count: '1',
  description: '',
};

const EMPTY_COST_FORM = {
  description: '',
  amount: '',
  financial_party_id: '',
  due_date: '',
  create_payable: false,
  category_id: '',
};

export function SalesPage() {
  const canCancel = useCan('sales.update_all');
  const canCreate = useCan('sales.create');
  const canCreateCost = useCan('sale_costs.create');
  const [items, setItems] = useState<SaleListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<DetailJson | null>(null);
  const [customers, setCustomers] = useState<NamedItem[]>([]);
  const [sellers, setSellers] = useState<NamedItem[]>([]);
  const [categories, setCategories] = useState<NamedItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<NamedItem[]>([]);
  const [financialParties, setFinancialParties] = useState<NamedItem[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<NamedItem[]>([]);
  const [costForm, setCostForm] = useState(EMPTY_COST_FORM);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (status) params.set('status', status);
    if (search.trim()) params.set('search', search.trim());
    try {
      const response = await api<ListJson>(`/sales?${params.toString()}`);
      setItems(response.items);
      setTotal(response.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar');
    }
  }, [page, status, search]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadFormOptions(): Promise<void> {
    try {
      const [customerList, sellerList, categoryList, methodList, partyList, expenseCategoryList] = await Promise.all([
        api<{ items: NamedItem[] }>('/customers?pageSize=100'),
        api<{ items: NamedItem[] }>('/sellers?pageSize=100'),
        api<{ items: NamedItem[] }>('/categories'),
        api<{ items: NamedItem[] }>('/payment-methods'),
        api<{ items: NamedItem[] }>('/financial-parties?pageSize=100').catch(() => ({ items: [] })),
        api<{ items: Array<NamedItem & { direction: string }> }>('/financial-categories').catch(() => ({ items: [] })),
      ]);
      setCustomers(customerList.items);
      setSellers(sellerList.items);
      // An own-scoped seller only gets their own seller back: preselect it.
      const onlySeller = sellerList.items.length === 1 ? sellerList.items[0] : undefined;
      if (onlySeller) setForm((current) => (current.seller_id ? current : { ...current, seller_id: onlySeller.id }));
      setCategories(categoryList.items);
      setPaymentMethods(methodList.items);
      setFinancialParties(partyList.items);
      setExpenseCategories(expenseCategoryList.items.filter((item) => item.direction === 'OUT'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar cadastros');
    }
  }

  async function openCreate(): Promise<void> {
    setForm(EMPTY_FORM);
    setNotice(null);
    setFormOpen(true);
    await loadFormOptions();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const payload: Record<string, unknown> = {
        customer_id: form.customer_id,
        seller_id: form.seller_id,
        category_id: form.category_id,
        gross_amount: Number(form.gross_amount),
        due_date: form.due_date,
        installment_count: Number(form.installment_count),
      };
      if (form.payment_method_id) payload.payment_method_id = form.payment_method_id;
      if (form.description.trim()) payload.description = form.description.trim();
      const created = await api<{ sale: { id: string } }>('/sales', {
        method: 'POST',
        body: payload,
      });
      setFormOpen(false);
      setNotice('Venda criada como rascunho.');
      await load();
      await openDetail(created.sale.id);
    } catch (err) {
      setNotice(null);
      setError(err instanceof Error ? err.message : 'Falha ao criar venda');
    }
  }

  async function openDetail(saleId: string): Promise<void> {
    try {
      const response = await api<DetailJson>(`/sales/${saleId}`);
      setDetail(response);
      setCostForm(EMPTY_COST_FORM);
      setError(null);
    } catch (err) {
      setNotice(null);
      setError(err instanceof Error ? err.message : 'Falha ao abrir a venda');
    }
  }

  async function confirmSale(saleId: string): Promise<void> {
    try {
      await api(`/sales/${saleId}/confirm`, { method: 'POST' });
      setNotice('Venda confirmada.');
      await Promise.all([load(), openDetail(saleId)]);
    } catch (err) {
      setNotice(null);
      setError(err instanceof Error ? err.message : 'Falha ao confirmar');
    }
  }

  async function cancelSale(saleId: string): Promise<void> {
    const saleNumber = detail?.sale.sale_number ?? saleId;
    if (!window.confirm(`Cancelar a venda ${saleNumber}? Esta ação não pode ser desfeita.`)) return;
    try {
      await api(`/sales/${saleId}/cancel`, { method: 'POST' });
      setNotice('Venda cancelada.');
      await Promise.all([load(), openDetail(saleId)]);
    } catch (err) {
      setNotice(null);
      setError(err instanceof Error ? err.message : 'Falha ao cancelar');
    }
  }

  async function addCost(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!detail) return;
    try {
      const payload: Record<string, unknown> = {
        cost_type: 'OTHER',
        description: costForm.description.trim(),
        amount: Number(costForm.amount),
        create_payable: costForm.create_payable,
      };
      if (costForm.financial_party_id) payload.financial_party_id = costForm.financial_party_id;
      if (costForm.due_date) payload.due_date = costForm.due_date;
      if (costForm.category_id) payload.category_id = costForm.category_id;
      await api(`/sales/${detail.sale.id}/costs`, { method: 'POST', body: payload });
      setNotice('Custo adicionado.');
      await Promise.all([load(), openDetail(detail.sale.id)]);
    } catch (err) {
      setNotice(null);
      setError(err instanceof Error ? err.message : 'Falha ao adicionar custo');
    }
  }

  return (
    <>
      <h1>Vendas</h1>
      <div className="lite-toolbar">
        <input
          placeholder="Buscar por número ou descrição"
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
          <option value="DRAFT">Rascunho</option>
          <option value="CONFIRMED">Confirmada</option>
          <option value="PARTIALLY_PAID">Parcial</option>
          <option value="PAID">Paga</option>
          <option value="CANCELLED">Cancelada</option>
        </select>
        <span className="spacer" />
        {canCreate ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void openCreate()}
          >
            Nova venda
          </button>
        ) : null}
      </div>
      <ErrorNote error={error} />
      <SuccessNote success={notice} />
      {formOpen ? (
        <form className="lite-form" onSubmit={(event) => void onSubmit(event)}>
          <label className="field">
            <span>Cliente *</span>
            <select
              value={form.customer_id}
              onChange={(event) => setForm({ ...form, customer_id: event.target.value })}
              required
            >
              <option value="">Selecione…</option>
              {customers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Vendedor *</span>
            <select
              value={form.seller_id}
              onChange={(event) => setForm({ ...form, seller_id: event.target.value })}
              required
            >
              <option value="">Selecione…</option>
              {sellers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Categoria *</span>
            <select
              value={form.category_id}
              onChange={(event) => setForm({ ...form, category_id: event.target.value })}
              required
            >
              <option value="">Selecione…</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Forma de pagamento</span>
            <select
              value={form.payment_method_id}
              onChange={(event) => setForm({ ...form, payment_method_id: event.target.value })}
            >
              <option value="">—</option>
              {paymentMethods.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Valor bruto (R$) *</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.gross_amount}
              onChange={(event) => setForm({ ...form, gross_amount: event.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>Vencimento da 1ª parcela *</span>
            <input
              type="date"
              value={form.due_date}
              onChange={(event) => setForm({ ...form, due_date: event.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>Parcelas *</span>
            <input
              type="number"
              min="1"
              max="24"
              value={form.installment_count}
              onChange={(event) => setForm({ ...form, installment_count: event.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>Descrição</span>
            <input
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setFormOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              Criar rascunho
            </button>
          </div>
        </form>
      ) : null}
      {detail ? (
        <div className="lite-card">
          <div className="lite-toolbar">
            <h2 style={{ margin: 0 }}>
              {detail.sale.sale_number} — {detail.sale.customer.name}
            </h2>
            <StatusBadge status={detail.sale.status} />
            <span className="spacer" />
            {detail.sale.status === 'DRAFT' ? (
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={() => void confirmSale(detail.sale.id)}
              >
                Confirmar
              </button>
            ) : null}
            {canCancel && detail.sale.status !== 'CANCELLED' && detail.sale.status !== 'DRAFT' ? (
              <button
                type="button"
                className="btn btn-danger btn-small"
                onClick={() => void cancelSale(detail.sale.id)}
              >
                Cancelar venda
              </button>
            ) : null}
            <button type="button" className="btn btn-small" onClick={() => setDetail(null)}>
              Fechar
            </button>
          </div>
          <p className="lite-muted">
            {detail.sale.customer.name} · {detail.sale.seller.name} ·{' '}
            {detail.sale.category.name} · vencimento {detail.sale.due_date} ·{' '}
            {formatBRL(detail.sale.gross_amount)} · custos {formatBRL(detail.sale.cost_amount)} · margem{' '}
            {formatBRL(detail.sale.margin_amount)}
          </p>
          {canCreateCost && detail.sale.status === 'DRAFT' ? (
            <form className="lite-form" onSubmit={(event) => void addCost(event)}>
              <label className="field">
                <span>Descrição do custo *</span>
                <input
                  value={costForm.description}
                  onChange={(event) => setCostForm({ ...costForm, description: event.target.value })}
                  required
                />
              </label>
              <label className="field">
                <span>Favorecido</span>
                <select
                  value={costForm.financial_party_id}
                  onChange={(event) => setCostForm({ ...costForm, financial_party_id: event.target.value })}
                >
                  <option value="">—</option>
                  {financialParties.map((party) => (
                    <option key={party.id} value={party.id}>
                      {party.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Valor *</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={costForm.amount}
                  onChange={(event) => setCostForm({ ...costForm, amount: event.target.value })}
                  required
                />
              </label>
              <label className="field">
                <span>Vencimento</span>
                <input
                  type="date"
                  value={costForm.due_date}
                  onChange={(event) => setCostForm({ ...costForm, due_date: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Conta a pagar</span>
                <select
                  value={costForm.create_payable ? 'yes' : 'no'}
                  onChange={(event) => setCostForm({ ...costForm, create_payable: event.target.value === 'yes' })}
                >
                  <option value="no">Não gerar agora</option>
                  <option value="yes">Gerar conta a pagar</option>
                </select>
              </label>
              {costForm.create_payable ? (
                <label className="field">
                  <span>Categoria financeira</span>
                  <select
                    value={costForm.category_id}
                    onChange={(event) => setCostForm({ ...costForm, category_id: event.target.value })}
                  >
                    <option value="">Sem categoria</option>
                    {expenseCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  Adicionar custo
                </button>
              </div>
            </form>
          ) : null}
          <div className="lite-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Custo</th>
                  <th>Favorecido</th>
                  <th>Vencimento</th>
                  <th className="num">Valor</th>
                  <th>Conta a pagar</th>
                </tr>
              </thead>
              <tbody>
                {detail.saleCosts.map((cost) => (
                  <tr key={cost.id}>
                    <td>{cost.description}</td>
                    <td>{cost.financial_party_name ?? '—'}</td>
                    <td>{cost.due_date ?? '—'}</td>
                    <td className="num">{formatBRL(cost.amount)}</td>
                    <td>{cost.payable_id ? 'Gerada' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.saleCosts.length === 0 ? <p className="lite-empty">Nenhum custo lançado.</p> : null}
          </div>
          <div className="lite-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Parcela</th>
                  <th>Vencimento</th>
                  <th className="num">Valor</th>
                  <th className="num">Pago</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {detail.receivables.map((receivable) => (
                  <tr key={receivable.id}>
                    <td>{receivable.installment_number ?? 'Única'}</td>
                    <td>{receivable.due_at}</td>
                    <td className="num">{formatBRL(receivable.amount)}</td>
                    <td className="num">{formatBRL(receivable.paid_amount)}</td>
                    <td>
                      <StatusBadge status={receivable.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.receivables.length === 0 ? (
              <p className="lite-empty">
                Parcelas são geradas quando a venda é confirmada.
              </p>
            ) : null}
          </div>
          {detail.commission ? (
            <p>
              <strong>Comissão:</strong> <StatusBadge status={detail.commission.status} />{' '}
              {detail.commission.commission_amount !== null
                ? formatBRL(detail.commission.commission_amount)
                : 'valor a definir'}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="lite-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Número</th>
              <th>Data</th>
              <th>Cliente</th>
              <th>Vendedor</th>
              <th className="num">Bruto</th>
              <th className="num">Margem</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((sale) => (
              <tr key={sale.id}>
                <td>{sale.sale_number}</td>
                <td>{sale.sale_date}</td>
                <td>{sale.customer.name}</td>
                <td>{sale.seller.name}</td>
                <td className="num">{formatBRL(sale.gross_amount)}</td>
                <td className="num">{formatBRL(sale.margin_amount)}</td>
                <td>
                  <StatusBadge status={sale.status} />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => void openDetail(sale.id)}
                  >
                    Detalhe
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? (
          <EmptyState message="Nenhuma venda encontrada.">
            {canCreate ? (
              <button
                type="button"
                className="btn btn-small btn-primary"
                onClick={() => void openCreate()}
              >
                Nova venda
              </button>
            ) : null}
            <Link className="btn btn-small btn-ghost" to="/ajuda#vendas">
              Ver na ajuda
            </Link>
          </EmptyState>
        ) : null}
      </div>
      <Pager page={page} pageSize={20} total={total} onPage={setPage} />
    </>
  );
}
