import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from './api';
import { parseMoneyInput } from './saleForm';
import { ErrorNote, formatBRL } from './ui';

interface SaleItem {
  id: string;
  description: string;
  product_id: string | null;
  qty: number;
  unit_price: number;
  taxes: number;
  fees: number;
  discount: number;
  line_total: number;
  status: 'ACTIVE' | 'CANCELLED';
}

interface Option {
  id: string;
  name: string;
}

interface Props {
  saleId: string;
  /** Items can only change while the sale is a draft. */
  editable: boolean;
  /** Called after the server re-derived the sale totals. */
  onChanged: () => void;
}

const EMPTY = { description: '', product_id: '', qty: '1', unit_price: '', taxes: '', fees: '', discount: '' };

/** Price components of a sale. The sale's gross amount is derived from the active items on the server. */
export function SaleItemsPanel({ saleId, editable, onChanged }: Props) {
  const [items, setItems] = useState<SaleItem[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api<{ items: SaleItem[] }>(`/sales/${saleId}/items`);
      setItems(response.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar os itens');
    }
  }, [saleId]);

  useEffect(() => {
    void load();
    if (editable) {
      api<{ items: Option[] }>('/catalog-products')
        .then((response) => setProducts(response.items))
        .catch(() => setProducts([]));
    }
  }, [load, editable]);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const unitPrice = parseMoneyInput(form.unit_price);
    if (unitPrice === null) {
      setError('Informe o valor unitário (ex.: 1200,00).');
      return;
    }
    const optional = (raw: string, label: string): number | undefined | null => {
      if (raw.trim() === '') return undefined;
      const value = parseMoneyInput(raw);
      if (value === null) setError(`${label} inválido (ex.: 150,00).`);
      return value;
    };
    const taxes = optional(form.taxes, 'Taxas');
    const fees = optional(form.fees, 'Tarifas');
    const discount = optional(form.discount, 'Desconto');
    if (taxes === null || fees === null || discount === null) return;
    const qty = Number(form.qty.replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Informe uma quantidade maior que zero.');
      return;
    }
    try {
      await api(`/sales/${saleId}/items`, {
        method: 'POST',
        body: {
          description: form.description.trim(),
          qty,
          unit_price: unitPrice,
          ...(taxes !== undefined ? { taxes } : {}),
          ...(fees !== undefined ? { fees } : {}),
          ...(discount !== undefined ? { discount } : {}),
          ...(form.product_id ? { product_id: form.product_id } : {}),
        },
      });
      setForm(EMPTY);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao adicionar o item');
    }
  }

  async function cancel(item: SaleItem): Promise<void> {
    if (!window.confirm(`Cancelar o item "${item.description}"?`)) return;
    try {
      await api(`/sale-items/${item.id}/cancel`, { method: 'POST' });
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao cancelar o item');
    }
  }

  const active = items.filter((item) => item.status === 'ACTIVE');

  return (
    <section aria-label="Itens da venda">
      <h3>Itens da venda</h3>
      <ErrorNote error={error} />
      {active.length > 0 ? (
        <p className="lite-muted">O valor bruto da venda é a soma dos itens ativos.</p>
      ) : null}
      {items.length > 0 ? (
        <div className="lite-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Descrição</th>
                <th className="num">Qtd.</th>
                <th className="num">Valor unit.</th>
                <th className="num">Total</th>
                <th>Status</th>
                {editable ? <th>Ações</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td className="num">{item.qty}</td>
                  <td className="num">{formatBRL(item.unit_price)}</td>
                  <td className="num">{formatBRL(item.line_total)}</td>
                  <td>{item.status === 'ACTIVE' ? 'Ativo' : 'Cancelado'}</td>
                  {editable ? (
                    <td>
                      {item.status === 'ACTIVE' ? (
                        <button type="button" className="btn btn-small" onClick={() => void cancel(item)}>
                          Cancelar item
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="lite-muted">Nenhum item. Sem itens, o valor bruto é o informado na venda.</p>
      )}
      {editable ? (
        <form className="lite-form" onSubmit={(event) => void onSubmit(event)}>
          <label className="field field-wide">
            <span>Descrição do item *</span>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          </label>
          <label className="field">
            <span>Produto</span>
            <select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
              <option value="">Sem produto</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Quantidade</span>
            <input value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
          </label>
          <label className="field">
            <span>Valor unitário *</span>
            <input value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
          </label>
          <label className="field">
            <span>Taxas</span>
            <input value={form.taxes} onChange={(e) => setForm({ ...form, taxes: e.target.value })} />
          </label>
          <label className="field">
            <span>Tarifas</span>
            <input value={form.fees} onChange={(e) => setForm({ ...form, fees: e.target.value })} />
          </label>
          <label className="field">
            <span>Desconto</span>
            <input value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Adicionar item
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
