import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { LoadingState } from '../components/ui/loading-state';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { StatusBadge, type StatusTone } from '../components/ui/status-badge';
import { Modal } from '../components/ui/modal';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import {
  ApiError,
  listExpenses,
  listSuppliers,
  listCategories,
  createExpense,
  cancelExpense,
  type Expense,
  type Supplier,
  type FinancialCategory,
  type CreateExpenseInput,
  type ExpenseStatus,
} from '../lib/api';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      expenses: Expense[];
      suppliers: Supplier[];
      categories: FinancialCategory[];
    };

const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  OPEN: 'Aberta',
  PARTIALLY_PAID: 'Parcialmente Paga',
  PAID: 'Paga',
  CANCELLED: 'Cancelada',
};

const EXPENSE_STATUS_TONES: Record<ExpenseStatus, StatusTone> = {
  OPEN: 'attention',
  PARTIALLY_PAID: 'positive',
  PAID: 'positive',
  CANCELLED: 'inactive',
};

type ModalState = { type: 'closed' } | { type: 'create' } | { type: 'confirmCancel'; expenseId: string };

const emptyForm: CreateExpenseInput = {
  supplierId: undefined,
  categoryId: '',
  description: '',
  amount: 0,
  currency: 'BRL',
  incurredAt: '',
  dueDate: '',
  paymentMethod: undefined,
  recurrence: undefined,
  notes: undefined,
};

export function ExpensesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [filter, setFilter] = useState<'ALL' | ExpenseStatus>('ALL');
  const [modal, setModal] = useState<ModalState>({ type: 'closed' });
  const [form, setForm] = useState<CreateExpenseInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setState({ status: 'loading' });

    Promise.all([listExpenses(), listSuppliers(), listCategories()])
      .then(([expenses, suppliers, categories]) => {
        setState({
          status: 'success',
          expenses,
          suppliers,
          categories: categories.filter((c) => c.type === 'EXPENSE'),
        });
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar as despesas.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    if (!form.categoryId.trim()) {
      setFormError('Selecione uma categoria.');
      return;
    }
    if (!form.description.trim()) {
      setFormError('Informe a descrição da despesa.');
      return;
    }
    if (form.amount <= 0) {
      setFormError('O valor deve ser maior que zero.');
      return;
    }
    if (!form.dueDate) {
      setFormError('Informe a data de vencimento.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const input: CreateExpenseInput = {
        supplierId: form.supplierId || undefined,
        categoryId: form.categoryId.trim(),
        description: form.description.trim(),
        amount: form.amount,
        currency: form.currency || 'BRL',
        incurredAt: form.incurredAt,
        dueDate: form.dueDate,
        paymentMethod: form.paymentMethod?.trim() || undefined,
        recurrence: form.recurrence?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
      };
      await createExpense(input);
      setModal({ type: 'closed' });
      setForm(emptyForm);
      load();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar a despesa.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(expenseId: string) {
    setSaving(true);
    try {
      await cancelExpense(expenseId);
      setModal({ type: 'closed' });
      load();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível cancelar a despesa.');
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
        <PageHeader title="Despesas" description="Gerenciar despesas operacionais." />
        <LoadingState label="Carregando despesas…" />
      </div>
    );
  }

  const filtered = state.expenses.filter((expense) => {
    return filter === 'ALL' || expense.status === filter;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Despesas"
        description="Gerenciar despesas operacionais."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Despesas' }]}
        actions={
          <Button size="sm" onClick={() => { setModal({ type: 'create' }); setFormError(null); }}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Despesa
          </Button>
        }
      />

      {/* Status Filter */}
      <div className="flex rounded-md border border-slate-200 bg-white p-0.5">
        {(['ALL', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setFilter(opt)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === opt
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {opt === 'ALL' ? 'Todas' : EXPENSE_STATUS_LABELS[opt]}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Despesas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {state.expenses.length === 0 ? (
            <EmptyState
              title="Nenhuma despesa registrada"
              description="Crie uma nova despesa para começar."
              action={
                <Button size="sm" onClick={() => { setModal({ type: 'create' }); setFormError(null); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="font-medium">{expense.supplierName || '-'}</TableCell>
                    <TableCell>{expense.description}</TableCell>
                    <TableCell>{expense.categoryName || '-'}</TableCell>
                    <TableCell>{formatBRL(expense.amount)}</TableCell>
                    <TableCell>{formatDateBR(expense.dueDate, { assumeDateOnly: true })}</TableCell>
                    <TableCell>
                      <StatusBadge tone={EXPENSE_STATUS_TONES[expense.status]}>
                        {EXPENSE_STATUS_LABELS[expense.status]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => setModal({ type: 'confirmCancel', expenseId: expense.id })}
                        className="p-1 hover:bg-gray-100 rounded"
                        disabled={expense.status === 'CANCELLED' || saving}
                        title={expense.status === 'CANCELLED' ? 'Despesa já cancelada' : 'Cancelar despesa'}
                      >
                        <Trash2 className={`h-4 w-4 ${expense.status === 'CANCELLED' ? 'text-gray-300' : 'text-red-500'}`} />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Modal */}
      <Modal
        open={modal.type === 'create'}
        onClose={() => { setModal({ type: 'closed' }); setFormError(null); }}
        title="Nova Despesa"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setModal({ type: 'closed' }); setFormError(null); }}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={() => { void handleCreate(); }} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <p role="alert" className="rounded-md bg-red-50 p-2 text-xs text-red-700">{formError}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Fornecedor</label>
              <Select
                value={form.supplierId || ''}
                onChange={(e) => setForm({ ...form, supplierId: e.target.value || undefined })}
              >
                <option value="">Selecionar fornecedor (opcional)</option>
                {state.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Categoria *</label>
              <Select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                <option value="">Selecionar categoria</option>
                {state.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Descrição *</label>
            <Input
              placeholder="Descrição da despesa"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Valor (R$) *</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={form.amount || ''}
                onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Moeda</label>
              <Select
                value={form.currency || 'BRL'}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                <option value="BRL">BRL</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Data Incorrida</label>
              <Input
                type="date"
                value={form.incurredAt}
                onChange={(e) => setForm({ ...form, incurredAt: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Data de Vencimento *</label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Método de Pagamento</label>
              <Input
                placeholder="Ex: Débito, Crédito, Transferência"
                value={form.paymentMethod || ''}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Recorrência</label>
              <Select
                value={form.recurrence || ''}
                onChange={(e) => setForm({ ...form, recurrence: e.target.value || undefined })}
              >
                <option value="">Sem recorrência</option>
                <option value="MONTHLY">Mensal</option>
                <option value="QUARTERLY">Trimestral</option>
                <option value="ANNUAL">Anual</option>
              </Select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Observações</label>
            <Textarea
              placeholder="Notas adicionais sobre a despesa"
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      {/* Confirm Cancel Modal */}
      {modal.type === 'confirmCancel' && (
        <Modal
          open={true}
          onClose={() => setModal({ type: 'closed' })}
          title="Confirmar Cancelamento"
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModal({ type: 'closed' })}
                disabled={saving}
              >
                Manter
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:bg-red-50"
                onClick={() => { void handleCancel(modal.expenseId); }}
                disabled={saving}
              >
                {saving ? 'Cancelando…' : 'Cancelar Despesa'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            Tem certeza que deseja cancelar esta despesa? Esta ação não pode ser desfeita.
          </p>
        </Modal>
      )}
    </div>
  );
}
