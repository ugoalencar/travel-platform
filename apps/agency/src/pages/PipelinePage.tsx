import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import { Modal } from '../components/ui/modal';
import {
  ApiError,
  createOpportunity,
  createPipeline,
  createPipelineStage,
  listCustomers,
  listOpportunities,
  listPipelineStages,
  listPipelines,
  updateOpportunity,
  type CommercialOpportunity,
  type Pipeline,
  type PipelineStage,
  type PipelineStageColor,
} from '../lib/api';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import type { Customer } from '../types/customer';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'no-pipeline' }
  | {
      status: 'success';
      pipelines: Pipeline[];
      pipeline: Pipeline;
      stages: PipelineStage[];
      opportunities: CommercialOpportunity[];
      customers: Customer[];
    };

const STAGE_COLOR_CLASSES: Record<PipelineStageColor, string> = {
  NEUTRAL: 'border-slate-300 bg-slate-50',
  BLUE: 'border-blue-300 bg-blue-50',
  YELLOW: 'border-yellow-300 bg-yellow-50',
  ORANGE: 'border-orange-300 bg-orange-50',
  RED: 'border-red-300 bg-red-50',
  GREEN: 'border-green-300 bg-green-50',
  PURPLE: 'border-purple-300 bg-purple-50',
};

const STAGE_COLOR_OPTIONS: Array<{ value: PipelineStageColor; label: string }> = [
  { value: 'NEUTRAL', label: 'Neutro' },
  { value: 'BLUE', label: 'Azul' },
  { value: 'YELLOW', label: 'Amarelo' },
  { value: 'ORANGE', label: 'Laranja' },
  { value: 'RED', label: 'Vermelho' },
  { value: 'GREEN', label: 'Verde' },
  { value: 'PURPLE', label: 'Roxo' },
];

// Stage names come from the backend's CommercialStage enum (English,
// fixed at pipeline-seed time -- see 009_configurable_pipelines.sql /
// agency-signup.ts) -- translated for display only, never sent back to
// the API. A custom stage created here already comes in Portuguese, so
// it just falls back to showing its own name unchanged.
const STAGE_NAME_PT: Record<string, string> = {
  PROSPECTING: 'Prospecção',
  INTEREST: 'Interesse',
  QUOTE: 'Orçamento',
  PROPOSAL_SENT: 'Proposta Enviada',
  WAITING_CUSTOMER: 'Aguardando Cliente',
  NEGOTIATION: 'Negociação',
  WON: 'Ganho',
  POST_SALE: 'Pós-venda',
  LOST: 'Perdido',
};

function stageLabel(name: string): string {
  return STAGE_NAME_PT[name] ?? name;
}

const emptyNewOpportunity = { customerId: '', destination: '', expectedValue: '' };
const emptyNewPipeline = { name: '', description: '' };
const emptyNewStage = { name: '', colorKey: 'NEUTRAL' as PipelineStageColor };

