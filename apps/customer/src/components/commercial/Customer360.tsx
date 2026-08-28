import { useEffect, useState } from 'react';
import {
  listBookings,
  listProposals,
  listReceivables,
  listSales,
  listTrips,
  listWishes,
} from '../../lib/api';
import type { Booking } from '../../types/booking';
import type { Receivable } from '../../types/financial';
import {
  listInteractions,
  listOpportunities,
  listPipelines,
  listStages,
  listTasks,
} from '../../lib/commercialApi';
import type { Proposal } from '../../types/proposal';
import type { Sale } from '../../types/sale';
import type { Trip } from '../../types/trip';
import type { Wish } from '../../types/wish';
import {
  STAGE_COLOR_CLASSES,
  type CommercialOpportunity,
  type CommercialTask,
  type CustomerInteraction,
  type PipelineStageColor,
} from '../../types/commercial';

interface Customer360Data {
  wishes: Wish[];
  proposals: Proposal[];
  sales: Sale[];
  bookings: Booking[];
  receivables: Receivable[] | null;
  trips: Trip[];
  opportunities: CommercialOpportunity[];
  interactions: CustomerInteraction[];
  tasks: CommercialTask[];
  // pipelineId -> name / stageId -> name lookups, so each opportunity can
  // be labeled with its pipeline + stage even though a customer can have
  // opportunities across several different pipelines.
  pipelineNames: Record<string, string>;
  stageNames: Record<string, string>;
  // stageId -> the stage's admin-configured colorKey, so each opportunity
  // row can carry the same fixed-token color badge used in the Kanban
  // board and pipeline config UI (STAGE_COLOR_CLASSES), instead of only
  // plain text -- see PipelineStage.colorKey.
  stageColors: Record<string, PipelineStageColor>;
}

