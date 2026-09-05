import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Clock, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { StatCard } from '../components/ui/stat-card';
import { StatusBadge } from '../components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { LoadingState } from '../components/ui/loading-state';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import {
  ApiError,
  getFinancialSummary,
  type FinancialSummary,
} from '../lib/api';

// Financial data state shape
type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      summary: FinancialSummary;
    };

export function FinancialPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading' });

    getFinancialSummary()
      .then((summary) => {
        if (cancelled) return;
        setState({
          status: 'success',
          summary,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar os dados financeiros.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader
          title="Financeiro"
          description="Visão consolidada de vendas, recebimentos e margem esperada da agência."
        />
        <LoadingState label="Carregando dados financeiros…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div>
        <PageHeader
          title="Financeiro"
          description="Visão consolidada de vendas, recebimentos e margem esperada da agência."
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

  const { summary } = state;
  const financialSummary = {
    totalSold: summary.salesThisMonth.total,
    received: summary.received,
    pending: summary.pending,
    expectedMargin: summary.expectedMargin,
  };

  const recentPayments = summary.recentPayments.map((p) => ({
    id: p.id,
    customer: p.customerName,
    description: p.description,
    amount: p.amount,
    date: p.occurredAt,
    status: 'Pago' as const,
  }));

  const upcomingReceivables = summary.upcomingReceivables.map((r) => ({
    id: r.id,
    customer: r.customerName,
    description: r.description,
    amount: r.amount,
    dueDate: r.dueAt,
    status: r.status === 'OPEN' ? 'Em aberto' : r.status === 'PARTIALLY_PAID' ? 'Pagamento parcial' : 'Pago',
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Financeiro"
        description="Visão consolidada de vendas, recebimentos e margem esperada da agência."
        actions={
          <Link to="/financial/sales/d0d50001-0000-4000-8000-000000000009/story">
            <Button size="sm" variant="outline">Historia financeira</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total vendido (mês)"
          value={formatBRL(financialSummary.totalSold)}
          delta={`${summary.salesThisMonth.count} venda${summary.salesThisMonth.count !== 1 ? 's' : ''}`}
          deltaTone="positive"
          icon={<Wallet className="h-5 w-5" />}
        />
        <StatCard
          label="Recebido"
          value={formatBRL(financialSummary.received)}
          delta={financialSummary.totalSold > 0 ? `${Math.round((financialSummary.received / financialSummary.totalSold) * 100)}% do total vendido` : 'Nenhum pagamento'}
          deltaTone="positive"
          icon={<ArrowUpRight className="h-5 w-5" />}
        />
        <StatCard
          label="A receber"
          value={formatBRL(financialSummary.pending)}
          delta={`${summary.upcomingReceivables.length} recebível${summary.upcomingReceivables.length !== 1 ? 'is' : ''} em aberto`}
          deltaTone="neutral"
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          label="Margem esperada"
          value={formatBRL(financialSummary.expectedMargin)}
          delta={financialSummary.totalSold > 0 ? `≈ ${Math.round((financialSummary.expectedMargin / financialSummary.totalSold) * 100)}% sobre vendas` : 'Sem dados'}
          deltaTone="positive"
          icon={<ArrowDownRight className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pagamentos recentes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium text-slate-900">{payment.customer}</TableCell>
                    <TableCell>{payment.description}</TableCell>
                    <TableCell>{formatBRL(payment.amount)}</TableCell>
                    <TableCell>{formatDateBR(payment.date, { assumeDateOnly: true })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recebíveis pendentes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingReceivables.map((receivable) => (
                  <TableRow key={receivable.id}>
                    <TableCell className="font-medium text-slate-900">{receivable.customer}</TableCell>
                    <TableCell>{receivable.description}</TableCell>
                    <TableCell>{formatBRL(receivable.amount)}</TableCell>
                    <TableCell>
                      <StatusBadge tone="attention">
                        {formatDateBR(receivable.dueDate, { assumeDateOnly: true })}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
