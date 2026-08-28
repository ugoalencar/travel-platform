import { ArrowDownRight, ArrowUpRight, Clock, Wallet } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
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
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';

// Presentation-only derived values for the prototype -- computed from the
// shared demo fixtures (bookings/proposals/sales), not a persisted ledger.
const financialSummary = {
  totalSold: 63000,
  received: 35000,
  pending: 28000,
  expectedMargin: 16600,
};

const recentPayments = [
  { id: 'pay-001', customer: 'Lucas Martins', description: 'Portugal em família — parcela 2/2', amount: 17500, date: '2026-08-05', status: 'Pago' as const },
  { id: 'pay-002', customer: 'Lucas Martins', description: 'Portugal em família — parcela 1/2', amount: 17500, date: '2026-07-18', status: 'Pago' as const },
  { id: 'pay-003', customer: 'Ana Beatriz Souza', description: 'Grécia — sinal', amount: 14000, date: '2026-08-01', status: 'Pago' as const },
];

const upcomingReceivables = [
  { id: 'rec-001', customer: 'Ricardo Oliveira', description: 'Cancún — saldo restante', amount: 18000, dueDate: '2026-09-30', status: 'Em aberto' as const },
  { id: 'rec-002', customer: 'Ana Beatriz Souza', description: 'Grécia — saldo restante', amount: 14000, dueDate: '2026-08-25', status: 'Em aberto' as const },
];

const bookingPaymentSummary = [
  { label: 'Pago integralmente', count: 1, tone: 'positive' as const },
  { label: 'Pagamento parcial', count: 1, tone: 'attention' as const },
  { label: 'Aguardando primeiro pagamento', count: 1, tone: 'neutral' as const },
];

export function FinancialPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Visão consolidada de vendas, recebimentos e margem esperada da agência."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total vendido (mês)" value={formatBRL(financialSummary.totalSold)} icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Recebido" value={formatBRL(financialSummary.received)} delta="55% do total vendido" deltaTone="positive" icon={<ArrowUpRight className="h-4 w-4" />} />
        <StatCard label="A receber" value={formatBRL(financialSummary.pending)} delta="2 recebíveis em aberto" deltaTone="neutral" icon={<Clock className="h-4 w-4" />} />
        <StatCard label="Margem esperada" value={formatBRL(financialSummary.expectedMargin)} delta="≈ 26% sobre vendas" deltaTone="positive" icon={<ArrowDownRight className="h-4 w-4" />} />
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

      <Card>
        <CardHeader>
          <CardTitle>Status de pagamento das reservas</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {bookingPaymentSummary.map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-md border border-slate-200 p-4">
              <span className="text-sm text-slate-700">{item.label}</span>
              <StatusBadge tone={item.tone}>{item.count}</StatusBadge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
