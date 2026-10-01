import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useCan } from '../auth';
import { ErrorNote, Pager, StatusBadge, formatBRL } from '../ui';

interface NamedItem {
  id: string;
  name: string;
}

interface Receivable {
  id: string;
  sale_number: string | null;
  customer_name: string | null;
  installment_number: number | null;
  description: string;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  due_at: string;
  status: string;
}

interface Payable {
  id: string;
  description: string;
  supplier_name: string | null;
  category_name: string | null;
  seller_name: string | null;
  amount: number;
  paid_amount: number;
  due_at: string;
  status: string;
  commission_id: string | null;
}

interface Payment {
  id: string;
  direction: string;
  amount: number;
  method: string | null;
  reference: string | null;
  paid_at: string;
  account_name: string | null;
  reversal_of_payment_id: string | null;
  reversal_reason: string | null;
  reversed_by_payment_id: string | null;
}

interface PageJson<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

interface PayableForm {
  description: string;
  amount: string;
  due_at: string;
  category_id: string;
  supplier_name: string;
}

const EMPTY_PAYABLE: PayableForm = {
  description: '',
  amount: '',
  due_at: '',
  category_id: '',
  supplier_name: '',
};

type Tab = 'receivables' | 'payables' | 'history';

export function FinancePage() {
  const [tab, setTab] = useState<Tab>('receivables');
  const canManageFinance = useCan('finance.manage');
  const canPayCommissions = useCan('commissions.pay');
  const [reversing, setReversing] = useState<Payment | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [receivablePage, setReceivablePage] = useState(1);
  const [receivableTotal, setReceivableTotal] = useState(0);
  const [receivableStatus, setReceivableStatus] = useState('');
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [receiveAmount, setReceiveAmount] = useState('');

  const [payables, setPayables] = useState<Payable[]>([]);
  const [payablePage, setPayablePage] = useState(1);
  const [payableTotal, setPayableTotal] = useState(0);
  const [payableStatus, setPayableStatus] = useState('');
  const [payableForm, setPayableForm] = useState<PayableForm>(EMPTY_PAYABLE);
  const [payableFormOpen, setPayableFormOpen] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentTotal, setPaymentTotal] = useState(0);
  const [paymentDirection, setPaymentDirection] = useState('');

  const [accounts, setAccounts] = useState<NamedItem[]>([]);
  const [accountId, setAccountId] = useState('');
  const [financialCategories, setFinancialCategories] = useState<NamedItem[]>([]);

  const loadReceivables = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(receivablePage),
      pageSize: '20',
    });
    if (receivableStatus) params.set('status', receivableStatus);
    try {
      const response = await api<PageJson<Receivable>>(`/receivables?${params.toString()}`);
      setReceivables(response.items);
      setReceivableTotal(response.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar');
    }
  }, [receivablePage, receivableStatus]);

  const loadPayables = useCallback(async () => {
    const params = new URLSearchParams({ page: String(payablePage), pageSize: '20' });
    if (payableStatus) params.set('status', payableStatus);
    try {
      const response = await api<PageJson<Payable>>(`/payables?${params.toString()}`);
      setPayables(response.items);
      setPayableTotal(response.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar');
    }
  }, [payablePage, payableStatus]);

  const loadPayments = useCallback(async () => {
    const params = new URLSearchParams({ page: String(paymentPage), pageSize: '20' });
    if (paymentDirection) params.set('direction', paymentDirection);
    try {
      const response = await api<PageJson<Payment>>(`/payments?${params.toString()}`);
      setPayments(response.items);
      setPaymentTotal(response.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar');
    }
  }, [paymentPage, paymentDirection]);

  useEffect(() => {
    void loadReceivables();
  }, [loadReceivables]);

  useEffect(() => {
    void loadPayables();
  }, [loadPayables]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    api<{ items: NamedItem[] }>('/financial-accounts')
      .then((response) => {
        setAccounts(response.items);
        setAccountId((current) => current || response.items[0]?.id || '');
      })
      .catch(() => setAccounts([]));
    api<{ items: NamedItem[] }>('/financial-categories')
      .then((response) => setFinancialCategories(response.items))
      .catch(() => setFinancialCategories([]));
  }, []);

  async function submitReceive(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!receivingId || !accountId) return;
    try {
      const body: Record<string, unknown> = { account_id: accountId };
      if (receiveAmount.trim()) body.amount = Number(receiveAmount);
      await api(`/receivables/${receivingId}/receive`, { method: 'POST', body });
      setReceivingId(null);
      setReceiveAmount('');
      await loadReceivables();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao receber');
    }
  }

  async function submitPayable(event: FormEvent): Promise<void> {
    event.preventDefault();
    try {
      const body: Record<string, unknown> = {
        description: payableForm.description.trim(),
        amount: Number(payableForm.amount),
        due_at: payableForm.due_at,
      };
      if (payableForm.category_id) body.category_id = payableForm.category_id;
      if (payableForm.supplier_name.trim()) body.supplier_name = payableForm.supplier_name.trim();
      await api('/payables', { method: 'POST', body });
      setPayableForm(EMPTY_PAYABLE);
      setPayableFormOpen(false);
      await loadPayables();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar');
    }
  }

  async function submitPay(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!payingId || !accountId) return;
    try {
      await api(`/payables/${payingId}/pay`, { method: 'POST', body: { account_id: accountId } });
      setPayingId(null);
      await loadPayables();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao pagar');
    }
  }

  async function submitReversal(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!reversing) return;
    try {
      await api(`/payments/${reversing.id}/reverse`, {
        method: 'POST',
        body: { reason: reversalReason.trim() },
      });
      setReversing(null);
      setReversalReason('');
      await Promise.all([loadPayments(), loadReceivables(), loadPayables()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao estornar');
    }
  }

  return (
    <>
      <h1>Financeiro</h1>
      <div className="lite-tabs">
        <button
          type="button"
          className={tab === 'receivables' ? 'lite-tab active' : 'lite-tab'}
          onClick={() => setTab('receivables')}
        >
          A receber
        </button>
        <button
          type="button"
          className={tab === 'payables' ? 'lite-tab active' : 'lite-tab'}
          onClick={() => setTab('payables')}
        >
          A pagar
        </button>
        <button
          type="button"
          className={tab === 'history' ? 'lite-tab active' : 'lite-tab'}
          onClick={() => setTab('history')}
        >
          Histórico
        </button>
      </div>
      <ErrorNote error={error} />
      {accounts.length === 0 ? (
        <p className="lite-error">
          Cadastre uma conta financeira em Cadastros para registrar pagamentos.
        </p>
      ) : null}
      {tab === 'receivables' ? (
        <>
          <div className="lite-toolbar">
            <select
              value={receivableStatus}
              onChange={(event) => {
                setReceivableStatus(event.target.value);
                setReceivablePage(1);
              }}
            >
              <option value="">Todos os status</option>
              <option value="OPEN">Em aberto</option>
              <option value="PARTIALLY_PAID">Parcial</option>
              <option value="PAID">Paga</option>
              <option value="CANCELLED">Cancelada</option>
            </select>
          </div>
          {receivingId ? (
            <form className="lite-form" onSubmit={(event) => void submitReceive(event)}>
              <label className="field">
                <span>Conta *</span>
                <select value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Valor recebido (R$) — vazio = total</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={receiveAmount}
                  onChange={(event) => setReceiveAmount(event.target.value)}
                />
              </label>
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => setReceivingId(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Registrar recebimento
                </button>
              </div>
            </form>
          ) : null}
          <div className="lite-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Venda</th>
                  <th>Cliente</th>
                  <th>Parcela</th>
                  <th>Vencimento</th>
                  <th className="num">Valor</th>
                  <th className="num">Restante</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {receivables.map((receivable) => (
                  <tr key={receivable.id}>
                    <td>{receivable.sale_number ?? '—'}</td>
                    <td>{receivable.customer_name ?? '—'}</td>
                    <td>{receivable.installment_number ?? 'Única'}</td>
                    <td>{receivable.due_at}</td>
                    <td className="num">{formatBRL(receivable.amount)}</td>
                    <td className="num">{formatBRL(receivable.remaining_amount)}</td>
                    <td>
                      <StatusBadge status={receivable.status} />
                    </td>
                    <td>
                      {canManageFinance &&
                      (receivable.status === 'OPEN' || receivable.status === 'PARTIALLY_PAID') ? (
                        <button
                          type="button"
                          className="btn btn-small btn-primary"
                          onClick={() => setReceivingId(receivable.id)}
                        >
                          Receber
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {receivables.length === 0 ? (
              <p className="lite-empty">Nenhum recebível. Confirme uma venda para gerar parcelas.</p>
            ) : null}
          </div>
          <Pager
            page={receivablePage}
            pageSize={20}
            total={receivableTotal}
            onPage={setReceivablePage}
          />
        </>
      ) : null}
      {tab === 'payables' ? (
        <>
          <div className="lite-toolbar">
            <select
              value={payableStatus}
              onChange={(event) => {
                setPayableStatus(event.target.value);
                setPayablePage(1);
              }}
            >
              <option value="">Todos os status</option>
              <option value="OPEN">Em aberto</option>
              <option value="PARTIALLY_PAID">Parcial</option>
              <option value="PAID">Paga</option>
              <option value="CANCELLED">Cancelada</option>
            </select>
            <span className="spacer" />
            {canManageFinance ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setPayableFormOpen((open) => !open)}
              >
                Nova despesa
              </button>
            ) : null}
          </div>
          {payableFormOpen ? (
            <form className="lite-form" onSubmit={(event) => void submitPayable(event)}>
              <label className="field">
                <span>Descrição *</span>
                <input
                  value={payableForm.description}
                  onChange={(event) =>
                    setPayableForm({ ...payableForm, description: event.target.value })
                  }
                  required
                />
              </label>
              <label className="field">
                <span>Valor (R$) *</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={payableForm.amount}
                  onChange={(event) => setPayableForm({ ...payableForm, amount: event.target.value })}
                  required
                />
              </label>
              <label className="field">
                <span>Vencimento *</span>
                <input
                  type="date"
                  value={payableForm.due_at}
                  onChange={(event) => setPayableForm({ ...payableForm, due_at: event.target.value })}
                  required
                />
              </label>
              <label className="field">
                <span>Categoria</span>
                <select
                  value={payableForm.category_id}
                  onChange={(event) =>
                    setPayableForm({ ...payableForm, category_id: event.target.value })
                  }
                >
                  <option value="">—</option>
                  {financialCategories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Fornecedor</span>
                <input
                  value={payableForm.supplier_name}
                  onChange={(event) =>
                    setPayableForm({ ...payableForm, supplier_name: event.target.value })
                  }
                />
              </label>
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => setPayableFormOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Criar
                </button>
              </div>
            </form>
          ) : null}
          {payingId ? (
            <form className="lite-form" onSubmit={(event) => void submitPay(event)}>
              <label className="field">
                <span>Conta *</span>
                <select value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => setPayingId(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Registrar pagamento
                </button>
              </div>
            </form>
          ) : null}
          <div className="lite-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Fornecedor</th>
                  <th>Categoria</th>
                  <th>Vencimento</th>
                  <th className="num">Valor</th>
                  <th className="num">Pago</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {payables.map((payable) => (
                  <tr key={payable.id}>
                    <td>{payable.description}</td>
                    <td>{payable.supplier_name ?? payable.seller_name ?? '—'}</td>
                    <td>{payable.category_name ?? '—'}</td>
                    <td>{payable.due_at}</td>
                    <td className="num">{formatBRL(payable.amount)}</td>
                    <td className="num">{formatBRL(payable.paid_amount)}</td>
                    <td>
                      <StatusBadge status={payable.status} />
                    </td>
                    <td>
                      {canManageFinance &&
                      (!payable.commission_id || canPayCommissions) &&
                      (payable.status === 'OPEN' || payable.status === 'PARTIALLY_PAID') ? (
                        <button
                          type="button"
                          className="btn btn-small btn-primary"
                          onClick={() => setPayingId(payable.id)}
                        >
                          Pagar
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payables.length === 0 ? <p className="lite-empty">Nenhum payable em aberto.</p> : null}
          </div>
          <Pager page={payablePage} pageSize={20} total={payableTotal} onPage={setPayablePage} />
        </>
      ) : null}
      {tab === 'history' ? (
        <>
          <div className="lite-toolbar">
            <select
              value={paymentDirection}
              onChange={(event) => {
                setPaymentDirection(event.target.value);
                setPaymentPage(1);
              }}
            >
              <option value="">Entradas e saídas</option>
              <option value="IN">Somente entradas</option>
              <option value="OUT">Somente saídas</option>
            </select>
          </div>
          {reversing ? (
            <form className="lite-form" onSubmit={(event) => void submitReversal(event)}>
              <p className="field-wide">
                Estornar {reversing.direction === 'IN' ? 'recebimento' : 'pagamento'} de{' '}
                {formatBRL(reversing.amount)} em {reversing.paid_at}. O lançamento original é mantido e
                um movimento inverso é registrado.
              </p>
              <label className="field field-wide">
                <span>Motivo do estorno *</span>
                <input
                  value={reversalReason}
                  onChange={(event) => setReversalReason(event.target.value)}
                  minLength={3}
                  maxLength={500}
                  required
                />
              </label>
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => setReversing(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-danger">
                  Confirmar estorno
                </button>
              </div>
            </form>
          ) : null}
          <div className="lite-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Direção</th>
                  <th className="num">Valor</th>
                  <th>Conta</th>
                  <th>Forma</th>
                  <th>Referência</th>
                  <th>Estorno</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.paid_at}</td>
                    <td>
                      <span className={payment.direction === 'IN' ? 'badge badge-success' : 'badge badge-warning'}>
                        {payment.direction === 'IN' ? 'Entrada' : 'Saída'}
                      </span>
                    </td>
                    <td className="num">{formatBRL(payment.amount)}</td>
                    <td>{payment.account_name ?? '—'}</td>
                    <td>{payment.method ?? '—'}</td>
                    <td>{payment.reference ?? '—'}</td>
                    <td>
                      {payment.reversal_of_payment_id ? (
                        <span title={payment.reversal_reason ?? ''}>
                          <span className="badge badge-neutral">Estorno</span> {payment.reversal_reason}
                        </span>
                      ) : payment.reversed_by_payment_id ? (
                        <span className="badge badge-danger">Estornado</span>
                      ) : canManageFinance ? (
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={() => {
                            setReversing(payment);
                            setReversalReason('');
                          }}
                        >
                          Estornar
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payments.length === 0 ? <p className="lite-empty">Nenhum pagamento registrado.</p> : null}
          </div>
          <Pager page={paymentPage} pageSize={20} total={paymentTotal} onPage={setPaymentPage} />
        </>
      ) : null}
    </>
  );
}
