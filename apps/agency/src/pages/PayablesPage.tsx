import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import { Modal } from '../components/ui/modal';
import { StatusBadge, type StatusTone } from '../components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import {
  ApiError,
  allocatePayment,
  createPayable,
  listPayables,
  listSuppliers,
  recordPayment,
  type CreatePayableInput,
  type Payable,
  type PayableStatus,
  type Supplier,
} from '../lib/api';

type VisibleStatus = PayableStatus | 'OVERDUE';
type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; payables: Payable[]; suppliers: Supplier[] };
type ModalState = { type: 'closed' } | { type: 'create' } | { type: 'pay'; payable: Payable };

const PAYABLE_STATUS_LABELS: Record<VisibleStatus, string> = {
  OPEN: 'Aberto',
  PARTIALLY_PAID: 'Parcial',
  PAID: 'Pago',
  OVERDUE: 'Vencido',
  CANCELLED: 'Cancelado',
};

const PAYABLE_STATUS_TONES: Record<VisibleStatus, StatusTone> = {
  OPEN: 'neutral',
  PARTIALLY_PAID: 'attention',
  PAID: 'positive',
  OVERDUE: 'attention',
  CANCELLED: 'inactive',
};

const emptyPayableForm: CreatePayableInput = {
  supplierId: undefined,
  description: '',
  amount: 0,
  dueAt: '',
};

const emptyPaymentForm = {
  amount: 0,
  occurredAt: new Date().toISOString().slice(0, 10),
  method: '',
  notes: '',
};

