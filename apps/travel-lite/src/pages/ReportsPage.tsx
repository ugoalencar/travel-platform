import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, apiCsv, downloadBlob } from '../api';
import { useCan } from '../auth';
import { ErrorNote, formatBRL } from '../ui';
import { SellerReportPanel } from './SellerReportPanel';

interface SalesReport {
  items: Array<{
    sale_number: string;
    sale_date: string;
    status: string;
    customer_name: string | null;
    seller_name: string | null;
    category_name: string | null;
    gross_amount: number;
    cost_amount: number;
    margin_amount: number;
  }>;
  totals: { count: number; gross_amount: number; cost_amount: number; margin_amount: number };
}

interface CommissionsReport {
  items: Array<{
    created_at: string;
    sale_number: string;
    seller_name: string;
    status: string;
    commission_amount: number | null;
  }>;
  totals: { count: number; commission_amount: number; paid_amount: number };
}

interface CashFlowReport {
  items: Array<{ day: string; inflow: number; outflow: number; net: number }>;
  totals: { inflow: number; outflow: number };
  period: { from: string; to: string };
}

type Tab = 'sales' | 'sellers' | 'commissions' | 'cashFlow';

export function ReportsPage() {
  // ?aba=vendedores&vendedor=<id>&de=&ate= comes from the Sellers page.
  const [searchParams] = useSearchParams();
  const canCompare = useCan('reports.sellers_all');
  const available: Record<Tab, boolean> = {
    sales: useCan('reports.sales_all', 'reports.sales_own'),
    sellers: useCan('reports.sellers_all', 'reports.sales_own'),
    commissions: useCan('commissions.read_all', 'commissions.read_own'),
    cashFlow: useCan('reports.finance'),
  };
  const tabs: Array<{ key: Tab; label: string }> = (
    [
      { key: 'sales', label: 'Vendas' },
      { key: 'sellers', label: canCompare ? 'Vendedores' : 'Meus indicadores' },
      { key: 'commissions', label: 'Comissões' },
      { key: 'cashFlow', label: 'Fluxo de caixa' },
    ] as const
  ).filter((item) => available[item.key]);
  const requested: Tab | null = searchParams.get('aba') === 'vendedores' ? 'sellers' : null;
  const [tab, setTab] = useState<Tab>(
    requested && available[requested] ? requested : (tabs[0]?.key ?? 'sales'),
  );
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [commissions, setCommissions] = useState<CommissionsReport | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function periodQuery(): string {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return params.toString();
  }

  async function runReport(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const query = periodQuery();
      if (tab === 'sales') {
        setSales(await api<SalesReport>(`/reports/sales${query ? `?${query}` : ''}`));
      } else if (tab === 'commissions') {
        setCommissions(await api<CommissionsReport>(`/reports/commissions${query ? `?${query}` : ''}`));
      } else {
        setCashFlow(await api<CashFlowReport>(`/reports/cash-flow${query ? `?${query}` : ''}`));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar o relatório');
    } finally {
      setBusy(false);
    }
  }

  async function download(path: string, filename: string): Promise<void> {
    setError(null);
    try {
      const blob = await apiCsv(path);
      downloadBlob(blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao exportar');
    }
  }

  const filenames: Record<Exclude<Tab, 'sellers'>, string> = {
    sales: 'vendas.csv',
    commissions: 'comissoes.csv',
    cashFlow: 'fluxo-de-caixa.csv',
  };

  return (
    <>
      <h1>Relatórios</h1>
      <div className="lite-tabs">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            className={tab === item.key ? 'lite-tab active' : 'lite-tab'}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'sellers' ? (
        <SellerReportPanel
          initial={{
            sellerId: searchParams.get('vendedor') ?? '',
            from: searchParams.get('de') ?? '',
            to: searchParams.get('ate') ?? '',
          }}
        />
      ) : null}
      {tab !== 'sellers' ? (
      <form className="lite-toolbar" onSubmit={(event) => void runReport(event)}>
        <label className="field">
          <span>De</span>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="field">
          <span>Até</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Gerando…' : 'Consultar'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void download(`/reports/${tab === 'cashFlow' ? 'cash-flow' : tab}?${periodQuery()}`, filenames[tab])}
        >
          Baixar CSV
        </button>
      </form>
      ) : null}
      {tab !== 'sellers' ? <ErrorNote error={error} /> : null}
      {tab === 'sales' && sales ? (
        <div className="lite-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Número</th>
                <th>Data</th>
                <th>Cliente</th>
                <th>Vendedor</th>
                <th>Categoria</th>
                <th className="num">Bruto</th>
                <th className="num">Custo</th>
                <th className="num">Margem</th>
              </tr>
            </thead>
            <tbody>
              {sales.items.map((row) => (
                <tr key={row.sale_number}>
                  <td>{row.sale_number}</td>
                  <td>{row.sale_date}</td>
                  <td>{row.customer_name ?? '—'}</td>
                  <td>{row.seller_name ?? '—'}</td>
                  <td>{row.category_name ?? '—'}</td>
                  <td className="num">{formatBRL(row.gross_amount)}</td>
                  <td className="num">{formatBRL(row.cost_amount)}</td>
                  <td className="num">{formatBRL(row.margin_amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={5}>Totais ({sales.totals.count})</th>
                <th className="num">{formatBRL(sales.totals.gross_amount)}</th>
                <th className="num">{formatBRL(sales.totals.cost_amount)}</th>
                <th className="num">{formatBRL(sales.totals.margin_amount)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
      {tab === 'commissions' && commissions ? (
        <div className="lite-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Venda</th>
                <th>Vendedor</th>
                <th>Status</th>
                <th className="num">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {commissions.items.map((row, index) => (
                <tr key={`${row.sale_number}-${index}`}>
                  <td>{String(row.created_at).slice(0, 10)}</td>
                  <td>{row.sale_number}</td>
                  <td>{row.seller_name}</td>
                  <td>{row.status}</td>
                  <td className="num">
                    {row.commission_amount !== null ? formatBRL(row.commission_amount) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={4}>Totais ({commissions.totals.count})</th>
                <th className="num">{formatBRL(commissions.totals.commission_amount)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
      {tab === 'cashFlow' && cashFlow ? (
        <div className="lite-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th className="num">Entradas</th>
                <th className="num">Saídas</th>
                <th className="num">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {cashFlow.items.map((row) => (
                <tr key={row.day}>
                  <td>{row.day}</td>
                  <td className="num">{formatBRL(row.inflow)}</td>
                  <td className="num">{formatBRL(row.outflow)}</td>
                  <td className="num">{formatBRL(row.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>
                  {cashFlow.period.from} a {cashFlow.period.to}
                </th>
                <th className="num">{formatBRL(cashFlow.totals.inflow)}</th>
                <th className="num">{formatBRL(cashFlow.totals.outflow)}</th>
                <th className="num">
                  {formatBRL(cashFlow.totals.inflow - cashFlow.totals.outflow)}
                </th>
              </tr>
            </tfoot>
          </table>
          {cashFlow.items.length === 0 ? (
            <p className="lite-empty">Sem movimentações no período.</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