// Read aggregation only -- no data is duplicated/stored here, every
// section is fetched live and scoped to this one customer. Opportunities/
// interactions/tasks are server-side filtered by customerId (the new
// commercial endpoints support it); wishes/proposals/trips reuse the
// existing agency-wide list endpoints (no customerId filter exists yet
// on those pre-existing routes) and are filtered client-side here purely
// for display -- a known limitation flagged in the delivery report, not a
// new server-side filtering capability this page invents. Financial data
// is shown only when the existing financial route authorizes the caller.
export function Customer360({ customerId }: { customerId: string }) {
  const [data, setData] = useState<Customer360Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      listWishes(),
      listProposals(),
      listSales(),
      listBookings(),
      listReceivables().catch(() => null),
      listTrips(),
      listOpportunities({ customerId }),
      listInteractions(customerId),
      listTasks({ customerId }),
      listPipelines(),
    ])
      .then(
        async ([
          wishes,
          proposals,
          sales,
          bookings,
          receivables,
          trips,
          opportunitiesResult,
          interactionsResult,
          tasksResult,
          pipelines,
        ]) => {
          if (cancelled) return;

          const pipelineNames: Record<string, string> = {};
          for (const p of pipelines) pipelineNames[p.id] = p.name;

          // Fetch stages only for the pipelines this customer's
          // opportunities actually reference, to label each card with its
          // stage name (a customer can have opportunities across several
          // different pipelines -- each is labeled with its own pipeline).
          const relevantPipelineIds = Array.from(
            new Set(opportunitiesResult.opportunities.map((o) => o.pipelineId)),
          );
          const stageLists = await Promise.all(relevantPipelineIds.map((id) => listStages(id).catch(() => [])));
          const stageNames: Record<string, string> = {};
          const stageColors: Record<string, PipelineStageColor> = {};
          for (const stages of stageLists) {
            for (const stage of stages) {
              stageNames[stage.id] = stage.name;
              stageColors[stage.id] = stage.colorKey;
            }
          }

          if (cancelled) return;
          setData({
            wishes: wishes.filter((w) => w.customerId === customerId),
            proposals: proposals.filter((p) => p.customerId === customerId),
            sales: sales.filter((s) => s.customerId === customerId),
            bookings: bookings.filter((b) => b.bookerCustomerId === customerId),
            receivables: receivables?.filter((r) => r.customerId === customerId) ?? null,
            trips: trips.filter((t) => t.customerId === customerId),
            opportunities: opportunitiesResult.opportunities,
            interactions: interactionsResult.interactions,
            tasks: tasksResult.tasks,
            pipelineNames,
            stageNames,
            stageColors,
          });
        },
      )
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar o histórico do cliente.');
      });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-slate-500">Carregando histórico do cliente...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <AtAGlance data={data} />

      <Section title="Oportunidades comerciais">
        {data.opportunities.length === 0 && <Empty />}
        {data.opportunities.map((o) => {
          const colorKey = data.stageColors[o.stageId];
          return (
            <Row key={o.id}>
              <span className="font-medium text-slate-900">
                {data.pipelineNames[o.pipelineId] ?? 'Pipeline'}
              </span>{' '}
              —{' '}
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                  colorKey ? STAGE_COLOR_CLASSES[colorKey] : 'bg-slate-100 text-slate-700 border-slate-300'
                }`}
              >
                {data.stageNames[o.stageId] ?? 'Etapa'}
              </span>{' '}
              — {o.destination ?? 'sem destino'}
            </Row>
          );
        })}
      </Section>

      <Section title="Desejos (Wishes)">
        {data.wishes.length === 0 && <Empty />}
        {data.wishes.map((w) => (
          <Row key={w.id}>
            <a href={`/wishes/${w.id}`} className="text-blue-600 hover:underline">
              {w.destination ?? 'sem destino'}
            </a>{' '}
            — {w.status}
          </Row>
        ))}
      </Section>

      <Section title="Propostas">
        {data.proposals.length === 0 && <Empty />}
        {data.proposals.map((p) => (
          <Row key={p.id}>
            <a href={`/proposals/${p.id}`} className="text-blue-600 hover:underline">
              Proposta {p.id.slice(0, 8)}
            </a>{' '}
            — {p.status} — {p.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </Row>
        ))}
      </Section>

      <Section title="Vendas">
        {data.sales.length === 0 && <Empty />}
        {data.sales.map((s) => (
          <Row key={s.id}>
            <a href={`/sales/${s.id}`} className="text-blue-600 hover:underline">
              Venda {s.id.slice(0, 8)}
            </a>{' '}
            â€” {s.status} â€” {s.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </Row>
        ))}
      </Section>

      <Section title="Reservas">
        {data.bookings.length === 0 && <Empty />}
        {data.bookings.map((b) => (
          <Row key={b.id}>
            <a href={`/bookings/${b.id}`} className="text-blue-600 hover:underline">
              Reserva {b.id.slice(0, 8)}
            </a>{' '}
            â€” {b.tripType} â€” {b.cancelled ? 'cancelada' : 'ativa'}
          </Row>
        ))}
      </Section>

      {data.receivables !== null && (
        <Section title="Financeiro autorizado">
          {data.receivables.length === 0 && <Empty />}
          {data.receivables.map((r) => (
            <Row key={r.id}>
              {r.description} â€” {r.status} â€”{' '}
              {r.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </Row>
          ))}
        </Section>
      )}

      <Section title="Viagens (Trips)">
        {data.trips.length === 0 && <Empty />}
        {data.trips.map((t) => (
          <Row key={t.id}>
            <a href={`/trips/${t.id}`} className="text-blue-600 hover:underline">
              {t.destination}
            </a>{' '}
            — {t.status} — {t.startDate} → {t.endDate}
          </Row>
        ))}
      </Section>

      <Section title="Interações">
        {data.interactions.length === 0 && <Empty />}
        {data.interactions.map((i) => (
          <Row key={i.id}>
            [{i.channel}/{i.direction}] {i.summary} —{' '}
            {new Date(i.occurredAt).toLocaleString('pt-BR')}
          </Row>
        ))}
      </Section>

      <Section title="Tarefas / retornos">
        {data.tasks.length === 0 && <Empty />}
        {data.tasks.map((t) => (
          <Row key={t.id}>
            {t.title} — vence {new Date(t.dueAt).toLocaleString('pt-BR')}
            {t.completedAt ? ' (concluída)' : ''}
          </Row>
        ))}
      </Section>
    </div>
  );
}

// Additive "at a glance" summary, derived entirely from data this page
// already fetched (no new requests, no new fields, nothing beyond what the
// existing sections below already have permission to show). Every value is
// either a real record or an explicit "—", never invented.
function AtAGlance({ data }: { data: Customer360Data }) {
  const openTasks = data.tasks
    .filter((t) => !t.completedAt)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const nextFollowUp = openTasks[0] ?? null;

  const lastInteraction = [...data.interactions].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  )[0] ?? null;

  const nextOpportunityAction = data.opportunities
    .filter((o) => o.nextActionAt)
    .sort(
      (a, b) => new Date(a.nextActionAt as string).getTime() - new Date(b.nextActionAt as string).getTime(),
    )[0] ?? null;

  const currentSale = [...data.sales].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0] ?? null;

  const currentProposal = currentSale
    ? null
    : [...data.proposals]
        .filter((p) => p.status === 'DRAFT' || p.status === 'SENT')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;

  const nextAction = nextFollowUp
    ? `${nextFollowUp.title} — ${new Date(nextFollowUp.dueAt).toLocaleString('pt-BR')}`
    : nextOpportunityAction
      ? `Ação na oportunidade — ${new Date(nextOpportunityAction.nextActionAt as string).toLocaleString('pt-BR')}`
      : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Resumo</h3>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <GlanceItem label="Próxima ação" value={nextAction} />
        <GlanceItem
          label="Última interação"
          value={
            lastInteraction
              ? `${lastInteraction.summary} — ${new Date(lastInteraction.occurredAt).toLocaleDateString('pt-BR')}`
              : null
          }
        />
        <GlanceItem
          label="Próximo retorno"
          value={
            nextFollowUp ? new Date(nextFollowUp.dueAt).toLocaleString('pt-BR') : null
          }
        />
        <GlanceItem
          label="Contexto atual"
          value={
            currentSale
              ? `Venda ${currentSale.status} — ${currentSale.total.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}`
              : currentProposal
                ? `Proposta ${currentProposal.status} — ${currentProposal.total.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}`
                : null
          }
        />
      </dl>
    </div>
  );
}

function GlanceItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-900">{value ?? '—'}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="flex flex-col gap-1 text-sm text-slate-700">{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="border-b border-slate-100 py-1 last:border-0">{children}</div>;
}

function Empty() {
  return <p className="text-sm text-slate-500">Nada por aqui.</p>;
}
