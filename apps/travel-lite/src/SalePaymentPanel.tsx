import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, api } from './api';
import { useCan } from './auth';
import { previewPaymentSchedule } from './paymentSchedule';
import type { PaymentCondition, PaymentScheduleItem, SaleBalance, SalePaymentInput } from './paymentSchedule';
import { parseMoneyInput } from './saleForm';
import { ErrorNote, SuccessNote, formatBRL } from './ui';

const kindLabels: Record<PaymentScheduleItem['kind'], string> = {
  SINGLE: 'Única', INSTALLMENT: 'Parcela', DOWN_PAYMENT: 'Entrada', BALANCE: 'Saldo',
};
const statusLabels: Record<string, string> = {
  OPEN: 'Em aberto', PARTIALLY_PAID: 'Parcialmente paga', PAID: 'Paga', CANCELLED: 'Cancelada', OVERDUE: 'Em atraso',
};

export interface PanelSale {
  id: string;
  gross_amount: number;
  sale_date: string;
  travel_start_date?: string | null;
  status: string;
}

interface Props {
  sale: PanelSale;
  /** Role of the logged user: only MASTER and ADMIN revise a condition. */
  role: string;
  onChange?: () => void;
}

function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Não foi possível concluir a operação. Verifique sua conexão e tente novamente.';
}

