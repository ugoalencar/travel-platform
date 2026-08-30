import { useEffect, useState } from 'react';
import { Plus, Check } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { LoadingState } from '../components/ui/loading-state';
import { EmptyState } from '../components/ui/empty-state';
import { StatusBadge } from '../components/ui/status-badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Modal } from '../components/ui/modal';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import {
  ApiError,
  listReconciliations,
  listPayments,
  createReconciliation,
  updateReconciliation,
  type Reconciliation,
  type Payment,
} from '../lib/api';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      reconciliations: Reconciliation[];
      payments: Payment[];
    };

export function ReconciliationPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    reconciliation_date: '',
    expected_amount: '',
    actual_amount: '',
    payment_id: '',
    notes: '',
  });

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading' });

    Promise.all([listReconciliations(), listPayments()])
      .then(([reconciliations, payments]) => {
        if (cancelled) return;
        setState({
          status: 'success',
          reconciliations,
          payments,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar as conciliações.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreateReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      if (!formData.reconciliation_date || !formData.expected_amount || !formData.actual_amount) {
        setFormError('Por favor, preencha todos os campos obrigatórios.');
        setIsSubmitting(false);
        return;
      }

      if (state.status !== 'success') {
        setFormError('Estado inválido.');
        setIsSubmitting(false);
        return;
      }

      await createReconciliation({
        reconciliation_date: formData.reconciliation_date,
        expected_amount: parseFloat(formData.expected_amount),
        actual_amount: parseFloat(formData.actual_amount),
        payment_id: formData.payment_id || undefined,
        notes: formData.notes || undefined,
      });

      // Reload reconciliations
      const updatedReconciliations = await listReconciliations();
      setState({
        status: 'success',
        reconciliations: updatedReconciliations,
        payments: state.payments,
      });

      // Reset form
      setFormData({
        reconciliation_date: '',
        expected_amount: '',
        actual_amount: '',
        payment_id: '',
        notes: '',
      });
      setShowModal(false);
    } catch (error: unknown) {
      const message =
        error instanceof ApiError ? error.message : 'Falha ao criar conciliação.';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkAsReconciled = async (id: string) => {
    try {
      await updateReconciliation(id, { status: 'RECONCILED' });

      if (state.status === 'success') {
        const updatedReconciliations = state.reconciliations.map((r) =>
          r.id === id ? { ...r, status: 'RECONCILED' as const } : r,
        );
        setState({
          status: 'success',
          reconciliations: updatedReconciliations,
          payments: state.payments,
        });
      }
    } catch (error: unknown) {
      const message =
        error instanceof ApiError ? error.message : 'Falha ao marcar como conciliado.';
      console.error(message);
    }
  };

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Reconciliações" description="Conciliar entradas e saídas de caixa." />
        <LoadingState label="Carregando…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div>
        <PageHeader
          title="Reconciliações"
          description="Conciliar entradas e saídas de caixa."
          breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Reconciliações' }]}
        />
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {state.message}
        </div>
      </div>
    );
  }

  const { reconciliations, payments } = state;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reconciliações"
        description="Conciliar entradas e saídas de caixa."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Reconciliações' }]}
        actions={
          <Button size="sm" onClick={() => setShowModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Conciliação
          </Button>
        }
      />

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nova Conciliação">
        <form onSubmit={(e) => void handleCreateReconciliation(e)} className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {formError}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="reconciliation_date" className="text-sm font-medium">
              Data da Conciliação *
            </label>
            <Input
              id="reconciliation_date"
              type="date"
              value={formData.reconciliation_date}
              onChange={(e) =>
                setFormData({ ...formData, reconciliation_date: e.target.value })
              }
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="expected_amount" className="text-sm font-medium">
              Valor Esperado (R$) *
            </label>
            <Input
              id="expected_amount"
              type="number"
              step="0.01"
              value={formData.expected_amount}
              onChange={(e) =>
                setFormData({ ...formData, expected_amount: e.target.value })
              }
              disabled={isSubmitting}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="actual_amount" className="text-sm font-medium">
              Valor Atual (R$) *
            </label>
            <Input
              id="actual_amount"
              type="number"
              step="0.01"
              value={formData.actual_amount}
              onChange={(e) =>
                setFormData({ ...formData, actual_amount: e.target.value })
              }
              disabled={isSubmitting}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="payment_id" className="text-sm font-medium">
              Pagamento (Opcional)
            </label>
            <Select
              id="payment_id"
              value={formData.payment_id}
              onChange={(e) =>
                setFormData({ ...formData, payment_id: e.target.value })
              }
              disabled={isSubmitting}
            >
              <option value="">Selecionar pagamento</option>
              {payments.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.description} - {formatBRL(p.amount)}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="notes" className="text-sm font-medium">
              Notas (Opcional)
            </label>
            <Input
              id="notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              disabled={isSubmitting}
              placeholder="Adicione notas sobre esta conciliação..."
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Criando...' : 'Criar Conciliação'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowModal(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>

      <Card>
        <CardHeader>
          <CardTitle>Status de Conciliação</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {reconciliations.length === 0 ? (
            <EmptyState
              title="Nenhuma conciliação"
              description="Criar conciliações para validar seus registros."
              action={
                <Button size="sm" onClick={() => setShowModal(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Esperado</TableHead>
                  <TableHead>Atual</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reconciliations.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{formatDateBR(r.reconciliationDate, { assumeDateOnly: true })}</TableCell>
                    <TableCell>{formatBRL(r.expectedAmount)}</TableCell>
                    <TableCell>{formatBRL(r.actualAmount)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={r.status === 'RECONCILED' ? 'positive' : 'attention'}>
                        {r.status === 'RECONCILED' ? 'Conciliado' : 'Não Conciliado'}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      {r.status !== 'RECONCILED' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleMarkAsReconciled(r.id)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
