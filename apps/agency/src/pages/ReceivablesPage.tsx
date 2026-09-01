import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { StatusBadge } from '../components/ui/status-badge';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import { Modal } from '../components/ui/modal';
import { ApiError, type Receivable } from '../lib/api';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';

type ReceivableStatus = 'OPEN' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';

interface ReceivableWithStatus extends Receivable {
  status: ReceivableStatus;
}

function getReceivableStatusLabel(status: ReceivableStatus): string {
  const labels: Record<ReceivableStatus, string> = {
    OPEN: 'Aberto',
    PARTIAL: 'Parcialmente Pago',
    PAID: 'Pago',
    OVERDUE: 'Vencido',
    CANCELLED: 'Cancelado',
  };
  return labels[status] ?? status;
}

function statusTone(status: ReceivableStatus) {
  if (status === 'PAID') return 'positive';
  if (status === 'CANCELLED') return 'inactive';
  if (status === 'OVERDUE') return 'attention';
  return 'neutral' as const;
}

export function ReceivablesPage() {
  const [search, setSearch] = useState('');
  const [receivables, setReceivables] = useState<ReceivableWithStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [selectedReceivable, setSelectedReceivable] = useState<ReceivableWithStatus | null>(null);
  const [amountPaid, setAmountPaid] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setError(null);
    setReceivables(null);
    // TODO: Replace with real API call once backend is ready
    // For now, return empty list to show the structure
    setTimeout(() => {
      setReceivables([]);
    }, 300);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return <ErrorState description={error} onRetry={load} />;
  }

  if (!receivables) {
    return <LoadingState label="Carregando contas a receber…" />;
  }

  const filtered = receivables.filter((r) =>
    r.description.toLowerCase().includes(search.toLowerCase()) ||
    r.customer_name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleMarkPaid() {
    if (!selectedReceivable || !amountPaid.trim()) return;
    setSubmitting(true);
    try {
      // TODO: Call real API
      // await markReceivableAsPaid(selectedReceivable.id, parseFloat(amountPaid));
      setShowMarkPaid(false);
      setAmountPaid('');
      setSelectedReceivable(null);
      load();
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível atualizar.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Contas a Receber</h1>
          <p className="text-sm text-slate-500">{receivables.length} contas registradas</p>
        </div>
        <Link to="/financial">
          <Button size="sm" variant="outline">
            ← Voltar
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <label htmlFor="receivables-search" className="sr-only">
            Buscar contas
          </label>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input
            id="receivables-search"
            placeholder="Buscar por cliente ou descrição…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Buscar contas a receber"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhuma conta a receber"
          description={search ? 'Tente outro termo de busca.' : 'Nenhuma conta registrada no momento.'}
          icon={<Plus className="h-8 w-8" />}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">Cliente</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">Descrição</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-700">Valor</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">Vencimento</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((receivable) => (
                    <tr key={receivable.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{receivable.customer_name}</td>
                      <td className="px-4 py-3 text-slate-600">{receivable.description}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatBRL(receivable.amount)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {formatDateBR(receivable.due_at, { assumeDateOnly: true })}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={statusTone(receivable.status)}>
                          {getReceivableStatusLabel(receivable.status)}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        {receivable.status !== 'PAID' && receivable.status !== 'CANCELLED' && (
                          <button
                            onClick={() => {
                              setSelectedReceivable(receivable);
                              setAmountPaid(String(receivable.amount));
                              setShowMarkPaid(true);
                            }}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                          >
                            Marcar pago
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Modal open={showMarkPaid} onClose={() => setShowMarkPaid(false)} title="Marcar como Pago">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-900">Valor Recebido</label>
            <input
              type="number"
              step="0.01"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowMarkPaid(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleMarkPaid} disabled={submitting}>
              {submitting ? 'Salvando...' : 'Confirmar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