export function PayablesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [statusFilter, setStatusFilter] = useState<'ALL' | VisibleStatus>('ALL');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<ModalState>({ type: 'closed' });
  const [payableForm, setPayableForm] = useState<CreatePayableInput>(emptyPayableForm);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    Promise.all([listPayables(), listSuppliers()])
      .then(([payables, suppliers]) => setState({ status: 'success', payables, suppliers }))
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar as contas a pagar.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const supplierNames = useMemo(() => {
    if (state.status !== 'success') return new Map<string, string>();
    return new Map(state.suppliers.map((supplier) => [supplier.id, supplier.name]));
  }, [state]);

  async function handleCreate() {
    if (!payableForm.description.trim()) {
      setFormError('Informe a descrição da conta.');
      return;
    }
    if (payableForm.amount <= 0) {
      setFormError('O valor deve ser maior que zero.');
      return;
    }
    if (!payableForm.dueAt) {
      setFormError('Informe o vencimento.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await createPayable({
        supplierId: payableForm.supplierId || undefined,
        description: payableForm.description.trim(),
        amount: payableForm.amount,
        dueAt: payableForm.dueAt,
      });
      setModal({ type: 'closed' });
      setPayableForm(emptyPayableForm);
      load();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar a conta a pagar.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePay() {
    if (modal.type !== 'pay') return;
    if (paymentForm.amount <= 0) {
      setFormError('Informe um valor pago maior que zero.');
      return;
    }
    if (!paymentForm.occurredAt) {
      setFormError('Informe a data de pagamento.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payment = await recordPayment({
        direction: 'OUT',
        amount: paymentForm.amount,
        occurredAt: paymentForm.occurredAt,
        ...(paymentForm.method.trim() ? { method: paymentForm.method.trim() } : {}),
        ...(paymentForm.notes.trim() ? { notes: paymentForm.notes.trim() } : {}),
      });
      await allocatePayment(payment.id, [{ payableId: modal.payable.id, amount: paymentForm.amount }]);
      setModal({ type: 'closed' });
      setPaymentForm(emptyPaymentForm);
      load();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível registrar o pagamento.');
    } finally {
      setSaving(false);
    }
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Contas a Pagar" description="Obrigações com fornecedores e custos vinculados." />
        <LoadingState label="Carregando contas a pagar..." />
      </div>
    );
  }

  const filtered = state.payables.filter((payable) => {
    const visibleStatus = getVisibleStatus(payable);
    const supplierName = payable.supplierId ? supplierNames.get(payable.supplierId) ?? '' : '';
    const matchesStatus = statusFilter === 'ALL' || visibleStatus === statusFilter;
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery =
      normalizedQuery.length === 0 ||
      payable.description.toLowerCase().includes(normalizedQuery) ||
      supplierName.toLowerCase().includes(normalizedQuery);
    return matchesStatus && matchesQuery;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas a Pagar"
        description="Controle vencimentos, fornecedores e baixas por pagamento."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Financeiro', to: '/financial' }, { label: 'Contas a Pagar' }]}
        actions={
          <Button size="sm" onClick={() => { setModal({ type: 'create' }); setFormError(null); }}>
            <Plus className="h-4 w-4" />
            Nova Conta a Pagar
          </Button>
        }
      />

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <label htmlFor="payables-search" className="sr-only">Buscar contas a pagar</label>
          <Input
            id="payables-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por fornecedor ou descrição"
            className="max-w-md"
          />
        </div>
        <Select
          aria-label="Filtrar por status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'ALL' | VisibleStatus)}
          className="sm:w-52"
        >
          <option value="ALL">Todos os status</option>
          {Object.entries(PAYABLE_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Obrigações</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {state.payables.length === 0 ? (
            <EmptyState
              title="Nenhuma conta a pagar registrada"
              description="Crie uma obrigação para acompanhar vencimentos e pagamentos."
              action={
                <Button size="sm" onClick={() => { setModal({ type: 'create' }); setFormError(null); }}>
                  <Plus className="h-4 w-4" />
                  Adicionar
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState title="Nenhum resultado" description="Ajuste os filtros para encontrar outras contas." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Data de pagamento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((payable) => {
                  const visibleStatus = getVisibleStatus(payable);
                  const supplierName = payable.supplierId ? supplierNames.get(payable.supplierId) : undefined;
                  return (
                    <TableRow key={payable.id}>
                      <TableCell className="font-medium">{supplierName ?? 'Sem fornecedor'}</TableCell>
                      <TableCell className="max-w-xs break-words">{payable.description}</TableCell>
                      <TableCell>{formatBRL(payable.amount)}</TableCell>
                      <TableCell>{formatDateBR(payable.dueAt, { assumeDateOnly: true })}</TableCell>
                      <TableCell>{payable.status === 'PAID' ? 'Registrada no caixa' : '-'}</TableCell>
                      <TableCell>
                        <StatusBadge tone={PAYABLE_STATUS_TONES[visibleStatus]}>
                          {PAYABLE_STATUS_LABELS[visibleStatus]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setModal({ type: 'pay', payable });
                            setPaymentForm({
                              ...emptyPaymentForm,
                              amount: payable.amount,
                            });
                            setFormError(null);
                          }}
                          disabled={payable.status === 'PAID' || payable.status === 'CANCELLED' || saving}
                          aria-label={`Registrar pagamento ${payable.description}`}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Registrar pagamento
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal
        open={modal.type === 'create'}
        onClose={() => {
          setModal({ type: 'closed' });
          setFormError(null);
          setPayableForm(emptyPayableForm);
        }}
        title="Nova Conta a Pagar"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setModal({ type: 'closed' })} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => { void handleCreate(); }} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
          <div>
            <label htmlFor="payable-supplier" className="mb-1 block text-sm font-medium text-slate-700">Fornecedor</label>
            <Select
              id="payable-supplier"
              value={payableForm.supplierId ?? ''}
              onChange={(event) => setPayableForm({ ...payableForm, supplierId: event.target.value || undefined })}
            >
              <option value="">Sem fornecedor</option>
              {state.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="payable-description" className="mb-1 block text-sm font-medium text-slate-700">Descrição *</label>
            <Input
              id="payable-description"
              value={payableForm.description}
              onChange={(event) => setPayableForm({ ...payableForm, description: event.target.value })}
              placeholder="Ex: Comissão de hotel"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="payable-amount" className="mb-1 block text-sm font-medium text-slate-700">Valor (R$) *</label>
              <Input
                id="payable-amount"
                type="number"
                min="0"
                step="0.01"
                value={payableForm.amount || ''}
                onChange={(event) => setPayableForm({ ...payableForm, amount: Number(event.target.value) })}
              />
            </div>
            <div>
              <label htmlFor="payable-due" className="mb-1 block text-sm font-medium text-slate-700">Vencimento *</label>
              <Input
                id="payable-due"
                type="date"
                value={payableForm.dueAt}
                onChange={(event) => setPayableForm({ ...payableForm, dueAt: event.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="payable-method-preview" className="mb-1 block text-sm font-medium text-slate-700">Método de pagamento</label>
              <Input id="payable-method-preview" value="" placeholder="Definido ao registrar pagamento" disabled />
            </div>
            <div>
              <label htmlFor="payable-notes-preview" className="mb-1 block text-sm font-medium text-slate-700">Observações</label>
              <Input id="payable-notes-preview" value="" placeholder="Definidas ao registrar pagamento" disabled />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={modal.type === 'pay'}
        onClose={() => {
          setModal({ type: 'closed' });
          setFormError(null);
          setPaymentForm(emptyPaymentForm);
        }}
        title="Registrar Pagamento"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setModal({ type: 'closed' })} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => { void handlePay(); }} disabled={saving}>
              {saving ? 'Registrando...' : 'Confirmar pagamento'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
          <div>
            <label htmlFor="payment-amount" className="mb-1 block text-sm font-medium text-slate-700">Valor pago *</label>
            <Input
              id="payment-amount"
              type="number"
              min="0"
              step="0.01"
              value={paymentForm.amount || ''}
              onChange={(event) => setPaymentForm({ ...paymentForm, amount: Number(event.target.value) })}
            />
          </div>
          <div>
            <label htmlFor="payment-date" className="mb-1 block text-sm font-medium text-slate-700">Data de pagamento *</label>
            <Input
              id="payment-date"
              type="date"
              value={paymentForm.occurredAt}
              onChange={(event) => setPaymentForm({ ...paymentForm, occurredAt: event.target.value })}
            />
          </div>
          <div>
            <label htmlFor="payment-method" className="mb-1 block text-sm font-medium text-slate-700">Método de pagamento</label>
            <Input
              id="payment-method"
              value={paymentForm.method}
              onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}
              placeholder="PIX, boleto, transferência"
            />
          </div>
          <div>
            <label htmlFor="payment-notes" className="mb-1 block text-sm font-medium text-slate-700">Observações</label>
            <Textarea
              id="payment-notes"
              value={paymentForm.notes}
              onChange={(event) => setPaymentForm({ ...paymentForm, notes: event.target.value })}
              placeholder="Detalhes do pagamento"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function getVisibleStatus(payable: Payable): VisibleStatus {
  if (payable.status === 'OPEN' && isPastDate(payable.dueAt)) {
    return 'OVERDUE';
  }
  return payable.status;
}

function isPastDate(value: string): boolean {
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}
