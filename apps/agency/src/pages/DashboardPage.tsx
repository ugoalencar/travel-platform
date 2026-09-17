import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  FileText,
  Map,
  Plane,
  Wallet,
  CalendarClock,
  AlertTriangle,
  Clock,
  Receipt,
  Fish,
  PackageCheck,
  XCircle,
  ArrowRight,
  UserPlus,
  Send,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { KpiChip } from '../components/ui/kpi-chip';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Modal } from '../components/ui/modal';
import { Input } from '../components/ui/input';
import { LoadingState } from '../components/ui/loading-state';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import { cn } from '../lib/utils';
import {
  ApiError,
  createProposal,
  getDashboardSummary,
  getSalesReportByPeriod,
  getUpcomingTravel,
  listCustomers,
  listOffers,
  listOpportunities,
  listPipelines,
  type CommercialOpportunity,
  type DashboardSummary,
  type Offer,
  type Pipeline,
  type SalesReportRow,
} from '../lib/api';
import type { Customer } from '../types/customer';

// Every figure on this page comes from real backend aggregates (GET
// /commercial/dashboard, /commercial/travel-search, /reports/sales,
// /commercial/opportunities, /offers). Nothing is fabricated or
// estimated client-side -- a section with no real data source (e.g. a
// monthly sales goal, which nothing in the backend tracks) is left out
// rather than filled with a placeholder number.

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      summary: DashboardSummary;
      upcomingDeparturesCount: number;
      revenueTrend: SalesReportRow[] | null; // null = 403 (role can't see reports), not an error
      opportunities: CommercialOpportunity[];
      offers: Offer[];
      customers: Customer[];
    };

