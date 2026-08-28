import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { getDashboardSummary } from '../../lib/commercialApi';
import type { DashboardSummary } from '../../types/commercial';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; summary: DashboardSummary };

// Quick filter buttons set SERVER-SIDE filter params on the Pipeline page
// (via URL search params consumed there) -- never fetch-all-then-filter
// client-side.
const QUICK_FILTERS: Array<{ label: string; to: string }> = [
  { label: 'Retornos hoje', to: '/commercial/agenda#follow-ups-today' },
  { label: 'Retornos atrasados', to: '/commercial/pipeline?overdue=true' },
  { label: 'Sem próxima ação', to: '/commercial/pipeline?hasNextAction=false' },
  { label: 'Propostas sem resposta', to: '/commercial/agenda#proposals-waiting' },
  { label: 'Recebiveis vencidos', to: '/financial' },
  { label: 'Reservas canceladas', to: '/bookings' },
  { label: 'Fila Pescador', to: '/pescador' },
  { label: 'Viagens próximas', to: '/commercial/agenda#upcoming-trips' },
  { label: 'Vendas do mês', to: '/commercial/agenda#sales-this-month' },
  { label: 'Pós-venda pendente', to: '/commercial/agenda#post-sale' },
];

export function CommercialDashboardPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    getDashboardSummary()
      .then((summary) => {
        if (!cancelled) setState({ status: 'success', summary });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: error instanceof ApiError ? error.message : 'Não foi possível carregar o painel.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Painel Comercial</h1>

      <div className="flex flex-wrap gap-2">
        {QUICK_FILTERS.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => void navigate(filter.to)}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            {filter.label}
          </button>
        ))}
      </div>

      {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && <KpiGrid summary={state.summary} />}
    </div>
  );
}

function KpiGrid({ summary }: { summary: DashboardSummary }) {
  const tiles: Array<{ label: string; value: string | number }> = [
    { label: 'Oportunidades abertas', value: summary.openOpportunitiesCount },
    { label: 'Retornos hoje', value: summary.followUpsDueTodayCount },
    { label: 'Retornos atrasados', value: summary.overdueFollowUpsCount },
    { label: 'Propostas sem resposta', value: summary.proposalsWaitingCount },
    { label: 'Propostas enviadas', value: summary.sentProposalsCount },
    { label: 'Propostas aceitas', value: summary.acceptedProposalsCount },
    { label: 'Valor em propostas abertas', value: formatCurrency(summary.openProposalValueSum) },
    { label: 'Vendas do mês', value: summary.salesThisMonthCount },
    { label: 'Total vendido no mês', value: formatCurrency(summary.salesThisMonthTotal) },
    { label: 'Vendas pendentes', value: summary.pendingSalesCount },
    { label: 'Vendas confirmadas', value: summary.confirmedSalesCount },
    { label: 'Vendas pagas', value: summary.paidSalesCount },
    { label: 'Recebiveis vencidos', value: summary.overdueReceivablesCount },
    { label: 'Reservas canceladas', value: summary.cancelledBookingsCount },
    { label: 'Fila Pescador', value: summary.pescadorReviewQueueCount },
    { label: 'Viagens futuras', value: summary.upcomingTripsCount },
    { label: 'Pós-venda pendente', value: summary.postSalePendingCount },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {tile.label}
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{tile.value}</div>
        </div>
      ))}
    </div>
  );
}

function formatCurrency(value: string): string {
  const number = Number(value);
  if (Number.isNaN(number)) return value;
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
