import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import {
  createInteraction,
  createTask,
  listOpportunities,
  updateOpportunity,
} from '../../lib/commercialApi';
import {
  COMMERCIAL_STAGES,
  STAGE_LABELS,
  type CommercialOpportunity,
  type CommercialStage,
} from '../../types/commercial';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; opportunities: CommercialOpportunity[] };

const QUICK_FILTER_BUTTONS: Array<{ label: string; param: string; value: string }> = [
  { label: 'Retornos atrasados', param: 'overdue', value: 'true' },
  { label: 'Sem próxima ação', param: 'hasNextAction', value: 'false' },
  { label: 'Com proposta', param: 'hasProposal', value: 'true' },
  { label: 'Com venda', param: 'hasSale', value: 'true' },
];

// Kanban stage lives ONLY on CommercialOpportunity.stage -- dragging a
// card here PATCHes /commercial/opportunities/:id { stage }, never
// touching Proposal.status or Sale.status.
export function CommercialPipelinePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  const [actionFor, setActionFor] = useState<{ id: string; kind: 'interaction' | 'task' } | null>(
    null,
  );

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    const filters: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      filters[key] = value;
    }
    listOpportunities(filters)
      .then(({ opportunities }) => setState({ status: 'success', opportunities }))
      .catch((error: unknown) => {
        setState({
          status: 'error',
          message: error instanceof ApiError ? error.message : 'Não foi possível carregar o pipeline.',
        });
      });
  }, [searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  async function moveToStage(id: string, stage: CommercialStage) {
    await updateOpportunity(id, { stage });
    load();
  }

  function toggleQuickFilter(param: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (next.get(param) === value) {
      next.delete(param);
    } else {
      next.set(param, value);
    }
    setSearchParams(next);
  }

  if (state.status === 'loading') {
    return <p className="text-sm text-slate-500">Carregando pipeline...</p>;
  }
  if (state.status === 'error') {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {state.message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Pipeline Comercial</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_FILTER_BUTTONS.map((filter) => {
          const active = searchParams.get(filter.param) === filter.value;
          return (
            <button
              key={filter.label}
              type="button"
              onClick={() => toggleQuickFilter(filter.param, filter.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                active
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {isNarrow ? (
        <MobileStageList
          opportunities={state.opportunities}
          onMove={(id, stage) => void moveToStage(id, stage)}
          onAction={setActionFor}
        />
      ) : (
        <KanbanBoard
          opportunities={state.opportunities}
          onMove={(id, stage) => void moveToStage(id, stage)}
          onAction={setActionFor}
        />
      )}

      {actionFor && (
        <QuickActionForm
          opportunityId={actionFor.id}
          kind={actionFor.kind}
          onClose={() => setActionFor(null)}
          onDone={() => {
            setActionFor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function KanbanBoard({
  opportunities,
  onMove,
  onAction,
}: {
  opportunities: CommercialOpportunity[];
  onMove: (id: string, stage: CommercialStage) => void;
  onAction: (value: { id: string; kind: 'interaction' | 'task' }) => void;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {COMMERCIAL_STAGES.map((stage) => (
        <div
          key={stage}
          className="flex w-64 shrink-0 flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const id = event.dataTransfer.getData('text/opportunity-id');
            if (id) onMove(id, stage);
          }}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {STAGE_LABELS[stage]}
          </div>
          {opportunities
            .filter((o) => o.stage === stage)
            .map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                opportunity={opportunity}
                draggable
                onAction={onAction}
              />
            ))}
        </div>
      ))}
    </div>
  );
}

function MobileStageList({
  opportunities,
  onMove,
  onAction,
}: {
  opportunities: CommercialOpportunity[];
  onMove: (id: string, stage: CommercialStage) => void;
  onAction: (value: { id: string; kind: 'interaction' | 'task' }) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {opportunities.map((opportunity) => (
        <div key={opportunity.id} className="rounded-lg border border-slate-200 bg-white p-3">
          <OpportunityCard opportunity={opportunity} draggable={false} onAction={onAction} />
          <label className="mt-2 block text-xs font-medium text-slate-500">
            Etapa
            <select
              value={opportunity.stage}
              onChange={(event) => onMove(opportunity.id, event.target.value as CommercialStage)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {COMMERCIAL_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </option>
              ))}
            </select>
          </label>
        </div>
      ))}
      {opportunities.length === 0 && (
        <p className="text-sm text-slate-500">Nenhuma oportunidade encontrada para este filtro.</p>
      )}
    </div>
  );
}

function OpportunityCard({
  opportunity,
  draggable,
  onAction,
}: {
  opportunity: CommercialOpportunity;
  draggable: boolean;
  onAction: (value: { id: string; kind: 'interaction' | 'task' }) => void;
}) {
  return (
    <div
      className="rounded-md border border-slate-200 bg-white p-2 text-sm shadow-sm"
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/opportunity-id', opportunity.id);
      }}
    >
      <a href={`/customers/${opportunity.customerId}`} className="font-medium text-slate-900 hover:underline">
        Cliente {opportunity.customerId.slice(0, 8)}
      </a>
      <div className="mt-1 text-xs text-slate-500">{opportunity.destination ?? 'Sem destino'}</div>
      <div className="text-xs text-slate-500">
        {opportunity.tripDateFrom ?? '—'} → {opportunity.tripDateTo ?? '—'}
      </div>
      {opportunity.expectedValue !== undefined && (
        <div className="text-xs text-slate-500">
          Valor esperado: {opportunity.expectedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </div>
      )}
      {opportunity.proposalId && (
        <a
          href={`/proposals/${opportunity.proposalId}`}
          className="text-xs text-blue-600 hover:underline"
        >
          Ver proposta
        </a>
      )}
      {opportunity.nextActionAt && (
        <div className="text-xs text-amber-700">
          Próxima ação: {new Date(opportunity.nextActionAt).toLocaleString('pt-BR')}
        </div>
      )}
      {opportunity.lastInteractionAt && (
        <div className="text-xs text-slate-400">
          Última interação: {new Date(opportunity.lastInteractionAt).toLocaleDateString('pt-BR')}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => onAction({ id: opportunity.id, kind: 'interaction' })}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
        >
          Registrar interação
        </button>
        <button
          type="button"
          onClick={() => onAction({ id: opportunity.id, kind: 'task' })}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
        >
          Agendar retorno
        </button>
      </div>
    </div>
  );
}

function QuickActionForm({
  opportunityId,
  kind,
  onClose,
  onDone,
}: {
  opportunityId: string;
  kind: 'interaction' | 'task';
  onClose: () => void;
  onDone: () => void;
}) {
  const [summary, setSummary] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      if (kind === 'interaction') {
        await createInteraction({
          customerId,
          opportunityId,
          channel: 'PHONE',
          direction: 'OUTBOUND',
          summary,
        });
      } else {
        await createTask({
          customerId,
          opportunityId,
          assignedUserId,
          title: summary,
          dueAt,
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-slate-900">
          {kind === 'interaction' ? 'Registrar interação' : 'Agendar retorno'}
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-500">
            ID do cliente
            <input
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          {kind === 'task' && (
            <label className="text-xs font-medium text-slate-500">
              ID do responsável
              <input
                value={assignedUserId}
                onChange={(event) => setAssignedUserId(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
          )}
          {kind === 'task' && (
            <label className="text-xs font-medium text-slate-500">
              Data/hora do retorno
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
          )}
          <label className="text-xs font-medium text-slate-500">
            {kind === 'interaction' ? 'Resumo da interação' : 'Título do retorno'}
            <textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
