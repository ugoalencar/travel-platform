import { useEffect, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { LoadingState } from '../components/ui/loading-state';
import { EmptyState } from '../components/ui/empty-state';
import { StatusBadge } from '../components/ui/status-badge';
import { formatBRL } from '../lib/formatCurrency';

export function ReconciliationPage() {
  const [reconciliations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => setLoading(false), 500);
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title="Reconciliações" description="Conciliar entradas e saídas de caixa." />
        <LoadingState label="Carregando…" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reconciliações"
        description="Conciliar entradas e saídas de caixa."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Reconciliações' }]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Status de Conciliação</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {reconciliations.length === 0 ? (
            <EmptyState
              title="Nenhuma conciliação"
              description="Criar conciliações para validar seus registros."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Esperado</TableHead>
                  <TableHead>Atual</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reconciliations.map((r: any) => {
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                  return (<TableRow key={r.id}>
                    {/* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access */}
                    <TableCell>{r.reconciliationDate}</TableCell>
                    {/* eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */}
                    <TableCell>{formatBRL(r.expectedAmount)}</TableCell>
                    {/* eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */}
                    <TableCell>{formatBRL(r.actualAmount)}</TableCell>
                    <TableCell>
                      {/* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access */}
                      <StatusBadge tone={r.status === 'RECONCILED' ? 'positive' : 'attention'}>
                        {/* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access */}
                        {r.status === 'RECONCILED' ? 'Conciliado' : 'Não Conciliado'}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
