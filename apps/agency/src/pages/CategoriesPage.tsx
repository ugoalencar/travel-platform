import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { LoadingState } from '../components/ui/loading-state';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { ApiError, createCategory, listCategories, type CategoryType, type FinancialCategory } from '../lib/api';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; categories: FinancialCategory[] };

export function CategoriesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<CategoryType>('EXPENSE');
  const [parentCategoryId, setParentCategoryId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    listCategories()
      .then((categories) => {
        setState({ status: 'success', categories });
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar categorias.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categoriesByType =
    state.status === 'success' ? state.categories.filter((c) => c.type === type) : [];

  const categoryName = (id?: string) =>
    (state.status === 'success' && state.categories.find((c) => c.id === id)?.name) || '-';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setFormError(null);
    createCategory({
      name: name.trim(),
      type,
      parentCategoryId: parentCategoryId || undefined,
    })
      .then(() => {
        setName('');
        setParentCategoryId('');
        setShowForm(false);
        load();
      })
      .catch((err: unknown) => {
        setFormError(err instanceof ApiError ? err.message : 'Não foi possível criar a categoria.');
      })
      .finally(() => setSaving(false));
  };

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Categorias" description="Gerenciar categorias de receitas e despesas." />
        <LoadingState label="Carregando categorias…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <ErrorState description={state.message} onRetry={load} />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorias"
        description="Gerenciar categorias de receitas e despesas."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Categorias' }]}
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Categorias</CardTitle>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" />
            {showForm ? 'Cancelar' : 'Adicionar'}
          </Button>
        </CardHeader>
        {showForm ? (
          <CardContent className="border-b pb-4">
            <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="cat-name">Nome</label>
                <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="cat-type">Tipo</label>
                <select
                  id="cat-type"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value as CategoryType);
                    setParentCategoryId('');
                  }}
                >
                  <option value="EXPENSE">Despesa</option>
                  <option value="REVENUE">Receita</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="cat-parent">Categoria pai (opcional)</label>
                <select
                  id="cat-parent"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={parentCategoryId}
                  onChange={(e) => setParentCategoryId(e.target.value)}
                >
                  <option value="">Nenhuma (categoria raiz)</option>
                  {categoriesByType.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </Button>
              {formError ? <p className="w-full text-sm text-destructive">{formError}</p> : null}
            </form>
          </CardContent>
        ) : null}
        <CardContent className="p-0">
          {state.categories.length === 0 ? (
            <EmptyState
              title="Nenhuma categoria registrada"
              description="Crie uma nova categoria para começar."
              action={<Button size="sm" onClick={() => setShowForm(true)}><Plus className="mr-2 h-4 w-4" />Adicionar</Button>}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Categoria pai</TableHead>
                  <TableHead>Descrição</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.categories.map((cat) => (
                    <TableRow key={cat.id}>
                      <TableCell className="font-medium">{cat.name}</TableCell>
                      <TableCell>{cat.type === 'REVENUE' ? 'Receita' : 'Despesa'}</TableCell>
                      <TableCell>{categoryName(cat.parentCategoryId)}</TableCell>
                      <TableCell>{cat.description || '-'}</TableCell>
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
