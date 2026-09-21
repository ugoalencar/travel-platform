import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import {
  ApiError,
  getTask,
  createTask,
  updateTask,
  listCustomers,
  type CommercialTaskType,
  type CreateTaskInput,
} from '../lib/api';
import type { Customer } from '../types/customer';
import { useCurrentUser } from '../hooks/useCurrentUser';

const TYPE_OPTIONS: { value: CommercialTaskType; label: string }[] = [
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'CALL', label: 'Ligação' },
  { value: 'POST_SALE', label: 'Pós-venda' },
  { value: 'OTHER', label: 'Outro' },
];

interface FormData {
  title: string;
  type: CommercialTaskType;
  customerId: string;
  dueAt: string;
  notes: string;
}

const emptyForm: FormData = {
  title: '',
  type: 'FOLLOW_UP',
  customerId: '',
  dueAt: '',
  notes: '',
};

export function TaskFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user } = useCurrentUser();

  const [form, setForm] = useState<FormData>(emptyForm);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load customers for the dropdown
  useEffect(() => {
    listCustomers()
      .then((c) => setCustomers(c.filter((cu) => cu.status === 'ACTIVE')))
      .catch(() => undefined);
  }, []);

  // Load existing task for edit mode
  useEffect(() => {
    if (!isEdit || !id) return;
    let cancelled = false;
    getTask(id)
      .then((task) => {
        if (cancelled) return;
        setForm({
          title: task.title,
          type: task.type,
          customerId: task.customerId,
          dueAt: task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 16) : '',
          notes: task.notes ?? '',
        });
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Erro ao carregar tarefa.');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, isEdit]);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Título é obrigatório.');
      return;
    }
    if (!form.customerId) {
      setError('Selecione um cliente.');
      return;
    }
    if (!form.dueAt) {
      setError('Informe a data de vencimento.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isEdit && id) {
        await updateTask(id, {
          title: form.title.trim(),
          dueAt: new Date(form.dueAt).toISOString(),
          notes: form.notes.trim() || null,
        });
        void navigate('/tasks');
      } else {
        if (!user) {
          setError('Sessão inválida. Recarregue a página e tente novamente.');
          return;
        }
        // POST /commercial/tasks exige assignedUserId não-vazio -- atribui
        // ao usuário atual por padrão (autoatribuição, sem tela de
        // seleção de responsável nesta primeira versão).
        const input: CreateTaskInput = {
          customerId: form.customerId,
          assignedUserId: user.userId,
          type: form.type,
          title: form.title.trim(),
          dueAt: new Date(form.dueAt).toISOString(),
          notes: form.notes.trim() || undefined,
        };
        await createTask(input);
        void navigate('/tasks');
      }
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Erro ao salvar tarefa.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [form, id, isEdit, navigate, user]);

  if (loading) return <LoadingState />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/tasks" className="rounded-lg p-2 hover:bg-slate-100 transition-colors">
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isEdit ? 'Editar Tarefa' : 'Nova Tarefa'}
          </h1>
          <p className="text-sm text-slate-500">
            {isEdit ? 'Atualize os dados da tarefa.' : 'Crie uma nova tarefa operacional.'}
          </p>
        </div>
      </div>

      {error && <ErrorState description={error} />}

      {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Detalhes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">Título *</span>
              <Input
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder="Ex: Ligar para Maria sobre proposta Cancún"
                required
              />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">Tipo</span>
                <select
                  value={form.type}
                  onChange={(e) => update('type', e.target.value as CommercialTaskType)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">Cliente *</span>
                <select
                  value={form.customerId}
                  onChange={(e) => update('customerId', e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
                  required
                >
                  <option value="">Selecione...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">Vencimento *</span>
              <Input
                type="datetime-local"
                value={form.dueAt}
                onChange={(e) => update('dueAt', e.target.value)}
                required
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">Observações</span>
              <Textarea
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="Detalhes adicionais..."
                rows={3}
              />
            </label>
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Link to="/tasks" className="text-sm font-medium text-slate-600 hover:underline">
            Cancelar
          </Link>
          <Button type="submit" disabled={saving}>
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar Tarefa'}
          </Button>
        </div>
      </form>
    </div>
  );
}
