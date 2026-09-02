import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { LoadingState } from '../components/ui/loading-state';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { ApiError, listCategories, type FinancialCategory } from '../lib/api';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; categories: FinancialCategory[] };

export function CategoriesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

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
        <CardHeader>
          <CardTitle>Categorias</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {state.categories.length === 0 ? (
            <EmptyState
              title="Nenhuma categoria registrada"
              description="Crie uma nova categoria para começar."
              action={<Button size="sm"><Plus className="mr-2 h-4 w-4" />Adicionar</Button>}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.categories.map((cat) => (
                    <TableRow key={cat.id}>
                      <TableCell className="font-medium">{cat.name}</TableCell>
                      <TableCell>{cat.type === 'REVENUE' ? 'Receita' : 'Despesa'}</TableCell>
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
