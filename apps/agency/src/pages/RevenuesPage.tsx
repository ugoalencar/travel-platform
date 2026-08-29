import { useEffect, useState } from 'react';
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
import { StatusBadge } from '../components/ui/status-badge';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      revenues: Array<{
        id: string;
        customerId: string;
        description: string;
        amount: number;
        dueDate: string;
        status: string;
      }>;
    };

export function RevenuesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading' });

    // TODO: Fetch from /financial/revenues
    setTimeout(() => {
      if (!cancelled) {
        setState({
          status: 'success',
          revenues: [],
        });
      }
    }, 500);

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader
          title="Receitas"
          description="Gerenciar receitas de vendas e serviços."
        />
        <LoadingState label="Carregando receitas…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div>
        <PageHeader
          title="Receitas"
          description="Gerenciar receitas de vendas e serviços."
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receitas"
        description="Gerenciar receitas de vendas e serviços."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Receitas' }]}
        actions={<Button size="sm"><Plus className="mr-2 h-4 w-4" />Nova Receita</Button>}
      />

      <Card>
        <CardHeader>
          <CardTitle>Receitas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {state.revenues.length === 0 ? (
            <EmptyState
              title="Nenhuma receita registrada"
              description="Crie uma nova receita para começar."
              action={<Button size="sm"><Plus className="mr-2 h-4 w-4" />Adicionar</Button>}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.revenues.map((revenue) => (
                  <TableRow key={revenue.id}>
                    <TableCell className="font-medium">{revenue.customerId}</TableCell>
                    <TableCell>{revenue.description}</TableCell>
                    <TableCell>{formatBRL(revenue.amount)}</TableCell>
                    <TableCell>{formatDateBR(revenue.dueDate, { assumeDateOnly: true })}</TableCell>
                    <TableCell>
                      <StatusBadge tone="positive">{revenue.status}</StatusBadge>
                    </TableCell>
                    <TableCell>
                      <button className="p-1 hover:bg-gray-100 rounded">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
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
