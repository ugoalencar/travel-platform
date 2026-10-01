import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useCan } from '../auth';
import { ChartCard, SeriesBarChart, SeriesLineChart, monthLabel } from '../charts';
import { ErrorNote, SuccessNote, formatBRL } from '../ui';

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

interface CheckLine {
  key: string;
  ok: boolean;
  pending: string;
  done: string;
  to: string;
  cta: string;
  canCta: boolean;
}

/**
 * First-run checklist: frontend-only signals from the four existing list
 * endpoints. A failing endpoint hides just that row (allSettled); the card
 * disappears once every visible step is done.
 */
function FirstRunChecklist() {
  const canCatalog = useCan('settings.manage');
  const canSellersRead = useCan('sellers.read');
  const canSellersManage = useCan('sellers.manage');
  const canCustomerCreate = useCan('customers.create');
  const [lines, setLines] = useState<CheckLine[] | null>(null);

  useEffect(() => {
    let active = true;
    const checks: Array<Promise<CheckLine>> = [];
    if (canCatalog) {
      checks.push(
        api<{ items: unknown[] }>('/financial-accounts').then((response) => ({
          key: 'account',
          ok: response.items.length > 0,
          pending: 'Cadastre uma conta financeira para receber e pagar.',
          done: 'Conta financeira cadastrada',
          to: '/cadastros',
          cta: 'Ir para Cadastros',
          canCta: true,
        })),
        api<{ items: unknown[] }>('/categories').then((response) => ({
          key: 'category',
          ok: response.items.length > 0,
          pending: 'Cadastre ao menos uma categoria de venda.',
          done: 'Categorias de venda cadastradas',
          to: '/cadastros',
          cta: 'Ir para Cadastros',
          canCta: true,
        })),
      );
    }
    if (canSellersRead) {
      checks.push(
        api<{ total: number }>('/sellers?pageSize=1').then((response) => ({
          key: 'seller',
          ok: response.total > 0,
          pending: 'Cadastre quem vende e a regra de comissão.',
          done: 'Vendedores cadastrados',
          to: '/vendedores',
          cta: 'Ir para Vendedores',
          canCta: canSellersManage,
        })),
      );
    }
    if (canCustomerCreate) {
      checks.push(
        api<{ total: number }>('/customers?pageSize=1').then((response) => ({
          key: 'customer',
          ok: response.total > 0,
          pending: 'Cadastre o primeiro cliente da carteira.',
          done: 'Cliente cadastrado',
          to: '/clientes',
          cta: 'Ir para Clientes',
          canCta: true,
        })),
      );
    }
    if (checks.length === 0) {
      setLines([]);
      return;
    }
    void Promise.allSettled(checks).then((results) => {
      if (!active) return;
      setLines(results.filter((result) => result.status === 'fulfilled').map((result) => result.value));
    });
    return () => {
      active = false;
    };
  }, [canCatalog, canSellersRead, canSellersManage, canCustomerCreate]);

  if (lines === null || lines.length === 0 || lines.every((line) => line.ok)) return null;
  return (
    <section className="lite-card">
      <h2>Prepare sua agência</h2>
      <p className="lite-muted">Leve a base ao dia zero para registrar a primeira venda.</p>
      <ul className="lite-checklist">
        {lines.map((line) => (
          <li key={line.key}>
            {line.ok ? (
              <span className="lite-check-done">✓ {line.done}</span>
            ) : (
              <>
                <span>{line.pending}</span>
                {line.canCta ? (
                  <Link className="btn btn-small" to={line.to}>
                    {line.cta}
                  </Link>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
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
        <div className="chart-grid">
          {panels.map((widget) =>
            widget.kind === 'table' ? (
              <RankingWidget key={widget.key} widget={widget} />
            ) : (
              <ChartWidget key={widget.key} widget={widget} />
            ),
          )}
        </div>
      ) : null}
      {dash.widgets.length === 0 ? <p className="lite-empty">Nenhum indicador disponível para o seu perfil.</p> : null}
    </>
  );
}
