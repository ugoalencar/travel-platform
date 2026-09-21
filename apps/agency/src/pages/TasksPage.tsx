import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { LoadingState } from '../components/ui/loading-state';
import { EmptyState } from '../components/ui/empty-state';
import { useCurrentUser } from '../hooks/useCurrentUser';
import {
  ApiError,
  listTasks,
  updateTask,
  type CommercialTask,
  type CommercialTaskType,
  type TaskFilters,
} from '../lib/api';

// Primeira UI para commercial_tasks -- o backend (RBAC, RLS, CRUD) já
// existia e estava 100% pronto, mas não tinha nenhuma tela (ver
// docs/product/TASKS_FOLLOWUP_AUDIT.md). Não introduz schema novo.
// Criação/edição vivem em TaskFormPage.tsx (rotas /tasks/new, /tasks/:id/edit).

const TYPE_LABELS: Record<CommercialTaskType, string> = {
  FOLLOW_UP: 'Follow-up',
  CALL: 'Ligação',
  POST_SALE: 'Pós-venda',
  OTHER: 'Outro',
};

type ScopeFilter = 'mine' | 'all';
type StatusFilter = 'pending' | 'completed' | 'all';
type WhenFilter = 'all' | 'overdue' | 'today' | 'upcoming';

function startOfDayIso(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfDayIso(date: Date): string {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export function TasksPage() {
  const { user } = useCurrentUser();
  const [tasks, setTasks] = useState<CommercialTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [scope, setScope] = useState<ScopeFilter>('mine');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [when, setWhen] = useState<WhenFilter>('all');

  const load = useCallback(() => {
    const filters: TaskFilters = {};
    if (scope === 'mine' && user) filters.assignedUserId = user.userId;
    if (statusFilter === 'pending') filters.pending = true;
    if (statusFilter === 'completed') filters.pending = false;
    if (when === 'overdue') filters.overdue = true;
    if (when === 'today') {
      const now = new Date();
      filters.dueFrom = startOfDayIso(now);
      filters.dueTo = endOfDayIso(now);
    }
    if (when === 'upcoming') {
      const now = new Date();
      const in7 = new Date(now);
      in7.setDate(in7.getDate() + 7);
      filters.dueFrom = startOfDayIso(now);
      filters.dueTo = endOfDayIso(in7);
    }
    listTasks(filters)
      .then((res) => setTasks(res.tasks))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as tarefas.'));
  }, [scope, statusFilter, when, user]);

  useEffect(() => {
    load();
  }, [load]);

  function handleComplete(task: CommercialTask) {
    updateTask(task.id, { completedAt: new Date().toISOString() })
      .then(load)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Não foi possível concluir a tarefa.'));
  }

  function handleReopen(task: CommercialTask) {
    updateTask(task.id, { completedAt: null })
      .then(load)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Não foi possível reabrir a tarefa.'));
  }

  const now = Date.now();
  const overdueCount = useMemo(
    () => (tasks ?? []).filter((t) => !t.completedAt && new Date(t.dueAt).getTime() < now).length,
    [tasks, now],
  );
  const todayCount = useMemo(
    () =>
      (tasks ?? []).filter((t) => {
        if (t.completedAt) return false;
        const due = new Date(t.dueAt);
        const n = new Date();
        return due.toDateString() === n.toDateString();
      }).length,
    [tasks],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tarefas"
        description="Follow-ups, ligações e pendências comerciais atribuídas a você ou à equipe."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Tarefas' }]}
        actions={
          <Link to="/tasks/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Nova tarefa
            </Button>
          </Link>
        }
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Atrasadas" value={overdueCount} tone="red" />
        <SummaryCard label="Hoje" value={todayCount} tone="blue" />
        <SummaryCard label="Total listado" value={tasks?.length ?? '—'} tone="slate" />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Lista de tarefas</CardTitle>
          <div className="flex flex-wrap gap-2">
            <FilterSelect value={scope} onChange={(v) => setScope(v as ScopeFilter)}>
              <option value="mine">Minhas tarefas</option>
              <option value="all">Toda a equipe</option>
            </FilterSelect>
            <FilterSelect value={statusFilter} onChange={(v) => setStatusFilter(v as StatusFilter)}>
              <option value="pending">Pendentes</option>
              <option value="completed">Concluídas</option>
              <option value="all">Todas</option>
            </FilterSelect>
            <FilterSelect value={when} onChange={(v) => setWhen(v as WhenFilter)}>
              <option value="all">Qualquer data</option>
              <option value="overdue">Atrasadas</option>
              <option value="today">Hoje</option>
              <option value="upcoming">Próximos 7 dias</option>
            </FilterSelect>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!tasks ? (
            <LoadingState label="Carregando tarefas…" />
          ) : tasks.length === 0 ? (
            <EmptyState title="Nenhuma tarefa encontrada" description="Ajuste os filtros ou crie uma nova tarefa." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-600">
                  <th className="px-6 py-2">Título</th>
                  <th className="px-6 py-2">Cliente</th>
                  <th className="px-6 py-2">Tipo</th>
                  <th className="px-6 py-2">Vencimento</th>
                  <th className="px-6 py-2">Status</th>
                  <th className="px-6 py-2" />
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const overdue = !task.completedAt && new Date(task.dueAt).getTime() < now;
                  return (
                    <tr key={task.id} className="border-b">
                      <td className="px-6 py-2 font-medium">{task.title}</td>
                      <td className="px-6 py-2">{task.customerName ?? task.customerId}</td>
                      <td className="px-6 py-2">{TYPE_LABELS[task.type]}</td>
                      <td className={`px-6 py-2 ${overdue ? 'font-medium text-red-600' : ''}`}>
                        {new Date(task.dueAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-6 py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            task.completedAt
                              ? 'bg-green-100 text-green-700'
                              : overdue
                                ? 'bg-red-100 text-red-700'
                                : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {task.completedAt ? 'Concluída' : overdue ? 'Atrasada' : 'Pendente'}
                        </span>
                      </td>
                      <td className="px-6 py-2 text-right">
                        {task.completedAt ? (
                          <Button size="sm" variant="outline" onClick={() => handleReopen(task)}>
                            Reabrir
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => handleComplete(task)}>
                            Concluir
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number | string; tone: 'red' | 'blue' | 'slate' }) {
  const toneClass = tone === 'red' ? 'text-red-600' : tone === 'blue' ? 'text-blue-600' : 'text-slate-900';
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {children}
    </select>
  );
}