/** Real payment schedule and partial receipts of a sale (mirror of the Full SalePaymentPanel). */
export function SalePaymentPanel({ sale, role, onChange }: Props) {
  const id = useId();
  const canCollect = useCan('finance.manage');
  const canRevise = canCollect && (role === 'ADMIN' || role === 'MASTER');
  const [balance, setBalance] = useState<SaleBalance | null>(null);
  const [conditions, setConditions] = useState<PaymentCondition[]>([]);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [balanceStale, setBalanceStale] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const [conditionId, setConditionId] = useState('');
  const [installments, setInstallments] = useState('1');
  const [scheduleMethod, setScheduleMethod] = useState('');
  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState('');
  const [method, setMethod] = useState('');
  const [accountId, setAccountId] = useState('');
  const [attempt, setAttempt] = useState<SalePaymentInput | null>(null);
  const [revising, setRevising] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    api<SaleBalance>(`/sales/${sale.id}/balance`)
      .then(async (data) => {
        if (!Array.isArray(data.receivables)) throw new Error('Resposta de saldo inválida.');
        let available: PaymentCondition[] = [];
        let bank: Array<{ id: string; name: string }> = [];
        if (canCollect) {
          if (!data.snapshot) available = (await api<{ conditions: PaymentCondition[] }>('/payment-conditions')).conditions;
          bank = (await api<{ items: Array<{ id: string; name: string }> }>('/financial-accounts')).items;
        }
        if (!cancelled) { setBalance(data); setConditions(available); setAccounts(bank); }
      })
      .catch((cause: unknown) => { if (!cancelled) setLoadError(errorMessage(cause)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sale.id, reload, canCollect]);

  const condition = conditions.find((item) => item.id === conditionId);
  let preview: PaymentScheduleItem[] = [];
  let previewError = '';
  if (condition) {
    try {
      preview = previewPaymentSchedule(condition, sale.gross_amount, Number(installments), sale.sale_date, sale.travel_start_date ?? null);
    } catch (cause: unknown) {
      previewError = cause instanceof Error ? cause.message : 'Não foi possível calcular a prévia.';
    }
  }
  const collectible = sale.status === 'DRAFT' || sale.status === 'CONFIRMED' || sale.status === 'PARTIALLY_PAID';

  async function refreshBalance(): Promise<void> {
    try {
      const current = await api<SaleBalance>(`/sales/${sale.id}/balance`);
      if (mounted.current) { setBalance(current); setBalanceStale(false); }
    } catch {
      if (mounted.current) {
        setBalanceStale(true);
        setError('Não foi possível atualizar o saldo. Use Atualizar saldo antes de registrar outra baixa.');
      }
    }
    if (mounted.current) onChange?.();
  }

  async function run(action: () => Promise<void>): Promise<void> {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (cause: unknown) { if (mounted.current) setError(errorMessage(cause)); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!collectible || !condition || previewError || !scheduleMethod) return;
    void run(async () => {
      const data = await api<SaleBalance>(`/sales/${sale.id}/payment-schedule`, {
        method: 'POST', body: { conditionId, installments: Number(installments), paymentMethod: scheduleMethod },
      });
      if (!mounted.current) return;
      setBalance(data); setNotice('Cronograma aplicado.');
      await refreshBalance();
    });
  }

  function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!balance || !collectible || lock.current) return;
    let payload = attempt;
    if (!payload) {
      if (balanceStale) return;
      const value = parseMoneyInput(amount);
      if (value === null || value <= 0 || value >= 1e12) { setError('Informe um valor positivo com até duas casas decimais.'); return; }
      if (Math.round(value * 100) > Math.round(balance.remaining * 100)) { setError('O valor não pode ser maior que o saldo.'); return; }
      const date = new Date(`${paidDate}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== paidDate) {
        setError('Informe uma data válida para a baixa.'); return;
      }
      if (!balance.snapshot?.condition.paymentMethods.includes(method)) { setError('Selecione a forma da baixa.'); return; }
      if (!accountId) { setError('Selecione a conta financeira.'); return; }
      payload = { amount: value, method, paid_at: `${paidDate}T00:00:00-03:00`, account_id: accountId, idempotency_key: crypto.randomUUID() };
    }
    const request = payload;
    setAttempt(request);
    void run(async () => {
      try {
        const result = await api<{ paymentId: string; balance: SaleBalance }>(`/sales/${sale.id}/payments`, { method: 'POST', body: request });
        if (!mounted.current) return;
        setAttempt(null); setAmount(''); setBalance(result.balance); setNotice('Baixa registrada.');
      } catch (cause: unknown) {
        // a definite client error clears the retained attempt; network/5xx/408 keep the same key for a safe retry
        if (mounted.current && cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && cause.status !== 408) {
          setAttempt(null);
        }
        throw cause;
      }
      await refreshBalance();
    });
  }

  function revise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canRevise || !collectible || attempt || !reason.trim() || reason.trim().length > 500) return;
    void run(async () => {
      const data = await api<SaleBalance>(`/sales/${sale.id}/payment-schedule/revise`, { method: 'POST', body: { reason: reason.trim() } });
      if (!mounted.current) return;
      setBalance(data); setRevising(false); setReason(''); setNotice('Vencimentos revisados.');
      await refreshBalance();
    });
  }

  if (loading) return <p className="lite-muted">Carregando pagamento…</p>;
  if (loadError || !balance) {
    return (
      <section aria-label="Pagamento">
        <ErrorNote error={loadError || 'Não foi possível carregar o pagamento.'} />
        <button type="button" className="btn btn-small" onClick={() => setReload((value) => value + 1)}>Tentar novamente</button>
      </section>
    );
  }

  return (
    <section aria-label="Pagamento" aria-busy={busy}>
      <h3>Pagamento</h3>
      {error ? <p role="alert" className="lite-error">{error}</p> : null}
      <SuccessNote success={notice || null} />
      <p>
        Total {formatBRL(balance.total)} · Recebido {formatBRL(balance.received)} ·{' '}
        Saldo <strong aria-label="Saldo da venda">{formatBRL(balance.remaining)}</strong>
      </p>
      <button type="button" className="btn btn-small" disabled={busy} onClick={() => { void run(refreshBalance); }}>Atualizar saldo</button>
      {!collectible && <p className="lite-muted">Esta venda não está aberta para cobrança.</p>}
      {balance.down_payment_pending && <p className="lite-muted">Entrada pendente de quitação.</p>}
      {balance.next_due && <p className="lite-muted">Próximo vencimento: {formatDate(balance.next_due)}</p>}
      {balance.settled_at && <p className="lite-muted">Quitação: {new Date(balance.settled_at).toLocaleString('pt-BR')}</p>}

      {!balance.snapshot ? (
        <div>
          <p className="lite-muted">Nenhum cronograma aplicado.</p>
          {canCollect && collectible && conditions.length === 0 ? <p>Nenhuma condição de pagamento disponível.</p> : null}
          {canCollect && collectible && conditions.length > 0 ? (
            <form className="lite-form" onSubmit={apply}>
              <div className="field">
                <label htmlFor={`${id}-condition`}>Condição de pagamento</label>
                <select id={`${id}-condition`} required disabled={busy} value={conditionId} onChange={(event) => {
                  const selected = conditions.find((item) => item.id === event.target.value);
                  setConditionId(event.target.value); setInstallments('1'); setScheduleMethod(selected?.paymentMethods[0] ?? '');
                }}>
                  <option value="">Selecione uma condição</option>
                  {conditions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              {condition ? (
                <>
                  <div className="field">
                    <label htmlFor={`${id}-schedule-method`}>Forma de pagamento</label>
                    <select id={`${id}-schedule-method`} required disabled={busy} value={scheduleMethod} onChange={(event) => setScheduleMethod(event.target.value)}>
                      {condition.paymentMethods.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                  {condition.scheduleKind === 'EQUAL_INSTALLMENTS' ? (
                    <div className="field">
                      <label htmlFor={`${id}-installments`}>Quantidade de parcelas</label>
                      <input id={`${id}-installments`} type="number" required min={1} max={condition.maxInstallments} step={1}
                        disabled={busy} value={installments} onChange={(event) => setInstallments(event.target.value)} />
                    </div>
                  ) : null}
                </>
              ) : null}
              {previewError ? <p role="alert" className="lite-error">{previewError}</p> : null}
              {preview.length > 0 ? (
                <>
                  <p className="lite-muted">Prévia indicativa. Valores, vencimentos e aplicabilidade são validados ao aplicar.</p>
                  <div className="lite-table-wrap">
                    <table aria-label="Prévia do cronograma">
                      <thead><tr><th>Parcela</th><th className="num">Valor</th><th>Vencimento</th></tr></thead>
                      <tbody>{preview.map((item, index) => (
                        <tr key={index}><td>{kindLabels[item.kind]} {index + 1}</td><td className="num">{formatBRL(item.amount)}</td><td>{formatDate(item.dueDate)}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </>
              ) : null}
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={busy || !condition || !scheduleMethod || preview.length === 0}>Aplicar cronograma</button>
              </div>
            </form>
          ) : null}
        </div>
      ) : (
        <p><strong>{balance.snapshot.condition.name}</strong> · versão {balance.snapshot.version}</p>
      )}

      {balance.receivables.length > 0 ? (
        <div className="lite-table-wrap">
          <table aria-label="Parcelas da venda">
            <thead><tr><th>Parcela</th><th>Vencimento</th><th className="num">Valor</th><th className="num">Recebido</th><th className="num">Saldo</th><th>Status</th></tr></thead>
            <tbody>{balance.receivables.map((item, index) => (
              <tr key={item.id}>
                <td>{kindLabels[item.kind]} {index + 1}</td>
                <td>{formatDate(item.due)}</td>
                <td className="num">{formatBRL(item.amount)}</td>
                <td className="num">{formatBRL(item.paid)}</td>
                <td className="num">{formatBRL(Math.max(0, Math.round(item.amount * 100) - Math.round(item.paid * 100)) / 100)}</td>
                <td>{statusLabels[item.status] ?? 'Não informado'}{item.late ? ' · Em atraso ou paga após o prazo' : ''}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}

      {canCollect && balance.snapshot && collectible && (balance.remaining > 0 || attempt) ? (
        <form className="lite-form" onSubmit={pay} noValidate aria-label="Baixa parcial">
          <h4>Registrar baixa</h4>
          {!balance.snapshot.condition.allowsPartialPayments ? <p>Esta condição exige quitar integralmente cada parcela atingida.</p> : null}
          {attempt && !busy ? <p role="status" className="lite-muted">Confirmação pendente. Reenvie a mesma baixa para consultar ou concluir o registro.</p> : null}
          <fieldset disabled={busy || attempt !== null} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="sr-only">Dados da baixa</legend>
            <div className="field">
              <label htmlFor={`${id}-amount`}>Valor da baixa</label>
              <input id={`${id}-amount`} inputMode="decimal" required value={amount} onChange={(event) => setAmount(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-paid-date`}>Data da baixa</label>
              <input id={`${id}-paid-date`} type="date" required value={paidDate} onChange={(event) => setPaidDate(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-method`}>Forma da baixa</label>
              <select id={`${id}-method`} required value={method} onChange={(event) => setMethod(event.target.value)}>
                <option value="">Selecione a forma</option>
                {balance.snapshot.condition.paymentMethods.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-account`}>Conta financeira</label>
              <select id={`${id}-account`} required value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                <option value="">Selecione a conta</option>
                {accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
          </fieldset>
          <p className="lite-muted">A baixa é distribuída pelo vencimento das parcelas. Data considerada em Brasília.</p>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy || (balanceStale && !attempt)}>
              {busy ? 'Registrando…' : attempt ? 'Reenviar baixa' : 'Registrar baixa'}
            </button>
          </div>
        </form>
      ) : null}

      {canRevise && balance.snapshot && collectible ? (
        <div>
          <button type="button" className="btn btn-small" disabled={busy || attempt !== null} aria-expanded={revising} onClick={() => setRevising(!revising)}>Revisar condição</button>
          {revising ? (
            <form className="lite-form" onSubmit={revise} aria-label="Revisão da condição">
              <p className="lite-muted">Recalcula somente vencimentos ainda sem baixa. Mantém condição, valores e quantidade de parcelas.</p>
              <div className="field field-wide">
                <label htmlFor={`${id}-reason`}>Motivo da revisão</label>
                <textarea id={`${id}-reason`} required maxLength={500} rows={2} value={reason} disabled={busy || attempt !== null} onChange={(event) => setReason(event.target.value)} />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={busy || attempt !== null || !reason.trim()}>Confirmar revisão</button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
