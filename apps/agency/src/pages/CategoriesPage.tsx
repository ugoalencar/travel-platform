import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { LoadingState } from '../components/ui/loading-state';
import { EmptyState } from '../components/ui/empty-state';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; categories: any[] };

export function CategoriesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    setTimeout(() => {
      setState({ status: 'success', categories: [] });
    }, 500);
  }, []);

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
      <div className="space-y-6">
        <PageHeader
          title="Categorias"
          description="Gerenciar categorias de receitas e despesas."
          breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Categorias' }]}
        />
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-red-600">{state.message}</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorias"
        description="Gerenciar categorias de receitas e despesas."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Categorias' }]}
        actions={<Button size="sm"><Plus className="mr-2 h-4 w-4" />Nova Categoria</Button>}
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
                {state.categories.map((cat: any) => (
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
