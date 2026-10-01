/**
 * Thin wrappers over recharts (already used by apps/agency) shared by the
 * reports and the dashboard. Charts only render data handed to them; the
 * numbers come from the same API payload as the tables next to them.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatBRL } from './ui';

const CHART_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2'] as const;

function colorAt(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length] ?? CHART_COLORS[0];
}

export interface SeriesSpec {
  key: string;
  label: string;
  /** Money series are formatted as BRL; counts as plain numbers. */
  format?: 'money' | 'count';
}

type Row = Record<string, string | number>;

function formatValue(value: unknown, format: SeriesSpec['format']): string {
  const number = Number(value);
  return format === 'count' ? String(number) : formatBRL(number);
}

function tooltipFormatter(series: SeriesSpec[]) {
  return (value: unknown, name: unknown) => {
    const spec = series.find((s) => s.label === name);
    return [formatValue(value, spec?.format), String(name)];
  };
}

function compactAxis(value: number): string {
  return Math.abs(value) >= 1000 ? `${Math.round(value / 100) / 10}k` : String(value);
}

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="lite-card chart-card">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function SeriesBarChart({
  data,
  xKey,
  series,
  height = 240,
}: {
  data: Row[];
  xKey: string;
  series: SeriesSpec[];
  height?: number;
}) {
  if (data.length === 0) return <p className="lite-empty">Sem dados no período.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xKey} />
        <YAxis tickFormatter={compactAxis} />
        <Tooltip formatter={tooltipFormatter(series)} />
        {series.length > 1 ? <Legend /> : null}
        {series.map((spec, index) => (
          <Bar key={spec.key} dataKey={spec.key} name={spec.label} fill={colorAt(index)} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SeriesLineChart({
  data,
  xKey,
  series,
  height = 240,
}: {
  data: Row[];
  xKey: string;
  series: SeriesSpec[];
  height?: number;
}) {
  if (data.length === 0) return <p className="lite-empty">Sem dados no período.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xKey} />
        <YAxis tickFormatter={compactAxis} />
        <Tooltip formatter={tooltipFormatter(series)} />
        {series.length > 1 ? <Legend /> : null}
        {series.map((spec, index) => (
          <Line
            key={spec.key}
            type="monotone"
            dataKey={spec.key}
            name={spec.label}
            stroke={colorAt(index)}
            strokeWidth={2}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** "2026-08" -> "ago/26" */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-');
  const names = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${names[Number(m) - 1] ?? m}/${String(year).slice(2)}`;
}
