import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { ApiError, applySalePaymentSchedule, getSaleBalance, listPaymentConditions,
  recordSalePayment, reverseSalePayment, reviseSalePaymentSchedule } from '../../lib/api';
import { translateApiErrorMessage } from '../../lib/errorTranslation';
import { formatBRL } from '../../lib/formatCurrency';
import { formatDateBR } from '../../lib/formatDateBR';
import { parseMoneyInput } from '../../lib/parseMoneyInput';
import { previewPaymentSchedule } from '../../lib/paymentSchedule';
import type { PaymentCondition, PaymentScheduleItem, SaleBalance, SalePaymentInput } from '../../lib/paymentSchedule';
import type { Sale } from '../../types/sale';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { LoadingState } from '../ui/loading-state';
import { Select } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Textarea } from '../ui/textarea';

const kindLabels: Record<PaymentScheduleItem['kind'], string> = {
  SINGLE: 'Única', INSTALLMENT: 'Parcela', DOWN_PAYMENT: 'Entrada', BALANCE: 'Saldo',
};
const statusLabels: Record<string, string> = {
  OPEN: 'Em aberto', PARTIALLY_PAID: 'Parcialmente paga', PAID: 'Paga', CANCELLED: 'Cancelada', OVERDUE: 'Em atraso',
};

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? translateApiErrorMessage(error.message)
    : 'Não foi possível concluir a operação. Verifique sua conexão e tente novamente.';
}

export function SalePaymentPanel({ sale, onChange }: { sale: Sale; onChange?: () => void }) {
  const { user, loading } = useCurrentUser();
  const canRead = user !== null && ['MANAGER', 'ADMIN', 'OWNER'].includes(user.role);
  return <Card>
    <CardHeader><CardTitle>Pagamento</CardTitle></CardHeader>
    <CardContent>
      {loading ? <LoadingState label="Carregando permissões de pagamento…" /> : canRead
        ? <PaymentContent key={sale.id} sale={sale} canRevise={user?.role === 'ADMIN' || user?.role === 'OWNER'}
          canReverse={user !== null && ['MANAGER','ADMIN','OWNER'].includes(user.role)} onChange={onChange} />
        : <p className="text-sm text-slate-600">A consulta de pagamentos exige acesso de gerente ou administrador.</p>}
    </CardContent>
  </Card>;
}