const MONTH_LABELS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function monthLabel(key: string): string {
  const month = Number(key.slice(5, 7));
  return MONTH_LABELS_PT[month - 1] ?? key;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function DashboardPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [offerIndex, setOfferIndex] = useState(0);
  const [offerModal, setOfferModal] = useState<Offer | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 10);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    Promise.all([
      getDashboardSummary(),
      getUpcomingTravel('week'),
      getSalesReportByPeriod(from, to).catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 403) return null;
        throw err instanceof Error ? err : new Error('Failed to load sales report');
      }),
      listPipelines()
        .then((pipelines) => pipelines.find((p) => p.active) ?? pipelines[0] ?? null)
        .then((pipeline: Pipeline | null) => (pipeline ? listOpportunities(pipeline.id) : [])),
      listOffers(),
      listCustomers(),
    ])
      .then(([summary, travel, revenueTrend, opportunities, offers, customers]) => {
        if (cancelled) return;
        setState({
          status: 'success',
          summary,
          upcomingDeparturesCount: travel.operational.length + travel.commercial.length,
          revenueTrend,
          opportunities: opportunities
            .slice()
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .slice(0, 5),
          offers: offers.filter((o) => o.status === 'ACTIVE'),
          customers: customers.filter((c) => c.status === 'ACTIVE'),
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
    return <LoadingState label="Carregando resumo da agência…" />;
  }

  if (state.status === 'error') {
    return (
      <div
        role="alert"
        aria-live="polite"
        className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        {state.message}
      </div>
    );
  }

  const { summary, upcomingDeparturesCount, revenueTrend, opportunities, offers, customers } = state;

  const alerts: Array<{ icon: React.ComponentType<{ className?: string }>; text: string; sub: string; to: string }> = [];
  if (summary.overdueFollowUpsCount > 0) {
    alerts.push({
      icon: Clock,
      text: `${summary.overdueFollowUpsCount} follow-up${summary.overdueFollowUpsCount > 1 ? 's' : ''} atrasado${summary.overdueFollowUpsCount > 1 ? 's' : ''}`,
      sub: 'Clientes aguardando retorno',
      to: '/pipeline',
    });
  }
  if (summary.overdueReceivablesCount > 0) {
    alerts.push({
      icon: Receipt,
      text: `${summary.overdueReceivablesCount} recebível${summary.overdueReceivablesCount > 1 ? 'is' : ''} vencido${summary.overdueReceivablesCount > 1 ? 's' : ''}`,
      sub: 'Regularize para evitar impacto no caixa',
      to: '/financial/payables',
    });
  }
  if (summary.pescadorReviewQueueCount > 0) {
    alerts.push({
      icon: Fish,
      text: `${summary.pescadorReviewQueueCount} captura${summary.pescadorReviewQueueCount > 1 ? 's' : ''} do Pescador`,
      sub: 'Aguardando revisão',
      to: '/pescador',
    });
  }
  if (summary.postSalePendingCount > 0) {
    alerts.push({
      icon: PackageCheck,
      text: `${summary.postSalePendingCount} pendência${summary.postSalePendingCount > 1 ? 's' : ''} de pós-venda`,
      sub: 'Checklist de pós-venda incompleto',
      to: '/operations/post-trip',
    });
  }
  if (summary.cancelledBookingsCount > 0) {
    alerts.push({
      icon: XCircle,
      text: `${summary.cancelledBookingsCount} reserva${summary.cancelledBookingsCount > 1 ? 's' : ''} cancelada${summary.cancelledBookingsCount > 1 ? 's' : ''}`,
      sub: 'Revise reembolsos/realocações',
      to: '/bookings',
    });
  }

  return (
    <div className="space-y-6">
      {/* Visually-hidden page title: the hero below carries the visual
          heading (a greeting, not a redundant "Painel" label matching
          the sidebar nav item), but the page still needs one real
          heading for screen readers/page orientation. */}
      <h1 className="sr-only">Painel</h1>
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-(--color-travel-navy) via-slate-800 to-(--color-travel-cyan)/40 p-8 text-white shadow-lg">
        <div className="relative z-10 max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-200">{greeting()}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Que tal transformar mais sonhos em viagens hoje?</h1>
          <p className="mt-2 text-sm text-slate-200">
            {summary.openOpportunitiesCount} oportunidade{summary.openOpportunitiesCount === 1 ? '' : 's'} em andamento ·{' '}
            {summary.proposalsWaitingCount} proposta{summary.proposalsWaitingCount === 1 ? '' : 's'} aguardando resposta
          </p>
          <Link to="/proposals">
            <Button className="mt-5 bg-white text-slate-900 hover:bg-slate-100">
              Nova proposta
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 opacity-30 [background:radial-gradient(circle_at_70%_50%,rgba(6,182,212,0.6),transparent_60%)] sm:block" />
      </div>

      {/* KPI chips */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiChip
          label="Vendas (mês)"
          value={formatBRL(Number(summary.salesThisMonthTotal))}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="green"
        />
        <KpiChip
          label="Propostas aguardando resposta"
          value={String(summary.proposalsWaitingCount)}
          icon={<FileText className="h-5 w-5" />}
          tone="blue"
        />
        <KpiChip
          label="Viagens futuras"
          value={String(summary.upcomingTripsCount)}
          icon={<Map className="h-5 w-5" />}
          tone="purple"
        />
        <KpiChip
          label="Próximas partidas (7 dias)"
          value={String(upcomingDeparturesCount)}
          icon={<Plane className="h-5 w-5" />}
          tone="blue"
        />
        <KpiChip
          label="Vendas pendentes"
          value={String(summary.pendingSalesCount)}
          icon={<Wallet className="h-5 w-5" />}
          tone="orange"
        />
        <KpiChip
          label="Follow-ups hoje"
          value={String(summary.followUpsDueTodayCount)}
          icon={<CalendarClock className="h-5 w-5" />}
          tone="green"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {revenueTrend && revenueTrend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Receita da agência</CardTitle>
                <p className="text-xs text-slate-500">Evolução das vendas nos últimos 12 meses</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={revenueTrend.map((r) => ({ ...r, monthLabel: monthLabel(r.key) }))}>
                    <defs>
                      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)} mil` : String(v))}
                    />
                    <Tooltip
                      formatter={(value) => formatBRL(Number(value))}
                      labelFormatter={(_label, payload) => (payload?.[0]?.payload as { key?: string } | undefined)?.key ?? ''}
                    />
                    <Area type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2} fill="url(#revenueFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle>Oportunidades em andamento</CardTitle>
              <Link to="/pipeline" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                Ver todas
              </Link>
            </CardHeader>
            <CardContent>
              {opportunities.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">Nenhuma oportunidade em andamento</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {opportunities.map((opp) => (
                    <li key={opp.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{opp.customerName ?? 'Cliente'}</p>
                        <p className="truncate text-xs text-slate-500">{opp.destination ?? 'Destino a definir'}</p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-slate-900">
                        {opp.expectedValue !== undefined ? formatBRL(opp.expectedValue) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {alerts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Alertas operacionais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {alerts.map((alert) => (
                  <Link
                    key={alert.text}
                    to={alert.to}
                    className="flex items-start gap-3 rounded-md p-2 -mx-2 transition-colors hover:bg-slate-50"
                  >
                    <span className="mt-0.5 rounded-md bg-amber-50 p-1.5 text-amber-600">
                      <alert.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">{alert.text}</span>
                      <span className="block text-xs text-slate-500">{alert.sub}</span>
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Resumo financeiro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SummaryRow label="Propostas enviadas" value={String(summary.sentProposalsCount)} />
              <SummaryRow label="Propostas aceitas" value={String(summary.acceptedProposalsCount)} />
              <SummaryRow label="Valor em propostas abertas" value={formatBRL(Number(summary.openProposalValueSum))} />
              <SummaryRow label="Vendas confirmadas" value={String(summary.confirmedSalesCount)} />
              <SummaryRow label="Vendas pagas" value={String(summary.paidSalesCount)} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Offers carousel */}
      {offers.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>Ofertas em destaque</CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOfferIndex((i) => Math.max(0, i - 1))}
                disabled={offerIndex === 0}
                aria-label="Ofertas anteriores"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOfferIndex((i) => Math.min(offers.length - 3, i + 1))}
                disabled={offerIndex >= offers.length - 3}
                aria-label="Próximas ofertas"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden">
              <div
                className="flex gap-4 transition-transform duration-300"
                style={{ transform: `translateX(-${offerIndex * (100 / 3)}%)` }}
              >
                {offers.map((offer, i) => (
                  <div key={offer.id} className="w-full shrink-0 sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]">
                    <OfferCard offer={offer} gradientIndex={i} onOfferToCustomer={() => setOfferModal(offer)} />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Link to="/proposals">
          <Button variant="outline" size="sm">
            <Send className="h-4 w-4" />
            Nova proposta
          </Button>
        </Link>
        <Link to="/customers">
          <Button variant="outline" size="sm">
            <UserPlus className="h-4 w-4" />
            Cadastrar cliente
          </Button>
        </Link>
        <Link to="/trips">
          <Button variant="outline" size="sm">
            <Map className="h-4 w-4" />
            Nova viagem
          </Button>
        </Link>
        <Link to="/financial/payments">
          <Button variant="outline" size="sm">
            <Wallet className="h-4 w-4" />
            Adicionar pagamento
          </Button>
        </Link>
      </div>

      {offerModal && (
        <OfferToCustomerModal
          offer={offerModal}
          customers={customers}
          onClose={() => setOfferModal(null)}
        />
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

const OFFER_GRADIENTS = [
  'from-cyan-500 to-blue-700',
  'from-violet-500 to-fuchsia-700',
  'from-emerald-500 to-teal-700',
  'from-amber-500 to-orange-700',
  'from-blue-500 to-indigo-700',
  'from-rose-500 to-pink-700',
];

function OfferCard({
  offer,
  gradientIndex,
  onOfferToCustomer,
}: {
  offer: Offer;
  gradientIndex: number;
  onOfferToCustomer: () => void;
}) {
  const gradient = OFFER_GRADIENTS[gradientIndex % OFFER_GRADIENTS.length];
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200">
      <div className={cn('flex h-28 items-center justify-center bg-gradient-to-br text-3xl', gradient)}>
        <Plane className="h-9 w-9 text-white/90" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="line-clamp-1 text-sm font-semibold text-slate-900">{offer.name}</p>
        {offer.description && <p className="line-clamp-2 text-xs text-slate-500">{offer.description}</p>}
        <p className="mt-auto text-lg font-bold text-slate-900">{formatBRL(offer.price)}</p>
        {offer.validUntil && (
          <p className="text-xs text-slate-400">Válida até {formatDateBR(offer.validUntil, { assumeDateOnly: true })}</p>
        )}
        <Button size="sm" className="mt-1" onClick={onOfferToCustomer}>
          Ofertar ao cliente
        </Button>
      </div>
    </div>
  );
}

function OfferToCustomerModal({
  offer,
  customers,
  onClose,
}: {
  offer: Offer;
  customers: Customer[];
  onClose: () => void;
}) {
  const [customerId, setCustomerId] = useState('');
  const [price, setPrice] = useState(String(offer.price));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const sortedCustomers = useMemo(
    () => customers.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [customers],
  );

  async function handleSubmit() {
    if (!customerId) {
      setError('Selecione um cliente.');
      return;
    }
    const proposedPrice = Number(price.replace(',', '.'));
    if (!Number.isFinite(proposedPrice) || proposedPrice <= 0) {
      setError('Informe um valor válido.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const proposal = await createProposal({ customerId, offerId: offer.id, proposedPrice });
      setCreatedId(proposal.id);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a proposta.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Ofertar "${offer.name}" a um cliente`}
      footer={
        createdId ? (
          <Link to={`/proposals/${createdId}`}>
            <Button size="sm">Ver proposta</Button>
          </Link>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void handleSubmit()} disabled={saving}>
              {saving ? 'Criando…' : 'Criar proposta'}
            </Button>
          </>
        )
      }
    >
      {createdId ? (
        <p className="text-sm text-slate-600">
          Proposta criada com sucesso. Você pode acompanhá-la a partir de agora em Propostas.
        </p>
      ) : (
        <div className="space-y-4">
          {error && <p role="alert" className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Cliente</label>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Selecione um cliente…</option>
              {sortedCustomers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Valor da proposta</label>
            <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
          </div>
        </div>
      )}
    </Modal>
  );
}
