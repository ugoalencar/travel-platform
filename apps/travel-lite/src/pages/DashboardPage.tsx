import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ChartCard, SeriesBarChart, SeriesLineChart, monthLabel } from '../charts';
import { ErrorNote, SuccessNote, formatBRL } from '../ui';
import { FirstRunChecklist } from '../FirstRunChecklist';

/**
 * Widgets come from GET /dashboard already computed inside the viewer's
 * scope (a seller sees their own numbers in the same widgets) and in the
 * order configured by the MASTER.
 */
interface Widget {
  key: string;
  title: string;
  kind: 'kpi' | 'chart' | 'table';
  data: Record<string, unknown>;
}

interface DashboardJson {
  widgets: Widget[];
  can_configure: boolean;
}

interface LayoutItem {
  key: string;
  title: string;
  enabled: boolean;
}

type Series = Array<Record<string, string | number>>;

function KpiWidget({ widget }: { widget: Widget }) {
  const value = Number(widget.data.value ?? 0);
  const extra =
    widget.key === 'pending_commissions' && Number(widget.data.pending_rule_count) > 0
      ? `${String(widget.data.pending_rule_count)} aguardando regra`
      : null;
  return (
    <div className="stat">
      <div className="stat-label">{widget.title}</div>
      <div className="stat-value">{widget.data.format === 'count' ? value : formatBRL(value)}</div>
      {extra ? <div className="lite-muted">{extra}</div> : null}
    </div>
  );
}

function ChartWidget({ widget }: { widget: Widget }) {
  const series = (widget.data.series ?? []) as Series;
  if (widget.key === 'sales_evolution_chart') {
    return (
      <ChartCard title={widget.title}>
        <SeriesLineChart
          data={series.map((point) => ({ ...point, label: monthLabel(String(point.month)) }))}
          xKey="label"
          series={[
            { key: 'gross_amount', label: 'Vendido' },
            { key: 'margin_amount', label: 'Margem' },
          ]}
        />
      </ChartCard>
    );
  }
  if (widget.key === 'cash_flow') {
    return (
      <ChartCard title={widget.title}>
        <SeriesBarChart
          data={series.map((point) => ({ ...point, label: String(point.day).slice(5) }))}
          xKey="label"
          series={[
            { key: 'inflow', label: 'Entradas' },
            { key: 'outflow', label: 'Saídas' },
          ]}
        />
      </ChartCard>
    );
  }
  return (
    <ChartCard title={widget.title}>
      <SeriesBarChart data={series} xKey="category_name" series={[{ key: 'gross_amount', label: 'Vendido' }]} />
    </ChartCard>
  );
}

function RankingWidget({ widget }: { widget: Widget }) {
  const rows = (widget.data.rows ?? []) as Array<{
    seller_name: string;
    sales_count: number;
    gross_amount: number;
    margin_amount: number;
  }>;
  return (
    <ChartCard title={widget.title}>
      {rows.length === 0 ? (
        <p className="lite-empty">Sem vendas no mês.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Vendedor</th>
              <th className="num">Vendas</th>
              <th className="num">Vendido</th>
              <th className="num">Margem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.seller_name}>
                <td>{row.seller_name}</td>
                <td className="num">{row.sales_count}</td>
                <td className="num">{formatBRL(row.gross_amount)}</td>
                <td className="num">{formatBRL(row.margin_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ChartCard>
  );
}

function DashboardEditor({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [layout, setLayout] = useState<LayoutItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ widgets: LayoutItem[] }>('/dashboard/settings')
      .then((response) => setLayout(response.widgets))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Falha ao carregar'));
  }, []);

  function move(index: number, delta: number) {
    setLayout((current) => {
      if (!current) return current;
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  async function save() {
    if (!layout) return;
    try {
      await api('/dashboard/settings', {
        method: 'PUT',
        body: { widgets: layout.map(({ key, enabled }) => ({ key, enabled })) },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar');
    }
  }

  return (
    <section className="lite-card">
      <h2>Configurar dashboard</h2>
      <p className="lite-muted">
        Escolha quais indicadores aparecem e em que ordem. Vale para toda a agência; cada pessoa vê
        apenas os dados que tem permissão para ver.
      </p>
      <ErrorNote error={error} />
      {layout ? (
        <ul className="widget-editor">
          {layout.map((item, index) => (
            <li key={item.key}>
              <input
                type="checkbox"
                id={`widget-${item.key}`}
                checked={item.enabled}
                onChange={(event) =>
                  setLayout(layout.map((w) => (w.key === item.key ? { ...w, enabled: event.target.checked } : w)))
                }
              />
              <label htmlFor={`widget-${item.key}`}>{item.title}</label>
              <span className="spacer" />
              <button type="button" className="btn btn-small" onClick={() => move(index, -1)} disabled={index === 0}>
                ↑
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => move(index, 1)}
                disabled={index === layout.length - 1}
              >
                ↓
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!layout}>
          Salvar
        </button>
      </div>
    </section>
  );
}

export function DashboardPage() {
  const [dash, setDash] = useState<DashboardJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Mobile summary: KPIs first; charts and rankings open on demand (CSS, data-expanded).
  const [showDetails, setShowDetails] = useState(false);

  const load = useCallback(() => {
    api<DashboardJson>('/dashboard')
      .then((response) => {
        setDash(response);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Falha ao carregar'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorNote error={error} />;
  if (!dash) return <p className="lite-muted">Carregando…</p>;

  const kpis = dash.widgets.filter((w) => w.kind === 'kpi');
  const panels = dash.widgets.filter((w) => w.kind !== 'kpi');

  return (
    <>
      <div className="lite-toolbar">
        <h1>Dashboard</h1>
        <span className="spacer" />
        {dash.can_configure && !editing ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setNotice(null);
              setEditing(true);
            }}
          >
            ⚙ Configurar dashboard
          </button>
        ) : null}
      </div>
      <SuccessNote success={notice} />
      {editing ? (
        <DashboardEditor
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setNotice('Configuração do dashboard salva.');
            load();
          }}
        />
      ) : null}
      <FirstRunChecklist />
      {kpis.length > 0 ? (
        <div className="lite-grid">
          {kpis.map((widget) => (
            <KpiWidget key={widget.key} widget={widget} />
          ))}
        </div>
      ) : null}
      {panels.length > 0 ? (
        <button
          type="button"
          className="btn lite-more-toggle"
          aria-expanded={showDetails}
          onClick={() => setShowDetails((open) => !open)}
        >
          {showDetails ? 'Ocultar gráficos e rankings' : 'Ver gráficos e rankings'}
        </button>
      ) : null}
      {panels.length > 0 ? (
        <div className="chart-grid lite-dash-detail" data-expanded={showDetails ? 'true' : 'false'}>
          {panels.map((widget) =>
            widget.kind === 'table' ? (
              <RankingWidget key={widget.key} widget={widget} />
            ) : (
              <ChartWidget key={widget.key} widget={widget} />
            ),
          )}
        </div>
      ) : null}
      {dash.widgets.length === 0 ? (
        <p className="lite-empty">
          Nenhum indicador disponível para o seu perfil.{' '}
          <Link to="/ajuda#configuracoes">Ver permissões na ajuda</Link>
        </p>
      ) : null}
    </>
  );
}
