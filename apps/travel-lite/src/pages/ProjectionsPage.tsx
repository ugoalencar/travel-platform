import { useCallback, useEffect, useState } from 'react';
import { api, apiCsv, downloadBlob } from '../api';
import { useCan } from '../auth';
import { ErrorNote } from '../ui';

interface Receivables {
  late: { count: number; openBalance: number };
  byMonth: Array<{ month: string; openBalance: number; count: number }>;
  totalOpen: number;
}
interface Revenue {
  contracted: { total: number };
  projected: { total: number };
  undefined: { total: number };
}
interface SupplierBalance {
  supplierId: string | null;
  expected: number;
  received: number;
  difference: number;
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
] as const;

/**
 * Projections (Frente 9), Lite subset of the Full page. The server computes
 * everything for the session's tenant; receivables, agency revenue and supplier
 * balances are shown apart and never added together.
 */
export function ProjectionsPage() {
  const canFinance = useCan('reports.finance');
  const canRevenue = useCan('revenue.read_all');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [receivables, setReceivables] = useState<Receivables | null>(null);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [balances, setBalances] = useState<SupplierBalance[]>([]);
  const [error, setError] = useState<string | null>(null);

  const query = Object.entries(filters)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  const withQuery = useCallback((path: string, extra = '') => {
    const parts = [query, extra].filter(Boolean).join('&');
    return parts ? `${path}?${parts}` : path;
  }, [query]);

  useEffect(() => {
    // Only the newest filters may write the state (a slower, older response is dropped).
    let current = true;
    setError(null);
    const tasks: Array<Promise<void>> = [];
    if (canFinance) tasks.push(api<Receivables>(withQuery('/reports/receivables-projection')).then((value) => { if (current) setReceivables(value); }));
    if (canRevenue) {
      tasks.push(api<Revenue>(withQuery('/reports/revenue-forecast')).then((value) => { if (current) setRevenue(value); }));
      tasks.push(api<{ rows: SupplierBalance[] }>(withQuery('/reports/supplier-balances')).then((result) => { if (current) setBalances(result.rows); }));
    }
    Promise.all(tasks).catch((err: unknown) => {
      if (!current) return;
      setReceivables(null);
      setRevenue(null);
      setBalances([]);
      setError(err instanceof Error ? err.message : 'Falha ao carregar');
    });
    return () => {
      current = false;
    };
  }, [canFinance, canRevenue, withQuery]);

  async function exportCsv(path: string, filename: string) {
    try {
      downloadBlob(await apiCsv(withQuery(path, 'format=csv')), filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao exportar');
    }
  }

  return (
    <>
      <h1>Projeções</h1>
      <ErrorNote error={error} />
      <div className="lite-toolbar">
        {FILTERS.map(([key, label, type]) => (
          <label key={key} className="field">
            <span>{label}</span>
            <input type={type} value={filters[key] ?? ''} onChange={(event) => setFilters({ ...filters, [key]: event.target.value })} />
          </label>
        ))}
      </div>
      {canFinance && receivables ? (
        <section>
          <h2>Recebíveis de clientes</h2>
          <p>Em atraso: {money(receivables.late.openBalance)} ({receivables.late.count})</p>
          {receivables.byMonth.map((row) => (
            <p key={row.month}>
              {row.month}: {money(row.openBalance)}
            </p>
          ))}
          <p>Total em aberto: {money(receivables.totalOpen)}</p>
          <button type="button" className="btn" onClick={() => void exportCsv('/reports/receivables-projection', 'recebiveis-projecao.csv')}>
            Exportar CSV (recebíveis)
          </button>
        </section>
      ) : null}
      {canRevenue && revenue ? (
        <section>
          <h2>Receita da agência</h2>
          <p>Contratada: {money(revenue.contracted.total)}</p>
          <p>Projetada: {money(revenue.projected.total)}</p>
          <p>Sem data definida: {money(revenue.undefined.total)}</p>
          <button type="button" className="btn" onClick={() => void exportCsv('/reports/revenue-forecast', 'receita-projecao.csv')}>
            Exportar CSV (receita)
          </button>
          <h2>Saldos com fornecedores</h2>
          {balances.map((row) => (
            <p key={row.supplierId ?? 'none'}>
              {row.supplierId ?? 'Sem fornecedor'}: esperado {money(row.expected)} · recebido {money(row.received)} · diferença{' '}
              {money(row.difference)}
            </p>
          ))}
          <button type="button" className="btn" onClick={() => void exportCsv('/reports/supplier-balances', 'saldos-fornecedores.csv')}>
            Exportar CSV (fornecedores)
          </button>
        </section>
      ) : null}
    </>
  );
}
