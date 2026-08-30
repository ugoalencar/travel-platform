import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { LoadingState } from '../components/ui/loading-state';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { Modal } from '../components/ui/modal';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { StatusBadge, type StatusTone } from '../components/ui/status-badge';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import {
  ApiError,
  listRevenues,
  createRevenue,
  deleteRevenue,
  listRevenueCategories,
  type Revenue,
  type CreateRevenueInput,
  type RevenueStatus,
  type RevenueCategory,
} from '../lib/api';

const REVENUE_STATUS_LABELS: Record<RevenueStatus, string> = {
  OPEN: 'Aberto',
  PARTIALLY_PAID: 'Parcialmente Pago',
  PAID: 'Pago',
  OVERDUE: 'Vencido',
  CANCELLED: 'Cancelado',
};

const REVENUE_STATUS_TONES: Record<RevenueStatus, StatusTone> = {
  OPEN: 'attention',
  PARTIALLY_PAID: 'warning',
  PAID: 'positive',
  OVERDUE: 'critical',
  CANCELLED: 'inactive',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; revenues: Revenue[] };

const emptyForm: CreateRevenueInput = {
  description: '',
  category_id: '',
  amount: 0,
  currency: 'BRL',
  competency_date: '',
  due_date: '',
  receipt_date: '',
  payment_method: '',
  status: 'OPEN',
};

export function RevenuesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showNewRevenue, setShowNewRevenue] = useState(false);
  const [form, setForm] = useState<CreateRevenueInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<RevenueCategory[]>([]);
  const [filterStatus, setFilterStatus] = useState<RevenueStatus | 'ALL'>('ALL');
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: 'loading' });

    Promise.all([listRevenues(), listRevenueCategories()])
      .then(([revenues, cats]) => {
        setState({ status: 'success', revenues });
        setCategories(cats);
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar as receitas.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    if (!form.description.trim()) {
      setFormError('Informe a descrição da receita.');
      return;
    }
    if (form.amount <= 0) {
      setFormError('O valor deve ser maior que zero.');
      return;
    }
    if (!form.due_date) {
      setFormError('Informe a data de vencimento.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const input: CreateRevenueInput = {
        description: form.description.trim(),
        amount: form.amount,
        currency: form.currency || 'BRL',
        due_date: form.due_date,
        ...(form.category_id ? { category_id: form.category_id } : {}),
        ...(form.competency_date ? { competency_date: form.competency_date } : {}),
        ...(form.receipt_date ? { receipt_date: form.receipt_date } : {}),
        ...(form.payment_method?.trim() ? { payment_method: form.payment_method.trim() } : {}),
        ...(form.status ? { status: form.status } : {}),
      };
      await createRevenue(input);
      setShowNewRevenue(false);
      setForm(emptyForm);
      load();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar a receita.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Tem certeza que deseja deletar esta receita?')) {
      return;
    }

    setDeleting(id);
    try {
      await deleteRevenue(id);
      load();
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível deletar a receita.';
      setFormError(message);
    } finally {
      setDeleting(null);
    }
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  const revenues = state.status === 'success' ? state.revenues : null;
  const filteredRevenues = revenues
    ? filterStatus === 'ALL'
      ? revenues
      : revenues.filter((r) => r.status === filterStatus)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receitas"
        description="Gerenciar receitas de vendas e serviços."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Receitas' }]}
        actions={
          <Button size="sm" onClick={() => setShowNewRevenue(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Receita
          </Button>
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>Receitas</CardTitle>
          {revenues && revenues.length > 0 && (
            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as RevenueStatus | 'ALL')}
              className="w-48"
            >
              <option value="ALL">Todos os status</option>
              {(Object.entries(REVENUE_STATUS_LABELS) as Array<[RevenueStatus, string]>).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </Select>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {state.status === 'loading' && <LoadingState label="Carregando receitas…" />}

          {filteredRevenues && (
            filteredRevenues.length === 0 ? (
              <EmptyState
                title="Nenhuma receita registrada"
                description="Crie uma nova receita para começar."
                action={
                  <Button size="sm" onClick={() => setShowNewRevenue(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Recebimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRevenues.map((revenue) => (
                    <TableRow key={revenue.id}>
                      <TableCell className="font-medium">{revenue.description}</TableCell>
                      <TableCell>{formatBRL(revenue.amount)}</TableCell>
                      <TableCell>
                        {formatDateBR(revenue.dueDate, { assumeDateOnly: true })}
                      </TableCell>
                      <TableCell>
                        {revenue.receiptDate
                          ? formatDateBR(revenue.receiptDate, { assumeDateOnly: true })
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={REVENUE_STATUS_TONES[revenue.status]}>
                          {REVENUE_STATUS_LABELS[revenue.status]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleDelete(revenue.id)}
                          disabled={deleting === revenue.id}
                          className="p-1 hover:bg-gray-100 rounded disabled:opacity-50"
                          aria-label="Deletar receita"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}
        </CardContent>
      </Card>

      <Modal
        open={showNewRevenue}
        onClose={() => {
          setShowNewRevenue(false);
          setForm(emptyForm);
          setFormError(null);
        }}
        title="Nova Receita"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Descrição *
            </label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ex: Venda de pacote turístico"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Categoria
              </label>
              <Select
                value={form.category_id || ''}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">Selecione uma categoria</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Moeda
              </label>
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

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Valor (R$) *
            </label>
            <Input
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              placeholder="0,00"
              min="0"
              step="0.01"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Data de Competência
              </label>
              <Input
                type="date"
                value={form.competency_date || ''}
                onChange={(e) => setForm({ ...form, competency_date: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Data de Vencimento *
              </label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Data de Recebimento
              </label>
              <Input
                type="date"
                value={form.receipt_date || ''}
                onChange={(e) => setForm({ ...form, receipt_date: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Método de Pagamento
              </label>
              <Input
                value={form.payment_method || ''}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                placeholder="Ex: Transferência, Cartão"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Status
            </label>
            <Select
              value={form.status || 'OPEN'}
              onChange={(e) => setForm({ ...form, status: e.target.value as RevenueStatus })}
            >
              {(Object.entries(REVENUE_STATUS_LABELS) as Array<[RevenueStatus, string]>).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </Select>
          </div>

          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {formError}
            </div>
          )}
        </div>
        <div className="flex gap-3 justify-end border-t border-slate-200 p-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowNewRevenue(false);
              setForm(emptyForm);
              setFormError(null);
            }}
            disabled={saving}
          >
            Cancelar
          </Button>
          {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
          <Button size="sm" onClick={handleCreate} disabled={saving}>
            {saving ? 'Salvando…' : 'Criar'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
