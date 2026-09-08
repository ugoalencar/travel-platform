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
  CheckCircle2,
  AlertTriangle,
  DollarSign,
  Ban,
  Search,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { StatCard } from '../components/ui/stat-card';
import { SectionCard } from '../components/ui/section-card';
import { StatusBadge } from '../components/ui/status-badge';
import { LoadingState } from '../components/ui/loading-state';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import { useCurrentUser } from '../hooks/useCurrentUser';
import {
  ApiError,
  getDashboardSummary,
  getUpcomingTravel,
  listProposalsWaiting,
  listRecentInteractions,
  listTripOccurrences,
  type CustomerInteraction,
  type DashboardSummary,
  type ProposalWaiting,
  type TravelSearchResult,
  type TripOccurrence,
} from '../lib/api';

const OCCURRENCE_STATUS_TONE: Record<TripOccurrence['status'], 'positive' | 'attention' | 'inactive'> = {
  ABERTA: 'attention',
  EM_ANDAMENTO: 'attention',
  RESOLVIDA: 'positive',
};

const OCCURRENCE_STATUS_LABEL: Record<TripOccurrence['status'], string> = {
  ABERTA: 'Em aberto',
  EM_ANDAMENTO: 'Em andamento',
  RESOLVIDA: 'Resolvida',
};

const GREETING_BY_HOUR = (hour: number) => {
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
};

type AgentLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; travel: TravelSearchResult; occurrences: TripOccurrence[] };

/**
 * Staff/AGENT workspace view: simpler, task-oriented layout per
 * visual_01_role_separation.png's "Staff Operacional" panel -- a greeting,
 * today's date, and a compact "hoje" task list, rather than the dense
 * KPI-heavy ADMIN dashboard below. Reuses existing operational data
 * (today's departures + open trip occurrences); no new endpoints, no
 * fabricated numbers.
 */
