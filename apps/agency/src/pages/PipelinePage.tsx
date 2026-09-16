import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
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

const emptyNewOpportunity = { customerId: '', destination: '', expectedValue: '' };

export function PipelinePage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showNewOpportunity, setShowNewOpportunity] = useState(false);
  const [newOpportunity, setNewOpportunity] = useState(emptyNewOpportunity);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    listPipelines()
      .then(async (pipelines) => {
        const pipeline = pipelines.find((p) => p.active) ?? pipelines[0];
        if (!pipeline) {
          setState({ status: 'no-pipeline' });
          return;
        }
        const [stages, opportunities, customers] = await Promise.all([
          listPipelineStages(pipeline.id),
          listOpportunities(pipeline.id),
          listCustomers(),
        ]);
        setState({
          status: 'success',
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
    return <ErrorState description={state.message} onRetry={load} />;
  }

  if (state.status === 'no-pipeline') {
    return (
      <div>
        <PageHeader title="Pipeline" description="Acompanhe cada oportunidade comercial do primeiro contato até a venda." />
        <EmptyState
          title="Nenhum pipeline configurado"
          description="Esta agência ainda não tem um pipeline comercial. Fale com o suporte para configurá-lo."
        />
      </div>
    );
  }

  const { pipeline, stages, opportunities, customers } = state;
  const byStage = new Map<string, CommercialOpportunity[]>();
  for (const stage of stages) byStage.set(stage.id, []);
  for (const opp of opportunities) {
    const list = byStage.get(opp.stageId);
    if (list) list.push(opp);
  }

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
        load();
      })
      .catch((err: unknown) => {
        setFormError(err instanceof ApiError ? err.message : 'Não foi possível criar a oportunidade.');
      })
      .finally(() => setSaving(false));
  };

  const handleMove = (opportunityId: string, stageId: string) => {
    setMovingId(opportunityId);
    updateOpportunity(opportunityId, { stageId })
      .then(() => load())
      .catch(() => undefined)
      .finally(() => setMovingId(null));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        description={`${pipeline.name} — acompanhe cada oportunidade do primeiro contato até a venda, num só lugar.`}
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Pipeline' }]}
        actions={
          <Button size="sm" onClick={() => setShowNewOpportunity(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Oportunidade
          </Button>
        }
      />

      {opportunities.length === 0 ? (
        <EmptyState
          title="Nenhuma oportunidade no pipeline"
          description="Crie uma oportunidade para começar a acompanhar o funil comercial."
          action={
            <Button size="sm" onClick={() => setShowNewOpportunity(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Oportunidade
            </Button>
          }
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const stageOpportunities = byStage.get(stage.id) ?? [];
            return (
              <div key={stage.id} className="flex w-72 shrink-0 flex-col gap-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-semibold text-slate-700">{stage.name}</h3>
                  <span className="text-xs font-medium text-slate-400">{stageOpportunities.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {stageOpportunities.map((opp) => (
                    <div
                      key={opp.id}
                      className={`rounded-lg border p-3 shadow-sm ${STAGE_COLOR_CLASSES[stage.colorKey]}`}
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
                      <Select
                        className="mt-2 h-8 text-xs"
                        value={stage.id}
                        disabled={movingId === opp.id}
                        onChange={(e) => handleMove(opp.id, e.target.value)}
                      >
                        {stages.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
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
    </div>
  );
}
