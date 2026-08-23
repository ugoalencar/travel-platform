import { useEffect, useState } from 'react';
import { listProposals, listTrips, listWishes } from '../../lib/api';
import { listInteractions, listOpportunities, listTasks } from '../../lib/commercialApi';
import type { Proposal } from '../../types/proposal';
import type { Trip } from '../../types/trip';
import type { Wish } from '../../types/wish';
import type { CommercialOpportunity, CommercialTask, CustomerInteraction } from '../../types/commercial';

interface Customer360Data {
  wishes: Wish[];
  proposals: Proposal[];
  trips: Trip[];
  opportunities: CommercialOpportunity[];
  interactions: CustomerInteraction[];
  tasks: CommercialTask[];
}

// Read aggregation only -- no data is duplicated/stored here, every
// section is fetched live and scoped to this one customer. Opportunities/
// interactions/tasks are server-side filtered by customerId (the new
// commercial endpoints support it); wishes/proposals/trips reuse the
// existing agency-wide list endpoints (no customerId filter exists yet
// on those pre-existing routes) and are filtered client-side here purely
// for display -- a known limitation flagged in the delivery report, not a
// new server-side filtering capability this page invents.
// Sale has no staff-facing list route in this codebase today (read-only/
// unmanaged, per ADR) -- no Sales section is possible to add here without
// inventing a new sales route, which is out of scope for this vertical.
export function Customer360({ customerId }: { customerId: string }) {
  const [data, setData] = useState<Customer360Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      listWishes(),
      listProposals(),
      listTrips(),
      listOpportunities({ customerId }),
      listInteractions(customerId),
      listTasks({ customerId }),
    ])
      .then(([wishes, proposals, trips, opportunitiesResult, interactionsResult, tasksResult]) => {
        if (cancelled) return;
        setData({
          wishes: wishes.filter((w) => w.customerId === customerId),
          proposals: proposals.filter((p) => p.customerId === customerId),
          trips: trips.filter((t) => t.customerId === customerId),
          opportunities: opportunitiesResult.opportunities,
          interactions: interactionsResult.interactions,
          tasks: tasksResult.tasks,
        });
      })
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
      <Section title="Oportunidades comerciais">
        {data.opportunities.length === 0 && <Empty />}
        {data.opportunities.map((o) => (
          <Row key={o.id}>
            {o.stage} — {o.destination ?? 'sem destino'}
          </Row>
        ))}
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
