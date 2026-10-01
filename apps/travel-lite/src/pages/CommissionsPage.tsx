import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { ErrorNote, Pager, StatusBadge, formatBRL } from '../ui';

interface Commission {
  id: string;
  sale_id: string;
  seller_id: string;
  status: string;
  calculation_type: string | null;
  commission_amount: number | null;
  seller_name: string;
  sale_number: string;
  payable_id: string | null;
  payable_status: string | null;
}

interface ListJson {
  items: Commission[];
  page: number;
  pageSize: number;
  total: number;
}

interface Seller {
  id: string;
  name: string;
}

export function CommissionsPage() {
  const [items, setItems] = useState<Commission[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [overrideAmount, setOverrideAmount] = useState('');
  const [overrideNotes, setOverrideNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (status) params.set('status', status);
    if (sellerId) params.set('seller_id', sellerId);
    try {
      const response = await api<ListJson>(`/commissions?${params.toString()}`);
      setItems(response.items);
      setTotal(response.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar');
    }
  }, [page, status, sellerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api<{ items: Seller[] }>('/sellers?pageSize=100')
      .then((response) => setSellers(response.items))
      .catch(() => setSellers([]));
  }, []);

  async function approve(commission: Commission): Promise<void> {
    try {
      await api(`/commissions/${commission.id}/approve`, { method: 'POST', body: {} });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aprovar');
    }
  }

  async function submitOverride(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!overrideId) return;
    try {
      const body: Record<string, unknown> = { commission_amount: Number(overrideAmount) };
      if (overrideNotes.trim()) body.notes = overrideNotes.trim();
      await api(`/commissions/${overrideId}`, { method: 'PATCH', body });
      setOverrideId(null);
      setOverrideAmount('');
      setOverrideNotes('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao ajustar');
    }
  }

  function openOverride(commission: Commission): void {
    setOverrideId(commission.id);
    setOverrideAmount(commission.commission_amount !== null ? String(commission.commission_amount) : '');
    setOverrideNotes('');
  }

  return (
    <>
      <h1>Comissões</h1>
      <div className="lite-toolbar">
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos os status</option>
          <option value="PENDING_RULE">Sem regra</option>
          <option value="PENDING">Pendente</option>
          <option value="APPROVED">Aprovada</option>
          <option value="PAID">Paga</option>
          <option value="CANCELLED">Cancelada</option>
        </select>
        <select
          value={sellerId}
          onChange={(event) => {
            setSellerId(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos os vendedores</option>
          {sellers.map((seller) => (
            <option key={seller.id} value={seller.id}>
              {seller.name}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote error={error} />
      {overrideId ? (
        <form className="lite-form" onSubmit={(event) => void submitOverride(event)}>
          <label className="field">
            <span>Valor manual (R$) *</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={overrideAmount}
              onChange={(event) => setOverrideAmount(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Observação</span>
            <input
              value={overrideNotes}
              onChange={(event) => setOverrideNotes(event.target.value)}
              placeholder="Negociação manual"
            />
          </label>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setOverrideId(null)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              Aplicar
            </button>
          </div>
        </form>
      ) : null}
      <div className="lite-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Venda</th>
              <th>Vendedor</th>
              <th>Cálculo</th>
              <th className="num">Valor</th>
              <th>Status</th>
              <th>Pagável</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((commission) => (
              <tr key={commission.id}>
                <td>{commission.sale_number}</td>
                <td>{commission.seller_name}</td>
                <td>{commission.calculation_type ?? '—'}</td>
                <td className="num">
                  {commission.commission_amount !== null
                    ? formatBRL(commission.commission_amount)
                    : '—'}
                </td>
                <td>
                  <StatusBadge status={commission.status} />
                </td>
                <td>
                  {commission.payable_status ? (
                    <StatusBadge status={commission.payable_status} />
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <div className="row-actions">
                    {commission.status === 'PENDING' ? (
                      <button
                        type="button"
                        className="btn btn-small btn-primary"
                        onClick={() => void approve(commission)}
                      >
                        Aprovar
                      </button>
                    ) : null}
                    {commission.status !== 'PAID' && commission.status !== 'CANCELLED' ? (
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => openOverride(commission)}
                      >
                        Ajustar
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? <p className="lite-empty">Nenhuma comissão encontrada.</p> : null}
      </div>
      <Pager page={page} pageSize={20} total={total} onPage={setPage} />
    </>
  );
}
