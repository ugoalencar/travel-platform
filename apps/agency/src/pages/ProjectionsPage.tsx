import { useCallback, useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { api } from '../lib/api';

interface Receivables {
  late: { count: number; openBalance: number };
  byMonth: Array<{ month: string; openBalance: number; count: number }>;
  totalOpen: number;
}
interface Revenue {
  contracted: { total: number };
  projected: { total: number; byMonth: Array<{ month: string; amount: number }> };
  undefined: { total: number };
  grandTotal: number;
}
interface SupplierBalance {
  supplierId: string | null;
  volumeSold: number;
  expected: number;
  received: number;
  difference: number;
  employeeCommissionsPaid: number;
  result: number;
}
interface Commissions {
  forecast: number;
  released: number;
  paid: number;
  releasedNotPaid: number;
  notYetReleased: number;
  releasedNotPaidByExpectedPayMonth: Array<{ month: string; amount: number }>;
}

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const FILTERS = [
  ['saleFrom', 'Venda de', 'date'],
  ['saleTo', 'Venda até', 'date'],
  ['travelFrom', 'Embarque de', 'date'],
  ['travelTo', 'Embarque até', 'date'],
  ['origin', 'Origem', 'text'],
  ['destination', 'Destino', 'text'],
  ['categoryId', 'Categoria (ID)', 'text'],
  ['supplierId', 'Fornecedor (ID)', 'text'],
  ['employeeId', 'Funcionário (ID)', 'text'],
] as const;

/**
 * Projections (Frente 9). The server computes everything for the session's
 * agency; this page only sends the filters and shows the four reports apart:
 * customer receivables, agency revenue, supplier balances and employee
 * commission are never added together.
 */
export function ProjectionsPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [receivables, setReceivables] = useState<Receivables | null>(null);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [balances, setBalances] = useState<SupplierBalance[]>([]);
  const [commissions, setCommissions] = useState<Commissions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const query = Object.entries(filters)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  const withQuery = (path: string) => (query ? `${path}?${query}` : path);

  const latest = useRef(0);
  const load = useCallback(async () => {
    // Only the newest request may write the state (a slower, older response is dropped).
    const mine = ++latest.current;
    setError(null);
    try {
      const [r, v, b, c] = await Promise.all([
        api.get<Receivables>(withQuery('/reports/receivables-projection')),
        api.get<Revenue>(withQuery('/reports/revenue-forecast')),
        api.get<{ rows: SupplierBalance[] }>(withQuery('/reports/supplier-balances')),
        api.get<Commissions>(withQuery('/reports/commissions-projection')),
      ]);
      if (mine !== latest.current) return;
      setReceivables(r.data);
      setRevenue(v.data);
      setBalances(b.data.rows);
      setCommissions(c.data);
    } catch (err) {
      if (mine !== latest.current) return;
      // Never leave numbers of the previous filters under the new ones.
      setReceivables(null);
      setRevenue(null);
      setBalances([]);
      setCommissions(null);
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as projeções.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the filters are applied
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportCsv(path: string) {
    setExportError(null);
    try {
      const { blob, filename } = await api.downloadCsv(withQuery(path));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Não foi possível exportar.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Projeções" />
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <div><label htmlFor="proj-status">Status da venda</label><select id="proj-status" value={filters.status ?? ''} onChange={e=>setFilters({...filters,status:e.target.value})}><option value="">Todos ativos</option>{['PENDING','CONFIRMED','PAID','CANCELLED'].map(s=><option key={s}>{s}</option>)}</select></div>
          {FILTERS.map(([key, label, type]) => (
            <div key={key}>
              <label htmlFor={`proj-${key}`} className="block text-xs text-slate-500">
                {label}
              </label>
              <input
                id={`proj-${key}`}
                type={type}
                value={filters[key] ?? ''}
                onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}
                className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
          ))}
        </CardContent>
      </Card>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {exportError && (
        <p role="alert" className="text-sm text-red-700">
          {exportError}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recebíveis de clientes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-slate-700">
          {receivables && (
            <>
              <p>Em atraso: {money(receivables.late.openBalance)} ({receivables.late.count})</p>
              {receivables.byMonth.map((row) => (
                <p key={row.month}>
                  {row.month}: {money(row.openBalance)}
                </p>
              ))}
              <p>Total em aberto: {money(receivables.totalOpen)}</p>
            </>
          )}
          <button type="button" className="rounded-md border border-slate-300 px-2 py-1" onClick={() => void exportCsv('/reports/receivables-projection')}>
            Exportar CSV (recebíveis)
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receita da agência</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-slate-700">
          {revenue && (
            <>
              <p>Contratada: {money(revenue.contracted.total)}</p>
              <p>Projetada: {money(revenue.projected.total)}</p>
              <p>Sem data definida: {money(revenue.undefined.total)}</p>
            </>
          )}
          <button type="button" className="rounded-md border border-slate-300 px-2 py-1" onClick={() => void exportCsv('/reports/revenue-forecast')}>
            Exportar CSV (receita)
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saldos com fornecedores</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-slate-700">
          {balances.map((row) => (
            <div key={row.supplierId ?? 'none'} className="rounded-md border border-slate-200 p-3">
              <p className="font-medium">{row.supplierId ?? 'Sem fornecedor'}</p>
              <p>Volume vendido: {money(row.volumeSold)}</p>
              <p>Receita da agência — esperada: {money(row.expected)} · recebida: {money(row.received)} · em aberto: {money(row.difference)}</p>
              <p>Comissões de funcionários pagas: {money(row.employeeCommissionsPaid)} · resultado recebido: {money(row.result)}</p>
            </div>
          ))}
          <button type="button" className="rounded-md border border-slate-300 px-2 py-1" onClick={() => void exportCsv('/reports/supplier-balances')}>
            Exportar CSV (fornecedores)
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Comissões de funcionários</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-slate-700">
          {commissions && (
            <>
              <p>Prevista: {money(commissions.forecast)}</p>
              <p>Liberada: {money(commissions.released)}</p>
              <p>Paga: {money(commissions.paid)}</p>
              <p>Liberada e não paga: {money(commissions.releasedNotPaid)}</p>
              <p>Previsão por mês: {commissions.releasedNotPaidByExpectedPayMonth?.length
                ? commissions.releasedNotPaidByExpectedPayMonth.map(row => `${row.month}: ${money(row.amount)}`).join(' · ')
                : 'Sem valores liberados com data prevista'}</p>
            </>
          )}
          <button type="button" className="rounded-md border border-slate-300 px-2 py-1" onClick={() => void exportCsv('/reports/commissions-projection')}>
            Exportar CSV (comissões)
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