export function PipelinePage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [showNewOpportunity, setShowNewOpportunity] = useState(false);
  const [newOpportunity, setNewOpportunity] = useState(emptyNewOpportunity);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  // Requested directly: "a ideia era poder navegar nos pipelines por
  // ambiente e até mesmo criar os próprios pipelines" -- one pipeline per
  // business area (Vendas, Pós-venda, Marketing, ...), switchable here,
  // plus creating new pipelines and custom stages from this page.
  const [showNewPipeline, setShowNewPipeline] = useState(false);
  const [newPipeline, setNewPipeline] = useState(emptyNewPipeline);
  const [pipelineSaving, setPipelineSaving] = useState(false);
  const [pipelineFormError, setPipelineFormError] = useState<string | null>(null);

  const [showNewStage, setShowNewStage] = useState(false);
  const [newStage, setNewStage] = useState(emptyNewStage);
  const [stageSaving, setStageSaving] = useState(false);
  const [stageFormError, setStageFormError] = useState<string | null>(null);

  const load = useCallback((preferredPipelineId?: string) => {
    setState({ status: 'loading' });
    listPipelines()
      .then(async (pipelines) => {
        const pipeline =
          pipelines.find((p) => p.id === preferredPipelineId) ??
          pipelines.find((p) => p.active) ??
          pipelines[0];
        if (!pipeline) {
          setState({ status: 'no-pipeline' });
          return;
        }
        setSelectedPipelineId(pipeline.id);
        const [stages, opportunities, customers] = await Promise.all([
          listPipelineStages(pipeline.id),
          listOpportunities(pipeline.id),
          listCustomers(),
        ]);
        setState({
          status: 'success',
          pipelines,
          pipeline,
          stages: [...stages].sort((a, b) => a.sequence - b.sequence),
          opportunities,
          customers,
        });
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar o pipeline.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const customerName = useMemo(() => {
    if (state.status !== 'success') return (id: string) => id;
    const byId = new Map(state.customers.map((c) => [c.id, c.name]));
    return (id: string) => byId.get(id) ?? id.slice(0, 8);
  }, [state]);

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Pipeline" description="Acompanhe cada oportunidade comercial do primeiro contato até a venda." />
        <LoadingState label="Carregando pipeline…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={() => load()} />;
  }

  const handleCreatePipeline = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPipeline.name.trim()) return;
    setPipelineSaving(true);
    setPipelineFormError(null);
    createPipeline({
      name: newPipeline.name.trim(),
      ...(newPipeline.description.trim() ? { description: newPipeline.description.trim() } : {}),
    })
      .then((pipeline) => {
        setShowNewPipeline(false);
        setNewPipeline(emptyNewPipeline);
        load(pipeline.id);
      })
      .catch((err: unknown) => {
        setPipelineFormError(err instanceof ApiError ? err.message : 'Não foi possível criar o pipeline.');
      })
      .finally(() => setPipelineSaving(false));
  };

  if (state.status === 'no-pipeline') {
    return (
      <div className="space-y-6">
        <PageHeader title="Pipeline" description="Acompanhe cada oportunidade comercial do primeiro contato até a venda." />
        <EmptyState
          title="Nenhum pipeline configurado"
          description="Crie o primeiro pipeline comercial desta agência para começar."
          action={
            <Button size="sm" onClick={() => setShowNewPipeline(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Pipeline
            </Button>
          }
        />
        <Modal open={showNewPipeline} onClose={() => setShowNewPipeline(false)} title="Novo Pipeline">
          <form onSubmit={handleCreatePipeline} className="space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="pl-name">Nome</label>
              <Input
                id="pl-name"
                value={newPipeline.name}
                onChange={(e) => setNewPipeline((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Vendas, Pós-venda, Marketing"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="pl-description">Descrição (opcional)</label>
              <Input
                id="pl-description"
                value={newPipeline.description}
                onChange={(e) => setNewPipeline((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            {pipelineFormError ? <p className="text-sm text-destructive">{pipelineFormError}</p> : null}
            <Button type="submit" size="sm" disabled={pipelineSaving}>
              {pipelineSaving ? 'Criando…' : 'Criar Pipeline'}
            </Button>
          </form>
        </Modal>
      </div>
    );
  }

  const { pipelines, pipeline, stages, opportunities, customers } = state;
  const byStage = new Map<string, CommercialOpportunity[]>();
  for (const stage of stages) byStage.set(stage.id, []);
  for (const opp of opportunities) {
    const list = byStage.get(opp.stageId);
    if (list) list.push(opp);
  }
  const stageIndex = new Map(stages.map((s, i) => [s.id, i]));

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOpportunity.customerId || !stages[0]) return;
    setSaving(true);
    setFormError(null);
    createOpportunity({
      customerId: newOpportunity.customerId,
      pipelineId: pipeline.id,
      stageId: stages[0].id,
      ...(newOpportunity.destination.trim() ? { destination: newOpportunity.destination.trim() } : {}),
      ...(newOpportunity.expectedValue ? { expectedValue: Number(newOpportunity.expectedValue) } : {}),
    })
      .then(() => {
        setShowNewOpportunity(false);
        setNewOpportunity(emptyNewOpportunity);
        load(pipeline.id);
      })
      .catch((err: unknown) => {
        setFormError(err instanceof ApiError ? err.message : 'Não foi possível criar a oportunidade.');
      })
      .finally(() => setSaving(false));
  };

  const handleMove = (opportunityId: string, stageId: string) => {
    setMovingId(opportunityId);
    updateOpportunity(opportunityId, { stageId })
      .then(() => load(pipeline.id))
      .catch(() => undefined)
      .finally(() => setMovingId(null));
  };

  const handleAdvance = (opp: CommercialOpportunity) => {
    const index = stageIndex.get(opp.stageId) ?? -1;
    const next = stages[index + 1];
    if (!next) return;
    handleMove(opp.id, next.id);
  };

  const handleCreateStage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStage.name.trim()) return;
    setStageSaving(true);
    setStageFormError(null);
    const nextSequence = stages.reduce((max, s) => Math.max(max, s.sequence), 0) + 1;
    createPipelineStage(pipeline.id, {
      name: newStage.name.trim(),
      sequence: nextSequence,
      colorKey: newStage.colorKey,
    })
      .then(() => {
        setShowNewStage(false);
        setNewStage(emptyNewStage);
        load(pipeline.id);
      })
      .catch((err: unknown) => {
        setStageFormError(err instanceof ApiError ? err.message : 'Não foi possível criar a etapa.');
      })
      .finally(() => setStageSaving(false));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        description="Acompanhe cada oportunidade do primeiro contato até a venda, num só lugar."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Pipeline' }]}
        actions={
          <Button size="sm" onClick={() => setShowNewOpportunity(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Oportunidade
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="pipeline-select">
          Ambiente
        </label>
        <Select
          id="pipeline-select"
          className="w-56"
          value={selectedPipelineId ?? pipeline.id}
          onChange={(e) => load(e.target.value)}
        >
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        <Button size="sm" variant="outline" onClick={() => setShowNewPipeline(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Pipeline
        </Button>
        {pipeline.description ? (
          <span className="text-sm text-slate-500">{pipeline.description}</span>
        ) : null}
      </div>

      {stages.length === 0 ? (
        <EmptyState
          title="Este pipeline ainda não tem etapas"
          description="Crie a primeira etapa para começar a montar o funil."
          action={
            <Button size="sm" onClick={() => setShowNewStage(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Etapa
            </Button>
          }
        />
      ) : opportunities.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title="Nenhuma oportunidade neste pipeline"
            description="Crie uma oportunidade para começar a acompanhar o funil comercial."
            action={
              <Button size="sm" onClick={() => setShowNewOpportunity(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Oportunidade
              </Button>
            }
          />
          <Button type="button" variant="outline" onClick={() => setShowNewStage(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Etapa
          </Button>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const stageOpportunities = byStage.get(stage.id) ?? [];
            const isLastStage = (stageIndex.get(stage.id) ?? -1) === stages.length - 1;
            return (
              <div
                key={stage.id}
                className={`flex w-72 shrink-0 flex-col gap-3 rounded-lg p-1 transition-colors ${
                  dragOverStageId === stage.id ? 'bg-slate-200/60' : ''
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverStageId(stage.id);
                }}
                onDragLeave={() => setDragOverStageId((current) => (current === stage.id ? null : current))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverStageId(null);
                  const opportunityId = e.dataTransfer.getData('text/plain');
                  if (opportunityId) handleMove(opportunityId, stage.id);
                }}
              >
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-semibold text-slate-700">{stageLabel(stage.name)}</h3>
                  <span className="text-xs font-medium text-slate-400">{stageOpportunities.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {stageOpportunities.map((opp) => (
                    <div
                      key={opp.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', opp.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      className={`cursor-grab rounded-lg border p-3 shadow-sm active:cursor-grabbing ${STAGE_COLOR_CLASSES[stage.colorKey]} ${
                        movingId === opp.id ? 'opacity-50' : ''
                      }`}
                    >
                      <p className="text-sm font-semibold text-slate-900">{customerName(opp.customerId)}</p>
                      {opp.destination ? (
                        <p className="text-xs text-slate-600">{opp.destination}</p>
                      ) : null}
                      {opp.expectedValue !== undefined ? (
                        <p className="mt-1 text-sm font-medium text-slate-800">{formatBRL(opp.expectedValue)}</p>
                      ) : null}
                      {opp.nextActionAt ? (
                        <p className="mt-1 text-xs text-slate-500">
                          Próxima ação: {formatDateBR(opp.nextActionAt, { includeTime: true })}
                        </p>
                      ) : null}
                      <div className="mt-2 flex items-center gap-2">
                        <Select
                          className="h-8 flex-1 text-xs"
                          value={stage.id}
                          disabled={movingId === opp.id}
                          onChange={(e) => handleMove(opp.id, e.target.value)}
                        >
                          {stages.map((s) => (
                            <option key={s.id} value={s.id}>{stageLabel(s.name)}</option>
                          ))}
                        </Select>
                        {!isLastStage ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 shrink-0 p-0"
                            disabled={movingId === opp.id}
                            title="Avançar para a próxima etapa"
                            onClick={() => handleAdvance(opp)}
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="flex w-56 shrink-0 flex-col gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-full min-h-24 border-dashed text-slate-500"
              onClick={() => setShowNewStage(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nova Etapa
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={showNewOpportunity}
        onClose={() => setShowNewOpportunity(false)}
        title="Nova Oportunidade"
      >
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="opp-customer">Cliente</label>
            <Select
              id="opp-customer"
              value={newOpportunity.customerId}
              onChange={(e) => setNewOpportunity((f) => ({ ...f, customerId: e.target.value }))}
              required
            >
              <option value="">Selecione</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="opp-destination">Destino (opcional)</label>
            <Input
              id="opp-destination"
              value={newOpportunity.destination}
              onChange={(e) => setNewOpportunity((f) => ({ ...f, destination: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="opp-value">Valor esperado (R$, opcional)</label>
            <Input
              id="opp-value"
              type="number"
              step="0.01"
              value={newOpportunity.expectedValue}
              onChange={(e) => setNewOpportunity((f) => ({ ...f, expectedValue: e.target.value }))}
            />
          </div>
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Criando…' : 'Criar Oportunidade'}
          </Button>
        </form>
      </Modal>

      <Modal open={showNewPipeline} onClose={() => setShowNewPipeline(false)} title="Novo Pipeline">
        <form onSubmit={handleCreatePipeline} className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="pl-name-2">Nome</label>
            <Input
              id="pl-name-2"
              value={newPipeline.name}
              onChange={(e) => setNewPipeline((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex.: Vendas, Pós-venda, Marketing"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="pl-description-2">Descrição (opcional)</label>
            <Input
              id="pl-description-2"
              value={newPipeline.description}
              onChange={(e) => setNewPipeline((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <p className="text-xs text-slate-500">
            O pipeline começa sem etapas — use "Nova Etapa" dentro dele para montar o funil do seu jeito.
          </p>
          {pipelineFormError ? <p className="text-sm text-destructive">{pipelineFormError}</p> : null}
          <Button type="submit" size="sm" disabled={pipelineSaving}>
            {pipelineSaving ? 'Criando…' : 'Criar Pipeline'}
          </Button>
        </form>
      </Modal>

      <Modal open={showNewStage} onClose={() => setShowNewStage(false)} title="Nova Etapa">
        <form onSubmit={handleCreateStage} className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="stage-name">Nome</label>
            <Input
              id="stage-name"
              value={newStage.name}
              onChange={(e) => setNewStage((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex.: Qualificação, Fechamento"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="stage-color">Cor</label>
            <Select
              id="stage-color"
              value={newStage.colorKey}
              onChange={(e) => setNewStage((f) => ({ ...f, colorKey: e.target.value as PipelineStageColor }))}
            >
              {STAGE_COLOR_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </div>
          {stageFormError ? <p className="text-sm text-destructive">{stageFormError}</p> : null}
          <Button type="submit" size="sm" disabled={stageSaving}>
            {stageSaving ? 'Criando…' : 'Criar Etapa'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
