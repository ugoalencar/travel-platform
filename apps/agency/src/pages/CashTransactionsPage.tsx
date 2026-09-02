import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { LoadingState } from '../components/ui/loading-state';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { StatusBadge } from '../components/ui/status-badge';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import { api, ApiError } from '../lib/api';

interface CashTransaction {
  id: string;
  type: 'ENTRY' | 'EXIT' | 'ADJUSTMENT';
  amount: number;
  occurring_at: string;
  origin: string;
  calculated_balance: number;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      transactions: CashTransaction[];
    };

type TransactionType = 'ALL' | 'ENTRY' | 'EXIT' | 'ADJUSTMENT';

function getTypeLabel(type: CashTransaction['type']): string {
  const labels: Record<CashTransaction['type'], string> = {
    ENTRY: 'Entrada',
    EXIT: 'Saída',
    ADJUSTMENT: 'Ajuste',
  };
  return labels[type];
}

function getTypeTone(
  type: CashTransaction['type'],
): 'positive' | 'attention' | 'neutral' | 'inactive' {
  if (type === 'ENTRY') return 'positive';
  if (type === 'EXIT') return 'attention';
  return 'attention';
}

export function CashTransactionsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [typeFilter, setTypeFilter] = useState<TransactionType>('ALL');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setDate(new Date().getDate() - 30))
      .toISOString()
      .split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  const load = useCallback(() => {
    let cancelled = false;

    setState({ status: 'loading' });

    api
      .get(
        `/financial/cash-transactions?start_date=${dateRange.startDate}&end_date=${dateRange.endDate}`,
      )
      .then((response) => {
        if (!cancelled) {
          const transactions = (response.data as { transactions?: CashTransaction[] })
            .transactions || [];
          setState({
            status: 'success',
            transactions,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message:
              err instanceof ApiError
                ? err.message
                : 'Não foi possível carregar as movimentações.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dateRange]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader
          title="Movimentações"
          description="Extrato de caixa (imutável)."
        />
        <LoadingState label="Carregando…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <ErrorState
        description={state.message}
        onRetry={load}
      />
    );
  }

  const filtered = state.transactions.filter((tx) => {
    const matchesType = typeFilter === 'ALL' || tx.type === typeFilter;
    return matchesType;
  });

  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    setDateRange((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Movimentações"
        description="Extrato de caixa (imutável)."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Movimentações' }]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="startDate"
                className="block text-sm font-medium text-slate-700"
              >
                Data Inicial
              </label>
              <input
                id="startDate"
                type="date"
                value={dateRange.startDate}
                onChange={(e) =>
                  handleDateChange('startDate', e.target.value)
                }
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>
            <div>
              <label
                htmlFor="endDate"
                className="block text-sm font-medium text-slate-700"
              >
                Data Final
              </label>
              <input
                id="endDate"
                type="date"
                value={dateRange.endDate}
                onChange={(e) =>
                  handleDateChange('endDate', e.target.value)
                }
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Tipo de Movimentação
            </label>
            <div className="flex flex-wrap gap-2">
              {(['ALL', 'ENTRY', 'EXIT', 'ADJUSTMENT'] as const).map(
                (opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setTypeFilter(opt)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      typeFilter === opt
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {opt === 'ALL'
                      ? 'Todas'
                      : {
                          ENTRY: 'Entradas',
                          EXIT: 'Saídas',
                          ADJUSTMENT: 'Ajustes',
                        }[opt]}
                  </button>
                ),
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Extrato de Caixa</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              title="Nenhuma movimentação"
              description="Não há movimentações no período selecionado."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Saldo Calculado</TableHead>
                    <TableHead>Origem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell>
                        {formatDateBR(tx.occurring_at, {
                          assumeDateOnly: true,
                        })}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={getTypeTone(tx.type)}>
                          {getTypeLabel(tx.type)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatBRL(tx.amount)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatBRL(tx.calculated_balance)}
                      </TableCell>
                      <TableCell>{tx.origin}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
