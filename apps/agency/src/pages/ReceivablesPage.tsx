import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Search } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { StatusBadge, type StatusTone } from '../components/ui/status-badge';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import { Modal } from '../components/ui/modal';
import {
  ApiError,
  allocatePayment,
  listCustomers,
  listReceivables,
  recordPayment,
  type Receivable,
  type ReceivableStatus,
} from '../lib/api';
import type { Customer } from '../types/customer';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; receivables: Receivable[]; customers: Customer[] };

const RECEIVABLE_STATUS_LABELS: Record<ReceivableStatus, string> = {
  OPEN: 'Aberto',
  PARTIALLY_PAID: 'Parcial',
  PAID: 'Pago',
  CANCELLED: 'Cancelado',
};

const RECEIVABLE_STATUS_TONES: Record<ReceivableStatus, StatusTone> = {
  OPEN: 'neutral',
  PARTIALLY_PAID: 'attention',
  PAID: 'positive',
  CANCELLED: 'inactive',
};

const emptyPaymentForm = {
  amount: 0,
  occurredAt: new Date().toISOString().slice(0, 10),
  method: '',
  notes: '',
};

export function ReceivablesPage() {
  const [search, setSearch] = useState('');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selectedReceivable, setSelectedReceivable] = useState<Receivable | null>(null);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    Promise.all([listReceivables(), listCustomers()])
      .then(([receivables, customers]) => setState({ status: 'success', receivables, customers }))
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar as contas a receber.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === 'error') {
    return (
      <div className="space-y-6">
        <PageHeader title="Contas a Receber" description="Recebiveis de vendas e parcelas de clientes." />
        <ErrorState description={state.message} onRetry={load} />
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className="space-y-6">
        <PageHeader title="Contas a Receber" description="Recebiveis de vendas e parcelas de clientes." />
        <LoadingState label="Carregando contas a receber..." />
      </div>
    );
  }

  const customerNames = new Map(state.customers.map((customer) => [customer.id, customer.name]));
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = state.receivables.filter((receivable) => {
    const customerName = customerNames.get(receivable.customerId) ?? '';
    return (
      normalizedSearch.length === 0 ||
      receivable.description.toLowerCase().includes(normalizedSearch) ||
      customerName.toLowerCase().includes(normalizedSearch)
    );
  });

  async function handleReceivePayment() {
    if (!selectedReceivable) return;
    if (paymentForm.amount <= 0) {
      setFormError('Informe um valor recebido maior que zero.');
      return;
    }
    if (!paymentForm.occurredAt) {
      setFormError('Informe a data de recebimento.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const payment = await recordPayment({
        direction: 'IN',
        amount: paymentForm.amount,
        occurredAt: paymentForm.occurredAt,
        ...(paymentForm.method.trim() ? { method: paymentForm.method.trim() } : {}),
        ...(paymentForm.notes.trim() ? { notes: paymentForm.notes.trim() } : {}),
      });
      await allocatePayment(payment.id, [{ receivableId: selectedReceivable.id, amount: paymentForm.amount }]);
      setSelectedReceivable(null);
      setPaymentForm(emptyPaymentForm);
      load();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível registrar o recebimento.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas a Receber"
        description={`${state.receivables.length} contas registradas`}
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Financeiro', to: '/financial' }]}
        actions={
          <Link to="/financial">
            <Button size="sm" variant="outline">
              Voltar
            </Button>
          </Link>
        }
      />

      <div className="relative max-w-sm">
        <label htmlFor="receivables-search" className="sr-only">
          Buscar contas a receber
        </label>
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <Input
          id="receivables-search"
          placeholder="Buscar por cliente ou descrição"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhuma conta a receber"
          description={search ? 'Tente outro termo de busca.' : 'Nenhuma conta registrada no momento.'}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">Cliente</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">Descrição</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-700">Valor</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-700">Recebido</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-700">Saldo</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">Vencimento</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((receivable) => {
                    const customerName = customerNames.get(receivable.customerId) ?? 'Cliente não identificado';
                    return (
                      <tr key={receivable.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{customerName}</td>
                        <td className="px-4 py-3 text-slate-600">{receivable.description}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatBRL(receivable.amount)}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{formatBRL(receivable.paidAmount)}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">{formatBRL(receivable.remainingAmount)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {formatDateBR(receivable.dueAt, { assumeDateOnly: true })}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={RECEIVABLE_STATUS_TONES[receivable.status]}>
                            {RECEIVABLE_STATUS_LABELS[receivable.status]}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3">
                          {receivable.status !== 'PAID' && receivable.status !== 'CANCELLED' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedReceivable(receivable);
                                setPaymentForm({ ...emptyPaymentForm, amount: receivable.remainingAmount });
                                setFormError(null);
                              }}
                              disabled={submitting}
                              aria-label={`Registrar recebimento ${receivable.description}`}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Registrar recebimento
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Modal
        open={selectedReceivable !== null}
        onClose={() => {
          setSelectedReceivable(null);
          setFormError(null);
          setPaymentForm(emptyPaymentForm);
        }}
        title="Registrar Recebimento"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setSelectedReceivable(null)} disabled={submitting}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => { void handleReceivePayment(); }} disabled={submitting}>
              {submitting ? 'Registrando...' : 'Confirmar recebimento'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
          <div>
            <label htmlFor="received-amount" className="mb-1 block text-sm font-medium text-slate-700">Valor recebido *</label>
            <Input
              id="received-amount"
              type="number"
              min="0"
              step="0.01"
              value={paymentForm.amount || ''}
              onChange={(event) => setPaymentForm({ ...paymentForm, amount: Number(event.target.value) })}
            />
          </div>
          <div>
            <label htmlFor="received-date" className="mb-1 block text-sm font-medium text-slate-700">Data de recebimento *</label>
            <Input
              id="received-date"
              type="date"
              value={paymentForm.occurredAt}
              onChange={(event) => setPaymentForm({ ...paymentForm, occurredAt: event.target.value })}
            />
          </div>
          <div>
            <label htmlFor="received-method" className="mb-1 block text-sm font-medium text-slate-700">Método de pagamento</label>
            <Input
              id="received-method"
              value={paymentForm.method}
              onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}
              placeholder="PIX, cartão, transferência"
            />
          </div>
          <div>
            <label htmlFor="received-notes" className="mb-1 block text-sm font-medium text-slate-700">Observações</label>
            <Textarea
              id="received-notes"
              value={paymentForm.notes}
              onChange={(event) => setPaymentForm({ ...paymentForm, notes: event.target.value })}
              placeholder="Detalhes do recebimento"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
