import { useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import {
  createPipeline,
  createStage,
  grantPipelineAccess,
  listPipelineAccess,
  listPipelines,
  listStages,
  revokePipelineAccess,
  updatePipeline,
  updateStage,
} from '../../lib/commercialApi';
import {
  PIPELINE_STAGE_COLORS,
  STAGE_COLOR_CLASSES,
  type Pipeline,
  type PipelineAccess,
  type PipelineStage,
  type PipelineStageColor,
  type PipelineStageVisualLevel,
} from '../../types/commercial';

// Admin-only "Configurações → Pipelines" area (see Sidebar.tsx). Every
// write here requires ADMIN/OWNER server-side (requirePipelineAdmin() in
// pipeline-config.ts) -- this page has no client-side role check of its
// own; a non-admin who reaches it simply gets 403s back from every
// mutation, same as any other route in this codebase.
export function PipelineConfigPage() {
  const [pipelines, setPipelines] = useState<Pipeline[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPipelineName, setNewPipelineName] = useState('');

  function reload() {
    listPipelines()
      .then((list) => {
        setPipelines(list);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os pipelines.');
      });
  }

  useEffect(reload, []);

  async function handleCreatePipeline() {
    if (!newPipelineName.trim()) return;
    try {
      await createPipeline({ name: newPipelineName.trim() });
      setNewPipelineName('');
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o pipeline.');
    }
  }

  async function handleToggleActive(pipeline: Pipeline) {
    try {
      await updatePipeline(pipeline.id, { active: !pipeline.active });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível atualizar o pipeline.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Configurações → Pipelines</h1>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Pipelines</h2>
        <div className="flex flex-col gap-2">
          {pipelines === null && <p className="text-sm text-slate-500">Carregando...</p>}
          {pipelines?.map((p) => (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                p.id === selectedId ? 'border-slate-900' : 'border-slate-200'
              }`}
            >
              <button type="button" onClick={() => setSelectedId(p.id)} className="text-left font-medium text-slate-900">
                {p.name} {!p.active && <span className="text-xs text-slate-400">(inativo)</span>}
              </button>
              <button
                type="button"
                onClick={() => void handleToggleActive(p)}
                className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
              >
                {p.active ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={newPipelineName}
            onChange={(event) => setNewPipelineName(event.target.value)}
            placeholder="Nome do novo pipeline"
            className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => void handleCreatePipeline()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white"
          >
            Criar pipeline
          </button>
        </div>
      </div>

      {selectedId && <PipelineDetail pipelineId={selectedId} onChanged={reload} />}
    </div>
  );
}

function PipelineDetail({ pipelineId, onChanged }: { pipelineId: string; onChanged: () => void }) {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [access, setAccess] = useState<PipelineAccess[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState<PipelineStageColor>('NEUTRAL');
  const [newUserId, setNewUserId] = useState('');

  function reload() {
    listStages(pipelineId)
      .then(setStages)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Erro ao carregar etapas.'));
    listPipelineAccess(pipelineId)
      .then(setAccess)
      .catch(() => setAccess([]));
  }

  useEffect(reload, [pipelineId]);

  async function handleCreateStage() {
    if (!newStageName.trim()) return;
    try {
      await createStage(pipelineId, {
        name: newStageName.trim(),
        sequence: stages.length + 1,
        colorToken: newStageColor,
      });
      setNewStageName('');
      reload();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a etapa.');
    }
  }

  async function handleStageColor(stage: PipelineStage, colorToken: PipelineStageColor) {
    try {
      await updateStage(pipelineId, stage.id, { colorToken });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível atualizar a cor da etapa.');
    }
  }

  async function handleStageVisualLevel(stage: PipelineStage, visualLevel: PipelineStageVisualLevel) {
    try {
      await updateStage(pipelineId, stage.id, { visualLevel });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível atualizar o nível visual da etapa.');
    }
  }

  async function handleStageActive(stage: PipelineStage) {
    try {
      await updateStage(pipelineId, stage.id, { active: !stage.active });
      reload();
      onChanged();
    } catch (err) {
      // A soft-disable is blocked server-side (400) when opportunities are
      // still assigned to this stage -- the API error message names the
      // count, surfaced verbatim here rather than re-derived client-side.
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível ativar/desativar a etapa.',
      );
    }
  }

  async function handleMoveStage(stage: PipelineStage, direction: -1 | 1) {
    const sorted = [...stages].sort((a, b) => a.sequence - b.sequence);
    const index = sorted.findIndex((s) => s.id === stage.id);
    const swapWith = sorted[index + direction];
    if (!swapWith) return;
    try {
      await updateStage(pipelineId, stage.id, { sequence: swapWith.sequence });
      await updateStage(pipelineId, swapWith.id, { sequence: stage.sequence });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível reordenar as etapas.');
    }
  }

  async function handleGrantAccess() {
    if (!newUserId.trim()) return;
    try {
      await grantPipelineAccess(pipelineId, newUserId.trim());
      setNewUserId('');
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível conceder acesso.');
    }
  }

  async function handleRevokeAccess(userId: string) {
    try {
      await revokePipelineAccess(pipelineId, userId);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível revogar o acesso.');
    }
  }

  const sortedStages = [...stages].sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Etapas</h2>
        <div className="flex flex-col gap-2">
          {sortedStages.map((stage, index) => (
            <div
              key={stage.id}
              className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                stage.active ? 'border-slate-200' : 'border-slate-100 opacity-60'
              }`}
            >
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STAGE_COLOR_CLASSES[stage.colorToken]}`}
              >
                {stage.name}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => void handleMoveStage(stage, -1)}
                  className="rounded border border-slate-300 px-1.5 py-0.5 text-xs disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === sortedStages.length - 1}
                  onClick={() => void handleMoveStage(stage, 1)}
                  className="rounded border border-slate-300 px-1.5 py-0.5 text-xs disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
              <select
                value={stage.colorToken}
                onChange={(event) => void handleStageColor(stage, event.target.value as PipelineStageColor)}
                className="rounded-md border border-slate-300 px-1.5 py-1 text-xs"
              >
                {PIPELINE_STAGE_COLORS.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
              <select
                value={stage.visualLevel}
                onChange={(event) =>
                  void handleStageVisualLevel(stage, event.target.value as PipelineStageVisualLevel)
                }
                className="rounded-md border border-slate-300 px-1.5 py-1 text-xs"
              >
                <option value="NORMAL">Normal</option>
                <option value="ATTENTION">Atenção</option>
                <option value="SUCCESS">Sucesso</option>
              </select>
              <button
                type="button"
                onClick={() => void handleStageActive(stage)}
                className="ml-auto rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
              >
                {stage.active ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={newStageName}
            onChange={(event) => setNewStageName(event.target.value)}
            placeholder="Nome da nova etapa"
            className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <select
            value={newStageColor}
            onChange={(event) => setNewStageColor(event.target.value as PipelineStageColor)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {PIPELINE_STAGE_COLORS.map((color) => (
              <option key={color} value={color}>
                {color}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleCreateStage()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white"
          >
            Adicionar etapa
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Acesso ao pipeline</h2>
        <p className="mb-3 text-xs text-slate-500">
          Sem nenhuma concessão, este pipeline fica visível para toda a equipe. Ao conceder acesso a
          um usuário específico, o pipeline passa a ser restrito: apenas OWNER/ADMIN e os usuários
          listados abaixo o enxergam.
        </p>
        <div className="flex flex-col gap-2">
          {access.length === 0 && (
            <p className="text-sm text-slate-500">Nenhuma restrição configurada (visível para todos).</p>
          )}
          {access.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
              <span>{a.userId}</span>
              <button
                type="button"
                onClick={() => void handleRevokeAccess(a.userId)}
                className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
              >
                Revogar
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={newUserId}
            onChange={(event) => setNewUserId(event.target.value)}
            placeholder="ID do usuário"
            className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => void handleGrantAccess()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white"
          >
            Conceder acesso
          </button>
        </div>
      </div>
    </div>
  );
}
