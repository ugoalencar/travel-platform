import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, apiCsv, downloadBlob } from '../api';
import { useCan } from '../auth';
import { ChartCard, SeriesBarChart, SeriesLineChart, monthLabel } from '../charts';
import {
  SALE_STATUS_OPTIONS,
  sellerReportQuery,
  type SellerReport,
  type SellerReportFilters,
  type SellerReportItem,
  type SellerSalesDrillDown,
} from '../sellerReport';
import { ErrorNote, StatusBadge, formatBRL } from '../ui';

interface NamedItem {
  id: string;
  name: string;
}

const COMMISSION_LABELS: Record<string, string> = {
  PENDING_RULE: 'Sem regra',
  PENDING: 'Pendente',
  APPROVED: 'Aprovada',
  PAID: 'Paga',
};

export function SellerReportPanel({ initial }: { initial: Partial<SellerReportFilters> }) {
  // Without reports.sellers_all the API returns only the user's own seller.
  const canCompare = useCan('reports.sellers_all');
  const [initialFilters] = useState<SellerReportFilters>(() => ({
    from: initial.from ?? '',
    to: initial.to ?? '',
    sellerId: initial.sellerId ?? '',
    categoryId: '',
    status: '',
  }));
  const [filters, setFilters] = useState<SellerReportFilters>(initialFilters);
  const [sellers, setSellers] = useState<NamedItem[]>([]);
  const [categories, setCategories] = useState<NamedItem[]>([]);
  const [report, setReport] = useState<SellerReport | null>(null);
  const [drill, setDrill] = useState<{ seller: SellerReportItem; data: SellerSalesDrillDown } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ items: NamedItem[] }>('/sellers?pageSize=100')
      .then((response) => setSellers(response.items))
      .catch(() => setSellers([]));
    api<{ items: NamedItem[] }>('/categories')
      .then((response) => setCategories(response.items))
      .catch(() => setCategories([]));
  }, []);

  const openDrill = useCallback(
    async (seller: SellerReportItem, current: SellerReportFilters) => {
      try {
        const data = await api<SellerSalesDrillDown>(
          `/reports/sales?${sellerReportQuery(current, seller.seller_id)}`,
        );
        setDrill({ seller, data });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar as vendas');
      }
    },
    [],
  );

  const run = useCallback(
    async (current: SellerReportFilters, drillSellerId?: string) => {
      setBusy(true);
      setError(null);
      setDrill(null);
      try {
        const result = await api<SellerReport>(`/reports/sellers?${sellerReportQuery(current)}`);
        setReport(result);
        const target = drillSellerId && result.items.find((item) => item.seller_id === drillSellerId);
        if (target) await openDrill(target, current);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao gerar o relatório');
      } finally {
        setBusy(false);
      }
    },
    [openDrill],
  );

  // Arriving from "Ver vendas deste vendedor": run and open the drill-down
  // once (initialFilters and run are stable across renders).
  useEffect(() => {
    if (initialFilters.sellerId) void run(initialFilters, initialFilters.sellerId);
  }, [initialFilters, run]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await run(filters);
  }

  async function download() {
    try {
      downloadBlob(await apiCsv(`/reports/sellers?${sellerReportQuery(filters)}&format=csv`), 'vendedores.csv');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao exportar');
    }
  }

  return (
    <>
      <form className="lite-toolbar" onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span>De</span>
          <input
            type="date"
            value={filters.from}
            onChange={(event) => setFilters({ ...filters, from: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Até</span>
          <input
            type="date"
            value={filters.to}
            onChange={(event) => setFilters({ ...filters, to: event.target.value })}
          />
        </label>
        {canCompare ? (
        <label className="field">
          <span>Vendedor</span>
          <select
            value={filters.sellerId}
            onChange={(event) => setFilters({ ...filters, sellerId: event.target.value })}
          >
            <option value="">Todos</option>
            {sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </select>
        </label>
        ) : null}
        <label className="field">
          <span>Categoria</span>
          <select
            value={filters.categoryId}
            onChange={(event) => setFilters({ ...filters, categoryId: event.target.value })}
          >
            <option value="">Todas</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status da venda</span>
          <select
            value={filters.status}
            onChange={(event) => setFilters({ ...filters, status: event.target.value })}
          >
            {SALE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Gerando…' : 'Consultar'}
        </button>
        <button type="button" className="btn" onClick={() => void download()}>
          Baixar CSV
        </button>
      </form>
      <ErrorNote error={error} />
      {report ? <SellerCharts report={report} canCompare={canCompare} /> : null}
      {report ? (
        <div className="lite-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vendedor</th>
                <th className="num">Vendas</th>
                <th className="num">Vendido</th>
                <th className="num">Custo</th>
                <th className="num">Margem</th>
                <th className="num">Recebido</th>
                <th className="num">A receber</th>
                <th className="num">Comissão gerada</th>
                <th className="num">Comissão paga</th>
                <th className="num">Comissão a pagar</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map((row) => (
                <tr
                  key={row.seller_id}
                  className={drill?.seller.seller_id === row.seller_id ? 'row-selected' : undefined}
                >
                  <td>
                    <button
                      type="button"
                      className="btn btn-small btn-ghost"
                      title="Ver as vendas que formam estes totais"
                      onClick={() => void openDrill(row, filters)}
                    >
                      {row.seller_name}
                    </button>
                    {row.commission_pending_rule_count > 0 ? (
                      <span className="badge badge-warning" title="Vendas com comissão aguardando regra">
                        {row.commission_pending_rule_count} sem regra
                      </span>
                    ) : null}
                  </td>
                  <td className="num">{row.sales_count}</td>
                  <td className="num">{formatBRL(row.gross_amount)}</td>
                  <td className="num">{formatBRL(row.cost_amount)}</td>
                  <td className="num">{formatBRL(row.margin_amount)}</td>
                  <td className="num">{formatBRL(row.received_amount)}</td>
                  <td className="num">{formatBRL(row.pending_amount)}</td>
                  <td className="num">{formatBRL(row.commission_amount)}</td>
                  <td className="num">{formatBRL(row.commission_paid_amount)}</td>
                  <td className="num">{formatBRL(row.commission_pending_amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Totais</th>
                <th className="num">{report.totals.sales_count}</th>
                <th className="num">{formatBRL(report.totals.gross_amount)}</th>
                <th className="num">{formatBRL(report.totals.cost_amount)}</th>
                <th className="num">{formatBRL(report.totals.margin_amount)}</th>
                <th className="num">{formatBRL(report.totals.received_amount)}</th>
                <th className="num">{formatBRL(report.totals.pending_amount)}</th>
                <th className="num">{formatBRL(report.totals.commission_amount)}</th>
                <th className="num">{formatBRL(report.totals.commission_paid_amount)}</th>
                <th className="num">{formatBRL(report.totals.commission_pending_amount)}</th>
              </tr>
            </tfoot>
          </table>
          {report.items.length === 0 ? <p className="lite-empty">Nenhum vendedor no filtro.</p> : null}
        </div>
      ) : null}
      {drill ? (
        <>
          <h2>Vendas de {drill.seller.seller_name}</h2>
          <div className="lite-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Categoria</th>
                  <th>Status</th>
                  <th className="num">Vendido</th>
                  <th className="num">Margem</th>
                  <th className="num">Recebido</th>
                  <th className="num">A receber</th>
                  <th className="num">Comissão</th>
                  <th>Situação da comissão</th>
                </tr>
              </thead>
              <tbody>
                {drill.data.items.map((row) => (
                  <tr key={row.sale_id}>
                    <td>{row.sale_number}</td>
                    <td>{row.sale_date}</td>
                    <td>{row.customer_name ?? '—'}</td>
                    <td>{row.category_name ?? '—'}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="num">{formatBRL(row.gross_amount)}</td>
                    <td className="num">{formatBRL(row.margin_amount)}</td>
                    <td className="num">{formatBRL(row.received_amount)}</td>
                    <td className="num">{formatBRL(row.pending_amount)}</td>
                    <td className="num">{formatBRL(row.commission_amount)}</td>
                    <td>{row.commission_status ? COMMISSION_LABELS[row.commission_status] ?? row.commission_status : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={5}>Totais ({drill.data.totals.count})</th>
                  <th className="num">{formatBRL(drill.data.totals.gross_amount)}</th>
                  <th className="num">{formatBRL(drill.data.totals.margin_amount)}</th>
                  <th className="num">{formatBRL(drill.data.totals.received_amount)}</th>
                  <th className="num">{formatBRL(drill.data.totals.pending_amount)}</th>
                  <th className="num">{formatBRL(drill.data.totals.commission_amount)}</th>
                  <th />
                </tr>
              </tfoot>
            </table>
            {drill.data.items.length === 0 ? <p className="lite-empty">Nenhuma venda no filtro.</p> : null}
          </div>
        </>
      ) : null}
    </>
  );
}

function SellerCharts({ report, canCompare }: { report: SellerReport; canCompare: boolean }) {
  const months = report.charts.by_month.map((point) => ({ ...point, label: monthLabel(point.month) }));
  const comparison = report.items
    .filter((item) => item.sales_count > 0)
    .map((item) => ({ ...item, label: item.seller_name }));
  return (
    <div className="chart-grid">
      <ChartCard title="Vendas por período">
        <SeriesBarChart data={months} xKey="label" series={[{ key: 'gross_amount', label: 'Vendido' }]} />
      </ChartCard>
      <ChartCard title="Margem por período">
        <SeriesLineChart data={months} xKey="label" series={[{ key: 'margin_amount', label: 'Margem' }]} />
      </ChartCard>
      <ChartCard title="Vendas por categoria">
        <SeriesBarChart
          data={report.charts.by_category.map((point) => ({ ...point }))}
          xKey="category_name"
          series={[{ key: 'gross_amount', label: 'Vendido' }]}
        />
      </ChartCard>
      <ChartCard title="Recebido x a receber">
        <SeriesBarChart
          data={months}
          xKey="label"
          series={[
            { key: 'received_amount', label: 'Recebido' },
            { key: 'pending_amount', label: 'A receber' },
          ]}
        />
      </ChartCard>
      <ChartCard title="Comissão gerada x paga">
        <SeriesBarChart
          data={months}
          xKey="label"
          series={[
            { key: 'commission_amount', label: 'Gerada' },
            { key: 'commission_paid_amount', label: 'Paga' },
          ]}
        />
      </ChartCard>
      {canCompare && comparison.length > 1 ? (
        <>
          <ChartCard title="Comparativo de vendedores">
            <SeriesBarChart
              data={comparison}
              xKey="label"
              series={[
                { key: 'gross_amount', label: 'Vendido' },
                { key: 'margin_amount', label: 'Margem' },
                { key: 'commission_amount', label: 'Comissão' },
              ]}
            />
          </ChartCard>
          <ChartCard title="Quantidade de vendas por vendedor">
            <SeriesBarChart
              data={comparison}
              xKey="label"
              series={[{ key: 'sales_count', label: 'Vendas', format: 'count' }]}
            />
          </ChartCard>
        </>
      ) : null}
    </div>
  );
}
