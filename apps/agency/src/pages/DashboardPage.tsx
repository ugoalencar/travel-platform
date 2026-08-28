import {
  TrendingUp,
  FileText,
  Map,
  Plane,
  CalendarCheck,
  Users,
  Check,
  Send,
  UserPlus,
  Heart,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { StatCard } from '../components/ui/stat-card';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { StatusBadge } from '../components/ui/status-badge';
import { LoadingState } from '../components/ui/loading-state';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import { getProposalStatusLabel, getTripStatusLabel } from '../lib/statusLabels';
import { useMockLoading } from '../lib/useMockLoading';
import {
  dashboardSummary,
  recentActions,
  alerts,
  proposals,
  trips as activeTripsList,
} from '../lib/fixtures';

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  check: Check,
  plane: Plane,
  send: Send,
  'user-plus': UserPlus,
  heart: Heart,
};

export function DashboardPage() {
  const d = dashboardSummary;
  const openProposalsList = proposals.filter((p) => p.status === 'SENT' || p.status === 'DRAFT');
  const loadState = useMockLoading();

  if (loadState === 'loading') {
    return (
      <div>
        <PageHeader title="Dashboard" description="Visão geral das operações da agência." />
        <LoadingState label="Carregando resumo da agência…" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Visão geral das operações da agência."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Vendas (mês)"
          value={formatBRL(d.totalSales)}
          delta={d.salesDelta}
          deltaTone={d.salesTone}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Propostas abertas"
          value={String(d.openProposals)}
          delta={d.proposalsDelta}
          deltaTone={d.proposalsTone}
          icon={<FileText className="h-4 w-4" />}
        />
        <StatCard
          label="Viagens ativas"
          value={String(d.activeTrips)}
          delta={d.tripsDelta}
          deltaTone={d.tripsTone}
          icon={<Map className="h-4 w-4" />}
        />
        <StatCard
          label="Próximas partidas"
          value={String(d.upcomingDepartures)}
          delta={d.departuresDelta}
          deltaTone={d.departuresTone}
          icon={<Plane className="h-4 w-4" />}
        />
        <StatCard
          label="Reservas pendentes"
          value={String(d.pendingBookings)}
          delta={d.bookingsDelta}
          deltaTone={d.bookingsTone}
          icon={<CalendarCheck className="h-4 w-4" />}
        />
        <StatCard
          label="Clientes ativos"
          value={String(d.activeCustomers)}
          delta={d.customersDelta}
          deltaTone={d.customersTone}
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ações recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-slate-100">
              {recentActions.map((action) => {
                const Icon = ACTION_ICONS[action.icon] ?? Check;
                return (
                  <li key={action.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="mt-0.5 rounded-md bg-slate-100 p-1.5">
                      <Icon className="h-3.5 w-3.5 text-slate-500" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{action.label}</p>
                      <p className="text-xs text-slate-500">{action.detail}</p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">
                      {formatDateBR(action.timestamp)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Propostas abertas</CardTitle>
                <Link to="/wishes" className="text-xs font-medium text-slate-600 hover:text-slate-900">
                  Ver todas
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {openProposalsList.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">Nenhuma proposta aberta</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {openProposalsList.map((p) => (
                    <li key={p.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{p.notes ?? 'Proposta'}</p>
                        <p className="text-xs text-slate-500">
                          {formatBRL(p.total)} · Vence em {formatDateBR(p.validUntil, { assumeDateOnly: true })}
                        </p>
                      </div>
                      <StatusBadge tone="neutral">{getProposalStatusLabel(p.status)}</StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Alertas</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">Tudo em ordem</p>
              ) : (
                <ul className="space-y-3">
                  {alerts.map((alert) => (
                    <li
                      key={alert.id}
                      className="flex items-start gap-2 rounded-md border border-slate-100 p-3"
                    >
                      {alert.severity === 'warning' ? (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      ) : (
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-slate-900">{alert.label}</p>
                        <p className="text-xs text-slate-500">{alert.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Viagens ativas</CardTitle>
            <Link to="/trips" className="text-xs font-medium text-slate-600 hover:text-slate-900">
              Ver todas
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {activeTripsList.map((trip) => (
              <Link
                key={trip.id}
                to={`/trips/${trip.id}`}
                className="flex items-start gap-3 rounded-md border border-slate-100 p-3 transition-colors hover:bg-slate-50"
              >
                <span className="rounded-md bg-blue-50 p-2">
                  <Map className="h-4 w-4 text-blue-600" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{trip.name}</p>
                  <p className="text-xs text-slate-500">{trip.destination}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDateBR(trip.startDate, { assumeDateOnly: true })} —{' '}
                    {formatDateBR(trip.endDate, { assumeDateOnly: true })}
                  </p>
                </div>
                <StatusBadge tone={trip.status === 'CONFIRMED' ? 'positive' : 'neutral'}>
                  {getTripStatusLabel(trip.status)}
                </StatusBadge>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
