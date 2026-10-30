import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { LoadingState } from '../components/ui/loading-state';
import { ErrorState } from '../components/ui/error-state';
import {
  ApiError,
  createSaleCategory,
  getSaleCategoryForm,
  listSaleCategories,
  saveSaleCategoryForm,
  updateSaleCategory,
  type SaleCategory,
  type SaleCategoryFormField,
} from '../lib/api';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; categories: SaleCategory[] };

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function FormProfileEditor({ category, onClose }: { category: SaleCategory; onClose: () => void }) {
  const [fields, setFields] = useState<SaleCategoryFormField[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSaleCategoryForm(category.id)
      .then((form) => {
        if (!cancelled) setFields(form.fields);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(messageOf(err, 'Não foi possível carregar o formulário.'));
      });
    return () => {
      cancelled = true;
    };
  }, [category.id]);

  function toggle(key: string, change: 'enabled' | 'required') {
    setNotice(null);
    setFields((current) =>
      (current ?? []).map((field) => {
        if (field.fieldKey !== key) return field;
        if (change === 'enabled') {
          const enabled = !field.enabled;
          return { ...field, enabled, required: enabled ? field.required : false };
        }
        return { ...field, required: field.enabled ? !field.required : false };
      }),
    );
  }

  async function save() {
    if (fields === null) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await saveSaleCategoryForm(
        category.id,
        fields
          .filter((field) => !field.locked)
          .map((field) => ({ fieldKey: field.fieldKey, enabled: field.enabled, required: field.required })),
      );
      setFields(saved.fields);
      setNotice('Formulário salvo. Vendas já registradas mantêm o formulário com que foram feitas.');
    } catch (err: unknown) {
      setError(messageOf(err, 'Não foi possível salvar o formulário.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Formulário de venda — {category.name}</CardTitle>
        <Button size="sm" variant="outline" onClick={onClose}>Fechar</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">
          Marque os campos que a venda desta categoria deve mostrar e quais são obrigatórios. Campos desabilitados
          não aparecem na venda e são recusados pelo servidor.
        </p>
        {fields === null && error === null && <LoadingState label="Carregando formulário…" />}
        {fields !== null && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Campo</th>
                  <th className="px-3 py-2">Grupo</th>
                  <th className="px-3 py-2">Habilitado</th>
                  <th className="px-3 py-2">Obrigatório</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <tr key={field.fieldKey} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-medium text-slate-900">{field.label}</td>
                    <td className="px-3 py-2 text-slate-500">{field.group}</td>
                    {field.locked ? (
                      <td colSpan={2} className="px-3 py-2 text-xs text-slate-500">
                        <Lock className="mr-1 inline h-3 w-3" aria-hidden="true" />
                        Campo fixo da venda
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label={`Habilitado: ${field.label}`}
                            checked={field.enabled}
                            onChange={() => toggle(field.fieldKey, 'enabled')}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label={`Obrigatório: ${field.label}`}
                            checked={field.required}
                            disabled={!field.enabled}
                            onChange={() => toggle(field.fieldKey, 'required')}
                          />
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error !== null && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {notice !== null && <p role="status" className="text-sm text-green-700">{notice}</p>}
        <Button onClick={() => void save()} disabled={fields === null || saving}>
          {saving ? 'Salvando…' : 'Salvar formulário'}
        </Button>
      </CardContent>
    </Card>
  );
}

export function SaleCategoriesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [name, setName] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SaleCategory | null>(null);

  const load = useCallback(() => {
    listSaleCategories(true)
      .then((categories) => setState({ status: 'ready', categories }))
      .catch((err: unknown) =>
        setState({ status: 'error', message: messageOf(err, 'Não foi possível carregar as categorias.') }),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setActionError(null);
    try {
      await createSaleCategory({ name: name.trim() });
      setName('');
      load();
    } catch (err: unknown) {
      setActionError(messageOf(err, 'Não foi possível criar a categoria.'));
    }
  }

  async function setActive(category: SaleCategory, active: boolean) {
    setActionError(null);
    try {
      await updateSaleCategory(category.id, { active });
      load();
    } catch (err: unknown) {
      setActionError(messageOf(err, 'Não foi possível atualizar a categoria.'));
    }
  }

  if (state.status === 'loading') return <LoadingState label="Carregando categorias…" />;
  if (state.status === 'error') return <ErrorState description={state.message} onRetry={load} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorias de venda"
        description="Defina as categorias (aéreo, terrestre, cruzeiro…) e quais campos cada uma pede na venda."
        breadcrumbs={[{ label: 'Cadastros' }, { label: 'Categorias de venda' }]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Categorias</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={(event) => void handleCreate(event)} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="sale-category-name" className="text-xs font-medium text-slate-700">Nome da categoria</label>
              <Input id="sale-category-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button type="submit" size="sm" disabled={name.trim() === ''}>Adicionar categoria</Button>
          </form>
          {actionError !== null && <p role="alert" className="text-sm text-red-600">{actionError}</p>}
          {state.categories.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma categoria cadastrada.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {state.categories.map((category) => (
                <li key={category.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className={category.active ? 'font-medium text-slate-900' : 'font-medium text-slate-400'}>
                    {category.name}
                    {category.active ? '' : ' (inativa)'}
                  </span>
                  <span className="flex gap-2">
                    <Button size="sm" variant="outline" aria-label={`Configurar formulário de ${category.name}`} onClick={() => setEditing(category)}>
                      Configurar formulário
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`${category.active ? 'Desativar' : 'Ativar'} ${category.name}`}
                      onClick={() => void setActive(category, !category.active)}
                    >
                      {category.active ? 'Desativar' : 'Ativar'}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {editing !== null && <FormProfileEditor key={editing.id} category={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
