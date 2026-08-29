import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { LoadingState } from '../components/ui/loading-state';
import { EmptyState } from '../components/ui/empty-state';
import { StatusBadge } from '../components/ui/status-badge';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; expenses: any[] };

export function ExpensesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    setTimeout(() => {
      setState({ status: 'success', expenses: [] });
    }, 500);
  }, []);

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Despesas" description="Gerenciar despesas operacionais." />
        <LoadingState label="Carregando despesas…" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Despesas"
        description="Gerenciar despesas operacionais."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Despesas' }]}
        actions={<Button size="sm"><Plus className="mr-2 h-4 w-4" />Nova Despesa</Button>}
      />
      <Card>
        <CardHeader>
          <CardTitle>Despesas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {state.expenses.length === 0 ? (
            <EmptyState
              title="Nenhuma despesa registrada"
              description="Crie uma nova despesa para começar."
              action={<Button size="sm"><Plus className="mr-2 h-4 w-4" />Adicionar</Button>}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.expenses.map((expense: any) => (
                  <TableRow key={expense.id}>
                    <TableCell className="font-medium">{expense.supplier || '-'}</TableCell>
                    <TableCell>{expense.description}</TableCell>
                    <TableCell>{formatBRL(expense.amount)}</TableCell>
                    <TableCell>{formatDateBR(expense.dueDate, { assumeDateOnly: true })}</TableCell>
                    <TableCell>
                      <StatusBadge tone="positive">{expense.status}</StatusBadge>
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
