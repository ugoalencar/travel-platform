import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { CheckCircle2, Copy, Edit3, Eye, Send, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import { StatusBadge, type StatusTone } from '../components/ui/status-badge';
import { formatBRL } from '../lib/formatCurrency';
import { ApiError, listProposals, getProposal, listBookings, getBooking, type Proposal } from '../lib/api';
import type { Booking } from '../types/booking';

type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: T | null };

type StepKey = 'Wish' | 'Proposal' | 'Booking' | 'Sale';

function statusTone(status: string): StatusTone {
  if (status === 'ACCEPTED') return 'positive';
  if (status === 'SENT') return 'neutral';
  if (status === 'DRAFT') return 'attention';
  return 'neutral';
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    ACCEPTED: 'Aceita',
    DRAFT: 'Rascunho',
    SENT: 'Enviada',
    DECLINED: 'Recusada',
    EXPIRED: 'Expirada',
    CANCELLED: 'Cancelada',
  };
  return labels[status] || status;
}

function PageIntro({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">UI-03</p>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
      <p className="max-w-3xl text-sm text-slate-600">{description}</p>
    </div>
  );
}

function JourneyRail({ active }: { active: StepKey }) {
  const steps: StepKey[] = ['Wish', 'Proposal', 'Booking', 'Sale'];

  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-2 md:grid-cols-4">
      {steps.map((step, index) => (
        <div
          key={step}
          className={`rounded-md px-3 py-2 ${step === active ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-600'}`}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wide">
            {String(index + 1).padStart(2, '0')}
          </span>
          <p className="text-sm font-semibold">{step}</p>
        </div>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-950">{value}</dd>
    </div>
  );
}

export function ProposalListPage() {
  const [state, setState] = useState<LoadState<Proposal[]>>({ status: 'loading' });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    listProposals()
      .then((proposals) => {
        setState({ status: 'success', data: proposals });
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar as propostas.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const renderContent = () => {
    if (state.status === 'loading') {
      return <LoadingState label="Carregando propostas…" />;
    }

    if (state.status === 'error') {
      return <ErrorState description={state.message} onRetry={load} />;
    }

    const proposals = state.data || [];
    if (proposals.length === 0) {
      return (
        <EmptyState
          title="Nenhuma proposta encontrada"
          description="Quando houver propostas, elas aparecerão aqui."
          action={<Button size="sm" disabled>Nova proposta</Button>}
        />
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-190 text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Destino</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            { }
            {proposals.map((proposal: Proposal) => (
              <tr key={proposal.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-4 font-medium text-slate-950">{proposal.customerId}</td>
                <td className="px-4 py-4 text-slate-600">{proposal.notes || '—'}</td>
                <td className="px-4 py-4 font-semibold text-slate-950">
                  {formatBRL(proposal.total)}
                </td>
                <td className="px-4 py-4">
                  <StatusBadge tone={statusTone(proposal.status)}>
                    {statusLabel(proposal.status)}
                  </StatusBadge>
                </td>
                <td className="px-4 py-4 text-right">
                  <Link
                    to={`/proposals/${proposal.id}`}
                    className="inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageIntro
        title="Jornada comercial"
        description="Fluxo visual de apresentacao que acompanha o desejo do cliente ate proposta, reserva operacional e venda."
      />
      <JourneyRail active="Proposal" />
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Propostas em apresentacao</CardTitle>
          <Button size="sm" disabled>
            <Edit3 className="h-4 w-4" />
            Montar proposta
          </Button>
        </CardHeader>
        <CardContent>{renderContent()}</CardContent>
      </Card>
    </div>
  );
}

export function ProposalDetailPage() {
  const { id } = useParams();
  const [state, setState] = useState<LoadState<Proposal>>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;
    setState({ status: 'loading' });
    getProposal(id)
      .then((proposal) => {
        setState({ status: 'success', data: proposal });
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar a proposta.';
        setState({ status: 'error', message });
      });
  }, [id]);

  if (!id) {
    return <Navigate to="/proposals" replace />;
  }

  if (state.status === 'loading') {
    return <LoadingState label="Carregando proposta…" />;
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={() => {}} />;
  }

  if (!state.data) {
    return <Navigate to="/proposals" replace />;
  }

  const proposal = state.data;

   
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <PageIntro title={`Proposta ${proposal.id}`} description={proposal.notes || 'Detalhes da proposta'} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled>
            <Edit3 className="h-4 w-4" />
            Editar
          </Button>
          <Button variant="outline" disabled>
            <Copy className="h-4 w-4" />
            Duplicar
          </Button>
          <Button variant="outline" disabled>
            <Eye className="h-4 w-4" />
            Preview
          </Button>
          <Button variant="outline" disabled>
            <Send className="h-4 w-4" />
            Enviar
          </Button>
          <Button disabled>
            <CheckCircle2 className="h-4 w-4" />
            Converter
          </Button>
        </div>
      </div>
      <JourneyRail active="Proposal" />
      <Card>
        <CardHeader>
          <CardTitle>Informacoes da proposta</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          { }
          <Field label="Cliente" value={proposal.customerId} />
          { }
          <Field label="Preco proposto" value={formatBRL(proposal.proposedPrice)} />
          { }
          <Field label="Desconto" value={formatBRL(proposal.discount)} />
          { }
          <Field label="Total" value={formatBRL(proposal.total)} />
          { }
          <Field label="Status" value={statusLabel(proposal.status)} />
          { }
          {proposal.validUntil && <Field label="Valido ate" value={proposal.validUntil} />}
        </CardContent>
      </Card>
    </div>
  );
}

export function ProposalBuilderPage() {
  return (
    <div className="space-y-6">
      <PageIntro
        title="Builder de proposta"
        description="Interface para compor uma proposta completa com itinerário, transporte, hospedagem e pricing."
      />
      <JourneyRail active="Proposal" />
      <EmptyState
        title="Builder de proposta"
        description="Esta funcionalidade ainda não está implementada. Aguarde a integração com o backend."
      />
    </div>
  );
}

export function ProposalPreviewPage() {
  return (
    <div className="space-y-6">
      <PageIntro
        title="Preview de proposta"
        description="Visualização da proposta como será apresentada ao cliente."
      />
      <JourneyRail active="Proposal" />
      <EmptyState
        title="Preview de proposta"
        description="Esta funcionalidade ainda não está implementada. Aguarde a integração com o backend."
      />
    </div>
  );
}

export function BookingListPage() {
  const [state, setState] = useState<LoadState<Booking[]>>({ status: 'loading' });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    listBookings()
      .then((bookings) => {
        setState({ status: 'success', data: bookings });
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar as reservas.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const renderContent = () => {
    if (state.status === 'loading') {
      return <LoadingState label="Carregando reservas…" />;
    }

    if (state.status === 'error') {
      return <ErrorState description={state.message} onRetry={load} />;
    }

    const bookings = state.data || [];
    if (bookings.length === 0) {
      return (
        <EmptyState
          title="Nenhuma reserva encontrada"
          description="Quando houver reservas, elas aparecerão aqui."
        />
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-150 text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            { }
            {bookings.map((booking: Booking) => (
              <tr key={booking.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-4 font-medium text-slate-950">{booking.bookerCustomerId}</td>
                <td className="px-4 py-4 text-slate-600">{booking.tripType}</td>
                <td className="px-4 py-4">
                  <StatusBadge tone={booking.cancelled ? 'inactive' : 'positive'}>
                    {booking.cancelled ? 'Cancelada' : 'Confirmada'}
                  </StatusBadge>
                </td>
                <td className="px-4 py-4 text-right">
                  <Link
                    to={`/bookings/${booking.id}`}
                    className="inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageIntro
        title="Reservas operacionais"
        description="Visualize todos os voos, hotéis e serviços confirmados para cada viagem."
      />
      <JourneyRail active="Booking" />
      <Card>
        <CardHeader>
          <CardTitle>Reservas em execucao</CardTitle>
        </CardHeader>
        <CardContent>{renderContent()}</CardContent>
      </Card>
    </div>
  );
}

export function BookingDetailPage() {
  const { id } = useParams();
  const [state, setState] = useState<LoadState<Booking>>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;
    setState({ status: 'loading' });
    getBooking(id)
      .then((booking) => {
        setState({ status: 'success', data: booking });
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar a reserva.';
        setState({ status: 'error', message });
      });
  }, [id]);

  if (!id) {
    return <Navigate to="/bookings" replace />;
  }

  if (state.status === 'loading') {
    return <LoadingState label="Carregando reserva…" />;
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={() => {}} />;
  }

  if (!state.data) {
    return <Navigate to="/bookings" replace />;
  }

  const booking = state.data;

   
  return (
    <div className="space-y-6">
      <PageIntro
        title={`Reserva ${booking.id}`}
        description="Detalhes da reserva operacional, confirmações e documentação."
      />
      <JourneyRail active="Booking" />
      <Card>
        <CardHeader>
          <CardTitle>Informacoes da reserva</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          { }
          <Field label="Cliente" value={booking.bookerCustomerId} />
          { }
          <Field label="Tipo" value={booking.tripType} />
          { }
          <Field label="Status" value={booking.cancelled ? 'Cancelada' : 'Confirmada'} />
          { }
          <Field
            label="Criada em"
            value={new Date(booking.createdAt).toLocaleDateString('pt-BR')}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export function SalesListPage() {
  return (
    <div className="space-y-6">
      <PageIntro
        title="Vendas realizadas"
        description="Histórico de todas as vendas fechadas, pagamentos e comissões."
      />
      <JourneyRail active="Sale" />
      <EmptyState
        title="Nenhuma venda encontrada"
        description="Quando houver vendas, elas aparecerão aqui."
      />
    </div>
  );
}

export function SaleSummaryPage() {
  return (
    <div className="space-y-6">
      <PageIntro
        title="Resumo de venda"
        description="Detalhes completos da venda, faturamento, margens e status de pagamento."
      />
      <JourneyRail active="Sale" />
      <EmptyState
        title="Venda não encontrada"
        description="A venda que você está procurando não existe."
      />
    </div>
  );
}
