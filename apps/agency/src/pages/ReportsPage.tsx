import { BarChart3, MapPin, TrendingUp } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { StatCard } from '../components/ui/stat-card';

// Presentation-only derived values for the prototype, computed from the
// shared demo fixtures -- not a real analytics pipeline.
const salesByPeriod = [
  { period: 'Jun/2026', value: 28000 },
  { period: 'Jul/2026', value: 45000 },
  { period: 'Ago/2026', value: 63000 },
];
const maxSales = Math.max(...salesByPeriod.map((s) => s.value));

const topDestinations = [
  { destination: 'Portugal', bookings: 1, share: 34 },
  { destination: 'Grécia', bookings: 1, share: 30 },
  { destination: 'Cancún, México', bookings: 1, share: 19 },
  { destination: 'Japão', bookings: 1, share: 17 },
];

const statusDistribution = [
  { label: 'Confirmadas', count: 2, tone: 'bg-emerald-500' },
  { label: 'Enviadas', count: 1, tone: 'bg-blue-500' },
  { label: 'Rascunho', count: 1, tone: 'bg-slate-300' },
];
const totalStatusCount = statusDistribution.reduce((sum, s) => sum + s.count, 0);

export function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description="Indicadores de vendas, conversão e destinos mais procurados pela agência."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Vendas nos últimos 3 meses" value="R$ 136.000" delta="+29% no período" deltaTone="positive" icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="Taxa de conversão (proposta → venda)" value="66%" delta="2 de 3 propostas fechadas" deltaTone="positive" icon={<BarChart3 className="h-4 w-4" />} />
        <StatCard label="Destinos ativos" value="4" delta="Portugal é o destino líder" deltaTone="neutral" icon={<MapPin className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Vendas por período</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {salesByPeriod.map((item) => (
              <div key={item.period} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs font-medium text-slate-500">{item.period}</span>
                <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                  <div
                    className="h-2.5 rounded-full bg-slate-900"
                    style={{ width: `${(item.value / maxSales) * 100}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-xs font-semibold text-slate-900">
                  R$ {(item.value / 1000).toFixed(0)}k
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição de status das propostas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex h-3 overflow-hidden rounded-full">
              {statusDistribution.map((item) => (
                <div
                  key={item.label}
                  className={item.tone}
                  style={{ width: `${(item.count / totalStatusCount) * 100}%` }}
                />
              ))}
            </div>
            <ul className="space-y-2">
              {statusDistribution.map((item) => (
                <li key={item.label} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-700">
                    <span className={`h-2.5 w-2.5 rounded-full ${item.tone}`} />
                    {item.label}
                  </span>
                  <span className="font-medium text-slate-900">{item.count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top destinos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {topDestinations.map((item) => (
            <div key={item.destination} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-sm font-medium text-slate-900">
                {item.destination}
              </span>
              <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                <div className="h-2.5 rounded-full bg-cyan-600" style={{ width: `${item.share}%` }} />
              </div>
              <span className="w-24 shrink-0 text-right text-xs text-slate-500">
                {item.bookings} reserva{item.bookings !== 1 ? 's' : ''}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