function AgentTodayView({ userName }: { userName: string }) {
  const [state, setState] = useState<AgentLoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Promise.all([getUpcomingTravel('today'), listTripOccurrences()])
      .then(([travel, occurrences]) => {
        if (cancelled) return;
        setState({ status: 'success', travel, occurrences });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: error instanceof ApiError ? error.message : 'Não foi possível carregar suas tarefas de hoje.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date();
  const todayLabel = today.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title={`${GREETING_BY_HOUR(today.getHours())}, ${userName}`} description={todayLabel} />
        <LoadingState label="Carregando suas tarefas de hoje…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div>
        <PageHeader title={`${GREETING_BY_HOUR(today.getHours())}, ${userName}`} description={todayLabel} />
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      </div>
    );
  }

  const { travel, occurrences } = state;
  const openOccurrences = occurrences.filter((o) => o.status === 'ABERTA' || o.status === 'EM_ANDAMENTO');
  const todaysDepartures = travel.operational;

  return (
    <div className="space-y-6">
      <PageHeader title={`${GREETING_BY_HOUR(today.getHours())}, ${userName}`} description={todayLabel} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Partidas hoje"
          value={String(todaysDepartures.length)}
          delta="Reservas com embarque hoje"
          deltaTone="neutral"
          icon={<Plane className="h-4 w-4" />}
          accent="neutral"
        />
        <StatCard
          label="Ocorrências em aberto"
          value={String(openOccurrences.length)}
          delta={openOccurrences.length > 0 ? 'Requer atenção' : 'Tudo em ordem'}
          deltaTone={openOccurrences.length > 0 ? 'negative' : 'positive'}
          icon={<AlertTriangle className="h-4 w-4" />}
          accent={openOccurrences.length > 0 ? 'expense' : 'success'}
        />
      </div>

      <SectionCard title="Hoje" description="Suas tarefas e operações do dia">
        {todaysDepartures.length === 0 && openOccurrences.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma tarefa pendente para hoje.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {todaysDepartures.map((b) => (
              <li key={`dep-${b.bookingId}`} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <Plane className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{b.originDestination}</p>
                    <p className="text-xs text-slate-500">Embarque hoje</p>
                  </div>
                </div>
                <StatusBadge tone="neutral">Confirmado</StatusBadge>
              </li>
            ))}
            {openOccurrences.map((o) => (
              <li key={`occ-${o.id}`} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{o.description}</p>
                    <p className="text-xs text-slate-500">{o.tripName} — {o.customerName}</p>
                  </div>
                </div>
                <StatusBadge tone={OCCURRENCE_STATUS_TONE[o.status]}>
                  {OCCURRENCE_STATUS_LABEL[o.status]}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

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

// Human labels for the backend's raw interaction-channel enum values --
// avoids leaking SCREAMING_SNAKE_CASE constants into the UI.
const CHANNEL_LABELS: Record<CustomerInteraction['channel'], string> = {
  EMAIL: 'E-mail',
  PHONE: 'Telefone',
  WHATSAPP: 'WhatsApp',
  IN_PERSON: 'Presencial',
  OTHER: 'Outro',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      summary: DashboardSummary;
      travel: TravelSearchResult;
      proposalsWaiting: ProposalWaiting[];
      recentInteractions: CustomerInteraction[];
    };

export function DashboardPage() {
  const { user, loading: userLoading } = useCurrentUser();

  // AGENT/Staff gets the simpler task-oriented "hoje" view instead of the
  // KPI-heavy ADMIN dashboard below (visual_01_role_separation.png's "Staff
  // Operacional" panel). Wait for the role to resolve before picking a
  // branch so an ADMIN never briefly flashes the agent view (or vice versa).
  if (!userLoading && user?.role === 'AGENT') {
    // No display name is exposed by GET /me today -- greet by role rather
    // than fabricating a name that isn't backed by real data.
    return <AgentTodayView userName="Agente" />;
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
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
          travel,
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

  const { summary, travel, proposalsWaiting, recentInteractions } = state;
  const upcomingDeparturesCount = travel.operational.length + travel.commercial.length;

  // Merge the two upcoming-travel shapes into one "próximas viagens" preview
  // list, sorted by date -- both come from the same already-fetched
  // GET /commercial/travel-search response, nothing invented.
  const upcomingItems = [
    ...travel.operational.map((b) => ({
      key: `b-${b.bookingId}`,
      date: b.departureAt,
      label: b.originDestination,
    })),
    ...travel.commercial.map((t) => ({
      key: `t-${t.tripId}`,
      date: t.startDate,
      label: t.destination,
    })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <PageHeader title="Painel" description="Visão geral das operações da agência." />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Vendas (mês)"
          value={formatBRL(Number(summary.salesThisMonthTotal))}
          icon={<TrendingUp className="h-4 w-4" />}
          accent="revenue"
        />
        <StatCard
          label="Vendas confirmadas (mês)"
          value={String(summary.salesThisMonthCount)}
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent="success"
        />
        <StatCard
          label="Propostas aguardando resposta"
          value={String(summary.proposalsWaitingCount)}
          icon={<FileText className="h-4 w-4" />}
          accent="pending"
        />
        <StatCard
          label="Viagens futuras"
          value={String(summary.upcomingTripsCount)}
          icon={<Map className="h-4 w-4" />}
          accent="neutral"
        />
        <StatCard
          label="Próximas partidas (7 dias)"
          value={String(upcomingDeparturesCount)}
          icon={<Plane className="h-4 w-4" />}
          accent="neutral"
        />
        <StatCard
          label="Follow-ups hoje"
          value={String(summary.followUpsDueTodayCount)}
          {...(summary.overdueFollowUpsCount > 0
            ? { delta: `${summary.overdueFollowUpsCount} atrasado(s)`, deltaTone: 'negative' as const }
            : {})}
          icon={<CalendarClock className="h-4 w-4" />}
          accent="pending"
        />
        <StatCard
          label="Vendas pendentes"
          value={String(summary.pendingSalesCount)}
          icon={<Wallet className="h-4 w-4" />}
          accent="pending"
        />
        <StatCard
          label="Recebíveis em atraso"
          value={String(summary.overdueReceivablesCount)}
          icon={<AlertTriangle className="h-4 w-4" />}
          accent={summary.overdueReceivablesCount > 0 ? 'expense' : 'neutral'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Pipeline comercial" description="Oportunidades e propostas em andamento">
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-slate-500">Oportunidades abertas</dt>
              <dd className="text-lg font-bold text-slate-900">{summary.openOpportunitiesCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Propostas enviadas</dt>
              <dd className="text-lg font-bold text-slate-900">{summary.sentProposalsCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Propostas aceitas</dt>
              <dd className="text-lg font-bold text-slate-900">{summary.acceptedProposalsCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Valor em aberto</dt>
              <dd className="text-lg font-bold text-slate-900">
                {formatBRL(Number(summary.openProposalValueSum))}
              </dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard title="Resumo financeiro" description="Vendas e recebíveis do mês">
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-slate-500">Vendas confirmadas</dt>
              <dd className="text-lg font-bold text-slate-900">{summary.confirmedSalesCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Vendas pagas</dt>
              <dd className="text-lg font-bold text-slate-900">{summary.paidSalesCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Total vendido (mês)</dt>
              <dd className="text-lg font-bold text-slate-900">
                {formatBRL(Number(summary.salesThisMonthTotal))}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Recebíveis em atraso</dt>
              <dd className="text-lg font-bold text-slate-900">{summary.overdueReceivablesCount}</dd>
            </div>
          </dl>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title="Próximas viagens"
          description="Partidas comerciais e operacionais nos próximos 7 dias"
        >
          {upcomingItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Nenhuma partida nos próximos 7 dias</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcomingItems.map((item) => (
                <li key={item.key} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <Plane className="h-4 w-4 text-slate-400" />
                    {item.label}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatDateBR(item.date, { assumeDateOnly: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Pendências operacionais" description="Itens que precisam de atenção">
          <dl className="grid grid-cols-3 gap-4">
            <div className="flex flex-col items-start gap-1">
              <span className="flex h-8 w-8 items-center justify-center rounded-(--radius-sm) bg-(--color-kpi-expense-bg) text-(--color-kpi-expense)">
                <Ban className="h-4 w-4" />
              </span>
              <dt className="text-xs text-slate-500">Reservas canceladas</dt>
              <dd className="text-lg font-bold text-slate-900">{summary.cancelledBookingsCount}</dd>
            </div>
            <div className="flex flex-col items-start gap-1">
              <span className="flex h-8 w-8 items-center justify-center rounded-(--radius-sm) bg-(--color-kpi-pending-bg) text-(--color-kpi-pending)">
                <Search className="h-4 w-4" />
              </span>
              <dt className="text-xs text-slate-500">Fila de revisão (Pescador)</dt>
              <dd className="text-lg font-bold text-slate-900">{summary.pescadorReviewQueueCount}</dd>
            </div>
            <div className="flex flex-col items-start gap-1">
              <span className="flex h-8 w-8 items-center justify-center rounded-(--radius-sm) bg-(--color-kpi-neutral-bg) text-(--color-kpi-neutral)">
                <DollarSign className="h-4 w-4" />
              </span>
              <dt className="text-xs text-slate-500">Pós-venda pendente</dt>
              <dd className="text-lg font-bold text-slate-900">{summary.postSalePendingCount}</dd>
            </div>
          </dl>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Atividade recente de clientes" description="Últimas interações registradas">
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
                        {CHANNEL_LABELS[interaction.channel] ?? interaction.channel}
                        {' · '}
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
        </SectionCard>

        <SectionCard
          title="Propostas aguardando resposta"
          actions={
            <Link to="/wishes" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              Ver todas
            </Link>
          }
        >
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
        </SectionCard>
      </div>
    </div>
  );
}
