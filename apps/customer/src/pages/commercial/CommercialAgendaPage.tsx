import { useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import {
  createTask,
  getPostSaleCandidates,
  getProposalsWaiting,
  listTasks,
  travelSearch,
  updateTask,
  type PostSaleCandidate,
  type ProposalWaiting,
} from '../../lib/commercialApi';
import type { CommercialTask, TravelSearchResult } from '../../types/commercial';

interface AgendaData {
  followUps: CommercialTask[];
  proposalsWaiting: ProposalWaiting[];
  travel: TravelSearchResult;
  postSale: PostSaleCandidate[];
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
    ])
      .then(([tasksResult, proposalsWaiting, travel, postSale]) => {
        setState({
          status: 'success',
          data: { followUps: tasksResult.tasks, proposalsWaiting, travel, postSale },
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
        <p className="text-sm text-slate-500">Veja os totais reais no Painel Comercial.</p>
      </section>

      <section id="post-sale">
        <SectionTitle>Pós-venda pendente</SectionTitle>
        {data.postSale.length === 0 && <Empty />}
        <ul className="flex flex-col gap-2">
          {data.postSale.map((candidate) => (
            <li key={candidate.tripId} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
              <div>
                {candidate.destination} — viagem concluída em{' '}
                {new Date(candidate.endDate).toLocaleDateString('pt-BR')}
              </div>
              <button
                type="button"
                onClick={() => {
                  // Manual-only, per brief: never auto-created. Staff must
                  // name the responsible user id for this follow-up.
                  const assignedUserId = window.prompt('ID do responsável por este contato pós-venda:');
                  if (!assignedUserId) return;
                  void createTask({
                    customerId: candidate.customerId,
                    assignedUserId,
                    type: 'POST_SALE',
                    title: `Contato pós-venda: ${candidate.destination}`,
                    dueAt: new Date().toISOString(),
                  }).then(load);
                }}
                className="mt-1 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
              >
                Criar tarefa de pós-venda
              </button>
            </li>
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