function PaymentContent({ sale, canRevise, canReverse, onChange }: { sale: Sale; canRevise: boolean; canReverse: boolean; onChange?: (() => void) | undefined }) {
  const id = useId();
  const [balance, setBalance] = useState<SaleBalance | null>(null);
  const [conditions, setConditions] = useState<PaymentCondition[]>([]);
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
  const [attempt, setAttempt] = useState<SalePaymentInput | null>(null);
  const [revising, setRevising] = useState(false);
  const [reason, setReason] = useState('');
  const [reversingPaymentId,setReversingPaymentId]=useState('');
  const [reversalReason,setReversalReason]=useState('');

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadError('');
    getSaleBalance(sale.id)
      .then(async (data) => {
        const available = data.snapshot ? [] : await listPaymentConditions();
        if (!cancelled) { setBalance(data); setConditions(available); }
      })
      .catch((cause: unknown) => { if (!cancelled) setLoadError(errorMessage(cause)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sale.id, reload]);

  const condition = conditions.find((item) => item.id === conditionId);
  let preview: PaymentScheduleItem[] = [];
  let previewError = '';
  if (condition) {
    try {
      if (!sale.saleDate) throw new Error('Informe a data da venda antes de aplicar a condição.');
      preview = previewPaymentSchedule(condition, sale.total, Number(installments), sale.saleDate, sale.travelStartDate ?? null);
    } catch (cause: unknown) {
      previewError = cause instanceof Error ? cause.message : 'Não foi possível calcular a prévia.';
    }
  }
  const collectible = sale.status === 'PENDING' || sale.status === 'CONFIRMED';

  async function refreshBalance(): Promise<void> {
    try {
      const current = await getSaleBalance(sale.id);
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
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (cause: unknown) { if (mounted.current) setError(errorMessage(cause)); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!collectible || !condition || previewError || !scheduleMethod) return;
    void run(async () => {
      const data = await applySalePaymentSchedule(sale.id, { conditionId, installments: Number(installments), paymentMethod: scheduleMethod });
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
      payload = { amount: value, method, paid_at: `${paidDate}T00:00:00-03:00`, idempotency_key: crypto.randomUUID() };
    }
    const request = payload;
    setAttempt(request);
    void run(async () => {
      try {
        const result = await recordSalePayment(sale.id, request);
        if (!mounted.current) return;
        setAttempt(null); setAmount(''); setBalance(result.balance); setNotice('Baixa registrada.');
      } catch (cause: unknown) {
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
      const data = await reviseSalePaymentSchedule(sale.id, reason.trim());
      if (!mounted.current) return;
      setBalance(data); setRevising(false); setReason(''); setNotice('Vencimentos revisados.');
      await refreshBalance();
    });
  }

  function reverse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canReverse || !reversingPaymentId || !reversalReason.trim() || reversalReason.trim().length > 500) return;
    void run(async()=>{
      const result=await reverseSalePayment(sale.id,reversingPaymentId,reversalReason.trim());
      if(!mounted.current)return;
      setBalance(result.balance);setReversingPaymentId('');setReversalReason('');setNotice('Recebimento estornado e saldo recalculado.');
      await refreshBalance();
    });
  }

  if (loading) return <LoadingState label="Carregando pagamento…" />;
  if (loadError || !balance) return <div className="space-y-3">
    <p role="alert">{loadError || 'Não foi possível carregar o pagamento.'}</p>
    <Button variant="outline" onClick={() => setReload((value) => value + 1)}>Tentar novamente</Button>
  </div>;

  return <div className="space-y-5" aria-busy={busy}>
    {error && <p id={`${id}-error`} role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    <dl className="grid gap-4 sm:grid-cols-3">
      <div><dt className="text-sm text-slate-500">Total</dt><dd className="text-lg font-semibold">{formatBRL(balance.total)}</dd></div>
      <div><dt className="text-sm text-slate-500">Recebido</dt><dd className="text-lg font-semibold">{formatBRL(balance.received)}</dd></div>
      <div><dt className="text-sm text-slate-500">Saldo</dt><dd aria-label="Saldo da venda" className="text-lg font-semibold">{formatBRL(balance.remaining)}</dd></div>
    </dl>
    <Button size="sm" variant="outline" disabled={busy} onClick={() => { void run(refreshBalance); }}>Atualizar saldo</Button>
    {!collectible && <p className="text-sm text-slate-600">Esta venda não está aberta para cobrança.</p>}
    {balance.down_payment_pending && <p className="text-sm text-amber-700">Entrada pendente de quitação.</p>}
    {balance.next_due && <p className="text-sm">Próximo vencimento: {formatDateBR(balance.next_due, { assumeDateOnly: true })}</p>}
    {balance.settled_at && <p className="text-sm">Quitação: {formatDateBR(balance.settled_at, { includeTime: true })}</p>}

    {!balance.snapshot ? <div className="space-y-4">
      <p className="text-sm text-slate-600">Nenhum cronograma aplicado.</p>
      {conditions.length === 0 ? <p>Nenhuma condição de pagamento disponível.</p> : collectible &&
        <form onSubmit={apply} className="space-y-4">
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            <legend className="sr-only">Aplicar condição de pagamento</legend>
            <label htmlFor={`${id}-condition`} className="space-y-1 text-sm">Condição de pagamento
              <Select id={`${id}-condition`} required value={conditionId} onChange={(event) => {
                const selected = conditions.find((item) => item.id === event.target.value);
                setConditionId(event.target.value); setInstallments('1'); setScheduleMethod(selected?.paymentMethods[0] ?? '');
              }}>
                <option value="">Selecione uma condição</option>
                {conditions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </label>
            {condition && <>
              <label htmlFor={`${id}-schedule-method`} className="space-y-1 text-sm">Forma de pagamento
                <Select id={`${id}-schedule-method`} required value={scheduleMethod} onChange={(event) => setScheduleMethod(event.target.value)}>
                  {condition.paymentMethods.map((item) => <option key={item} value={item}>{item}</option>)}
                </Select>
              </label>
              {condition.scheduleKind === 'EQUAL_INSTALLMENTS' && <label htmlFor={`${id}-installments`} className="space-y-1 text-sm">Quantidade de parcelas
                <Input id={`${id}-installments`} type="number" required min={1} max={condition.maxInstallments} step={1}
                  value={installments} onChange={(event) => setInstallments(event.target.value)} />
              </label>}
            </>}
          </fieldset>
          {previewError && <p role="alert" className="text-sm text-red-700">{previewError}</p>}
          {preview.length > 0 && <>
            <p className="text-sm text-slate-500">Prévia indicativa. Valores, vencimentos e aplicabilidade serão validados ao aplicar.</p>
            <Table aria-label="Prévia do cronograma">
              <TableHeader><TableRow><TableHead>Parcela</TableHead><TableHead>Valor</TableHead><TableHead>Vencimento</TableHead></TableRow></TableHeader>
              <TableBody>{preview.map((item, index) => <TableRow key={index}>
                <TableCell>{kindLabels[item.kind]} {index + 1}</TableCell><TableCell>{formatBRL(item.amount)}</TableCell>
                <TableCell>{formatDateBR(item.dueDate, { assumeDateOnly: true })}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </>}
          <Button type="submit" disabled={busy || !condition || !scheduleMethod || preview.length === 0}>Aplicar cronograma</Button>
        </form>}
    </div> : <p className="text-sm font-medium">{balance.snapshot.condition.name} · versão {balance.snapshot.version}</p>}

    {balance.receivables.length > 0 && <Table aria-label="Parcelas da venda">
      <TableHeader><TableRow><TableHead>Parcela</TableHead><TableHead>Vencimento</TableHead><TableHead>Valor</TableHead>
        <TableHead>Recebido</TableHead><TableHead>Saldo</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
      <TableBody>{balance.receivables.map((item, index) => <TableRow key={item.id}>
        <TableCell>{kindLabels[item.kind]} {index + 1}</TableCell>
        <TableCell>{formatDateBR(item.due, { assumeDateOnly: true })}</TableCell><TableCell>{formatBRL(item.amount)}</TableCell>
        <TableCell>{formatBRL(item.paid)}</TableCell><TableCell>{formatBRL(Math.max(0, Math.round(item.amount * 100) - Math.round(item.paid * 100)) / 100)}</TableCell>
        <TableCell>{statusLabels[item.status] ?? 'Não informado'}{item.late && ' · Em atraso ou paga após o prazo'}</TableCell>
      </TableRow>)}</TableBody>
    </Table>}
    {(balance.payments?.length ?? 0)>0 && <section className="space-y-3" aria-label="Histórico de baixas">
      <h3 className="font-semibold text-slate-900">Baixas registradas</h3>
      <ul className="divide-y rounded-md border">
        {balance.payments?.map(payment=><li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
          <span>{formatDateBR(payment.paid_at,{includeTime:true})} · {payment.method??'Forma não informada'} · {formatBRL(payment.amount)}{payment.reversed?' · Estornada':''}</span>
          {canReverse&&!payment.reversed&&<Button type="button" size="sm" variant="outline" disabled={busy}
            onClick={()=>{setReversingPaymentId(payment.id);setReversalReason('');}}>Estornar</Button>}
          {canReverse&&reversingPaymentId===payment.id&&!payment.reversed&&<form onSubmit={reverse} className="w-full space-y-2">
            <label htmlFor={`${id}-reversal-reason`} className="block text-sm">Motivo obrigatório do estorno
              <Textarea id={`${id}-reversal-reason`} required maxLength={500} value={reversalReason} disabled={busy}
                onChange={event=>setReversalReason(event.target.value)} />
            </label>
            <div className="flex gap-2"><Button type="submit" disabled={busy||!reversalReason.trim()}>Confirmar estorno</Button>
              <Button type="button" variant="outline" disabled={busy} onClick={()=>setReversingPaymentId('')}>Cancelar</Button></div>
          </form>}
        </li>)}
      </ul>
    </section>}
    {balance.snapshot && collectible && (balance.remaining > 0 || attempt) && <form onSubmit={pay} noValidate className="space-y-4" aria-label="Baixa parcial">
      <h3 className="font-semibold text-slate-900">Registrar baixa</h3>
      {!balance.snapshot.condition.allowsPartialPayments && <p className="text-sm">Esta condição exige quitar integralmente cada parcela atingida.</p>}
      {attempt && !busy && <p role="status" className="text-sm">Confirmação pendente. Reenvie a mesma baixa para consultar ou concluir o registro.</p>}
      <fieldset disabled={busy || attempt !== null} className="grid gap-4 sm:grid-cols-3">
        <legend className="sr-only">Dados da baixa</legend>
        <label htmlFor={`${id}-amount`} className="space-y-1 text-sm">Valor da baixa
          <Input id={`${id}-amount`} inputMode="decimal" required value={amount} aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label htmlFor={`${id}-paid-date`} className="space-y-1 text-sm">Data da baixa
          <Input id={`${id}-paid-date`} type="date" required value={paidDate} onChange={(event) => setPaidDate(event.target.value)} />
        </label>
        <label htmlFor={`${id}-method`} className="space-y-1 text-sm">Forma da baixa
          <Select id={`${id}-method`} required value={method} onChange={(event) => setMethod(event.target.value)}>
            <option value="">Selecione a forma</option>
            {balance.snapshot.condition.paymentMethods.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </label>
      </fieldset>
      <p className="text-xs text-slate-500">A baixa será distribuída pelo vencimento das parcelas. Data considerada em Brasília.</p>
      <Button type="submit" disabled={busy || (balanceStale && !attempt)}>{busy ? 'Registrando…' : attempt ? 'Reenviar baixa' : 'Registrar baixa'}</Button>
    </form>}

    {canRevise && balance.snapshot && collectible && <div className="space-y-3">
      <Button variant="outline" disabled={busy || attempt !== null} onClick={() => setRevising(!revising)} aria-expanded={revising}>Revisar condição</Button>
      {revising && <form onSubmit={revise} className="space-y-3" aria-label="Revisão da condição">
        <p className="text-sm text-slate-600">Recalcula somente vencimentos ainda sem baixa. Mantém condição, valores e quantidade de parcelas.</p>
        <label htmlFor={`${id}-reason`} className="block space-y-1 text-sm">Motivo da revisão
          <Textarea id={`${id}-reason`} required maxLength={500} value={reason} disabled={busy || attempt !== null}
            onChange={(event) => setReason(event.target.value)} />
        </label>
        <Button type="submit" disabled={busy || attempt !== null || !reason.trim()}>Confirmar revisão</Button>
      </form>}
    </div>}
  </div>;
}
