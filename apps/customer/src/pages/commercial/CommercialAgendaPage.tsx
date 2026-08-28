import { useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import {
  createTask,
  getDashboardSummary,
  getPostSaleCandidates,
  getProposalsWaiting,
  listTasks,
  travelSearch,
  updateTask,
  type PostSaleCandidate,
  type ProposalWaiting,
} from '../../lib/commercialApi';
import type { CommercialTask, DashboardSummary, TravelSearchResult } from '../../types/commercial';

interface AgendaData {
  followUps: CommercialTask[];
  proposalsWaiting: ProposalWaiting[];
  travel: TravelSearchResult;
  postSale: PostSaleCandidate[];
  dashboard: DashboardSummary;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: AgendaData };

// Read-only aggregated view. Every section is computed at render/query
// time from its own real source (CommercialTask, Proposal, Trip,
// ScheduledDeparture) -- nothing here is persisted as a merged record.
export function CommercialAgendaPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  function load() {
    setState({ status: 'loading' });
    Promise.all([
      listTasks({ pending: true }),
      getProposalsWaiting(),
      travelSearch('week'),
      getPostSaleCandidates(),
      getDashboardSummary(),
    ])
      .then(([tasksResult, proposalsWaiting, travel, postSale, dashboard]) => {
        setState({
          status: 'success',
          data: { followUps: tasksResult.tasks, proposalsWaiting, travel, postSale, dashboard },
        });
      })
      .catch((error: unknown) => {
        setState({
          status: 'error',
          message: error instanceof ApiError ? error.message : 'Não foi possível carregar a agenda.',
        });
      });
  }

  useEffect(load, []);

  if (state.status === 'loading') {
    return <p className="text-sm text-slate-500">Carregando agenda...</p>;
  }
  if (state.status === 'error') {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {state.message}
      </div>
    );
  }

  const { data } = state;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Agenda Comercial</h1>

      <section id="follow-ups-today">
        <SectionTitle>Retornos pendentes</SectionTitle>
        {data.followUps.length === 0 && <Empty />}
        <ul className="flex flex-col gap-2">
          {data.followUps.map((task) => (
            <li key={task.id} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
              <div className="font-medium text-slate-900">{task.title}</div>
              <div className="text-xs text-slate-500">
                Vence em {new Date(task.dueAt).toLocaleString('pt-BR')}
              </div>
              {task.notes && (
                <div className="mt-1 text-xs text-slate-500">Motivo: {task.notes}</div>
              )}
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-400">
                <a href={`/customers/${task.customerId}`} className="hover:underline">
                  Cliente {task.customerId.slice(0, 8)}
                </a>
                {task.opportunityId && (
                  <span>Oportunidade {task.opportunityId.slice(0, 8)}</span>
                )}
                <span>Responsável {task.assignedUserId.slice(0, 8)}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  void updateTask(task.id, { completedAt: new Date().toISOString() }).then(load);
                }}
                className="mt-1 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
              >
                Marcar como concluído
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section id="proposals-waiting">
        <SectionTitle>Propostas sem resposta (validade)</SectionTitle>
        {data.proposalsWaiting.length === 0 && <Empty />}
        <ul className="flex flex-col gap-2">
          {data.proposalsWaiting.map((proposal) => (
            <li key={proposal.id} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
              <a href={`/proposals/${proposal.id}`} className="font-medium text-blue-600 hover:underline">
                Proposta {proposal.id.slice(0, 8)}
              </a>
              <div className="text-xs text-slate-500">
                Válida até {proposal.validUntil ? new Date(proposal.validUntil).toLocaleString('pt-BR') : 'sem prazo'}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section id="upcoming-trips">
        <SectionTitle>Datas de viagem (próximos 7 dias)</SectionTitle>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Comercial (Trip)
        </p>
        {data.travel.commercial.length === 0 && <Empty />}
        <ul className="mb-4 flex flex-col gap-2">
          {data.travel.commercial.map((trip) => (
            <li key={trip.tripId} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
              {trip.destination}: {trip.startDate} → {trip.endDate}
            </li>
          ))}
        </ul>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Operacional (Booking / Saída programada)
        </p>
        {data.travel.operational.length === 0 && <Empty />}
        <ul className="flex flex-col gap-2">
          {data.travel.operational.map((booking) => (
            <li key={booking.bookingId} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
              {booking.originDestination}: {new Date(booking.departureAt).toLocaleString('pt-BR')}
            </li>
          ))}
        </ul>
      </section>

      <section id="sales-this-month">
        <SectionTitle>Vendas do mês</SectionTitle>
        <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
          <div className="font-medium text-slate-900">
            {data.dashboard.salesThisMonthCount}{' '}
            {data.dashboard.salesThisMonthCount === 1 ? 'venda' : 'vendas'}
          </div>
          <div className="text-xs text-slate-500">
            Total:{' '}
            {Number(data.dashboard.salesThisMonthTotal).toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}
          </div>
        </div>
      </section>

      <section id="post-sale">
        <SectionTitle>Pós-venda pendente</SectionTitle>
        {data.postSale.length === 0 && <Empty />}
        <ul className="flex flex-col gap-2">
          {data.postSale.map((candidate) => (
            <PostSaleItem key={candidate.tripId} candidate={candidate} onCreated={load} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-lg font-semibold text-slate-900">{children}</h2>;
}

function Empty() {
  return <p className="mb-3 text-sm text-slate-500">Nada por aqui.</p>;
}

// Manual-only, per brief: never auto-created. Staff must name the
// responsible user id for this follow-up. There is no shared user-picker
// component in the codebase (searchCustomers/QuickSearch cover customers,
// not staff users) -- see SHARED CHANGE REQUEST in the stream report.
// This keeps the id entry as a plain, visible field instead of a blocking
// window.prompt(), without introducing a new cross-vertical component.
function PostSaleItem({
  candidate,
  onCreated,
}: {
  candidate: PostSaleCandidate;
  onCreated: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [assignedUserId, setAssignedUserId] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    const trimmed = assignedUserId.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      await createTask({
        customerId: candidate.customerId,
        assignedUserId: trimmed,
        type: 'POST_SALE',
        title: `Contato pós-venda: ${candidate.destination}`,
        dueAt: new Date().toISOString(),
      });
      onCreated();
    } finally {
      setSaving(false);
      setExpanded(false);
      setAssignedUserId('');
    }
  }

  return (
    <li className="rounded-md border border-slate-200 bg-white p-3 text-sm">
      <div>
        {candidate.destination} — viagem concluída em{' '}
        {new Date(candidate.endDate).toLocaleDateString('pt-BR')}
      </div>
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
        >
          Criar tarefa de pós-venda
        </button>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-slate-500" htmlFor={`assigned-${candidate.tripId}`}>
            ID do responsável
          </label>
          <input
            id={`assigned-${candidate.tripId}`}
            value={assignedUserId}
            onChange={(event) => setAssignedUserId(event.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={saving || assignedUserId.trim().length === 0}
            onClick={() => void submit()}
            className="rounded border border-slate-300 bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Confirmar'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setExpanded(false);
              setAssignedUserId('');
            }}
            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
          >
            Cancelar
          </button>
        </div>
      )}
    </li>
  );
}
