import { useEffect, useState } from 'react';
import {
  TrendingUp,
  FileText,
  Map,
  Plane,
  Wallet,
  CalendarClock,
  MessageCircle,
  Phone,
  Mail,
  MessagesSquare,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { StatCard } from '../components/ui/stat-card';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { StatusBadge } from '../components/ui/status-badge';
import { LoadingState } from '../components/ui/loading-state';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import {
  ApiError,
  getDashboardSummary,
  getUpcomingTravel,
  listProposalsWaiting,
  listRecentInteractions,
  type CustomerInteraction,
  type DashboardSummary,
  type ProposalWaiting,
} from '../lib/api';

// All figures on this page come from the backend's tenant-scoped
// aggregates (GET /commercial/dashboard, /commercial/travel-search,
// /commercial/proposals-waiting, /commercial/interactions). Nothing here
// is computed or estimated client-side -- if a number isn't returned by
// one of these endpoints, it is not shown.

const INTERACTION_ICONS: Record<CustomerInteraction['channel'], React.ComponentType<{ className?: string }>> = {
  EMAIL: Mail,
  PHONE: Phone,
  WHATSAPP: MessageCircle,
  IN_PERSON: MessagesSquare,
  OTHER: MessagesSquare,
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      summary: DashboardSummary;
      upcomingDeparturesCount: number;
      proposalsWaiting: ProposalWaiting[];
      recentInteractions: CustomerInteraction[];
    };

export function DashboardPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading' });

    Promise.all([
      getDashboardSummary(),
      getUpcomingTravel('week'),
      listProposalsWaiting(),
      listRecentInteractions(5),
    ])
      .then(([summary, travel, proposalsWaiting, recentInteractions]) => {
        if (cancelled) return;
        setState({
          status: 'success',
          summary,
          upcomingDeparturesCount: travel.operational.length + travel.commercial.length,
          proposalsWaiting,
          recentInteractions,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar o painel.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Painel" description="Visão geral das operações da agência." />
        <LoadingState label="Carregando resumo da agência…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div>
        <PageHeader title="Painel" description="Visão geral das operações da agência." />
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {state.message}
        </div>
      </div>
    );
  }

  const { summary, upcomingDeparturesCount, proposalsWaiting, recentInteractions } = state;

  return (
    <div className="space-y-8">
      <PageHeader title="Painel" description="Visão geral das operações da agência." />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Vendas (mês)"
          value={formatBRL(Number(summary.salesThisMonthTotal))}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          label="Propostas aguardando resposta"
          value={String(summary.proposalsWaitingCount)}
          icon={<FileText className="h-5 w-5" />}
        />
        <StatCard
          label="Viagens futuras"
          value={String(summary.upcomingTripsCount)}
          icon={<Map className="h-5 w-5" />}
        />
        <StatCard
          label="Próximas partidas (7 dias)"
          value={String(upcomingDeparturesCount)}
          icon={<Plane className="h-5 w-5" />}
        />
        <StatCard
          label="Vendas pendentes"
          value={String(summary.pendingSalesCount)}
          icon={<Wallet className="h-5 w-5" />}
        />
        <StatCard
          label="Follow-ups hoje"
          value={String(summary.followUpsDueTodayCount)}
          icon={<CalendarClock className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Atividade recente de clientes</CardTitle>
          </CardHeader>
          <CardContent>
            {recentInteractions.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Nenhuma interação registrada</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentInteractions.map((interaction) => {
                  const Icon = INTERACTION_ICONS[interaction.channel] ?? MessagesSquare;
                  return (
                    <li key={interaction.id} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                      <span className="mt-0.5 rounded-md bg-slate-100 p-2">
                        <Icon className="h-4 w-4 text-slate-500" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">{interaction.summary}</p>
                        <p className="text-xs text-slate-500">
                          {interaction.direction === 'INBOUND' ? 'Recebida' : 'Enviada'}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">
                        {formatDateBR(interaction.occurredAt, { includeTime: true })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Propostas aguardando resposta</CardTitle>
              <Link to="/wishes" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                Ver todas
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {proposalsWaiting.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Nenhuma proposta aguardando</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {proposalsWaiting.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{p.notes ?? 'Proposta'}</p>
                      <p className="text-xs text-slate-500">
                        {formatBRL(Number(p.total))}
                        {p.validUntil
                          ? ` · Vence em ${formatDateBR(p.validUntil, { assumeDateOnly: true })}`
                          : ''}
                      </p>
                    </div>
                    <StatusBadge tone="neutral">Aguardando</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
