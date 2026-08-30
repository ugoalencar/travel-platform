import { useEffect, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { LoadingState } from '../components/ui/loading-state';
import { EmptyState } from '../components/ui/empty-state';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';

export function CashTransactionsPage() {
  const [transactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => setLoading(false), 500);
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title="Movimentações" description="Extrato de caixa (imutável)." />
        <LoadingState label="Carregando…" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Movimentações"
        description="Extrato de caixa (imutável)."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Movimentações' }]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Extrato de Caixa</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <EmptyState
              title="Nenhuma movimentação"
              description="Criar receitas e despesas gera movimentações."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Saldo</TableHead>
                  <TableHead>Origem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx: any) => {
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                  return (<TableRow key={tx.id}>
                    {/* eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */}
                    <TableCell>{formatDateBR(tx.occurringAt)}</TableCell>
                    {/* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access */}
                    <TableCell>{tx.type === 'ENTRY' ? 'Entrada' : 'Saída'}</TableCell>
                    {/* eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */}
                    <TableCell>{formatBRL(tx.amount)}</TableCell>
                    {/* eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */}
                    <TableCell className="font-medium">{formatBRL(tx.calculatedBalance)}</TableCell>
                    {/* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access */}
                    <TableCell>{tx.origin}</TableCell>
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
