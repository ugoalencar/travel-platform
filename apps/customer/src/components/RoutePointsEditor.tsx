import { useEffect, useState } from 'react';
import {
  ApiError,
  createRoutePoint,
  listRoutePoints,
  reorderRoutePoints,
  updateRoutePoint,
} from '../lib/api';
import type { CheckpointType, RoutePoint } from '../types/transport';
import { Button } from './ui/button';

// Editor for a Route's ordered itinerary points (RoutePoint). Only
// rendered once the Route already exists (e.g. on the Edit page), since
// RoutePoints require a routeId -- see TransportRouteEditPage.tsx for the
// documented decision: points are not created until after the Route
// itself has been saved.
//
// Business rule reminder: checkpointRequired is OPTIONAL PER POINT.
// A point with checkpointRequired=false remains fully visible in the
// list -- it is itinerary-only and creates no operational obligation.
// It just does not show a checkpoint type selector.

const CHECKPOINT_TYPES: CheckpointType[] = ['ARRIVAL', 'DEPARTURE', 'BOTH'];

interface EditablePoint {
  // localKey is a stable React key independent of the server id -- the
  // server id changes when a brand-new (isNew) point is first saved, and
  // using that id as the React key would unmount/remount the row mid-save.
  localKey: string;
  id: string;
  name: string;
  checkpointRequired: boolean;
  checkpointType: CheckpointType | '';
  plannedOffsetMinutes: string;
  isNew: boolean;
  saving: boolean;
}

let localKeySeq = 0;
function nextLocalKey(): string {
  localKeySeq += 1;
  return `local-${localKeySeq}`;
}

function toEditable(point: RoutePoint, localKey?: string): EditablePoint {
  return {
    localKey: localKey ?? nextLocalKey(),
    id: point.id,
    name: point.name,
    checkpointRequired: point.checkpointRequired,
    checkpointType: point.checkpointType ?? '',
    plannedOffsetMinutes:
      point.plannedOffsetMinutes !== undefined ? String(point.plannedOffsetMinutes) : '',
    isNew: false,
    saving: false,
  };
}

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return error.message;
    if (error.status === 409) return 'Já existe um ponto com essa posição nesta rota.';
    if (error.status === 403) return 'Você não tem permissão para editar pontos da rota.';
  }
  return 'Não foi possível salvar o ponto. Tente novamente.';
}

export function RoutePointsEditor({ routeId }: { routeId: string }) {
  const [points, setPoints] = useState<EditablePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    listRoutePoints(routeId)
      .then((loaded) => {
        if (cancelled) return;
        setPoints(loaded.map((p) => toEditable(p)));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Não foi possível carregar os pontos da rota.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [routeId]);

  function updatePoint(index: number, patch: Partial<EditablePoint>) {
    setPoints((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function handleAddPoint() {
    setPoints((prev) => [
      ...prev,
      {
        localKey: nextLocalKey(),
        id: `new-${Date.now()}-${prev.length}`,
        name: '',
        checkpointRequired: false,
        checkpointType: '',
        plannedOffsetMinutes: '',
        isNew: true,
        saving: false,
      },
    ]);
  }

  function handleRemovePoint(index: number) {
    const point = points[index];
    if (!point) return;

    setPoints((prev) => prev.filter((_, i) => i !== index));
    // Removal via API is out of scope for the backend (no DELETE route
    // was specified in this task); a real delete endpoint would be a
    // follow-up. For now, removal only affects local editor state --
    // this matches the brief's scope (only list/create/update/reorder
    // endpoints were requested).
  }

  async function handleSavePoint(index: number) {
    const point = points[index];
    if (!point) return;

    const name = point.name.trim();
    if (!name) {
      setError('Nome do ponto é obrigatório.');
      return;
    }
    if (point.checkpointRequired && !point.checkpointType) {
      setError('Selecione o tipo de checkpoint para pontos monitorados.');
      return;
    }

    updatePoint(index, { saving: true });
    setError(null);

    const plannedOffsetMinutes = point.plannedOffsetMinutes.trim()
      ? Number(point.plannedOffsetMinutes.trim())
      : undefined;

    try {
      if (point.isNew) {
        const sequence = index; // append at the end; server enforces uniqueness
        const createInput: Parameters<typeof createRoutePoint>[1] = {
          sequence: sequence + 1,
          name,
          checkpointRequired: point.checkpointRequired,
        };
        if (point.checkpointRequired) {
          createInput.checkpointType = point.checkpointType as CheckpointType;
        }
        if (plannedOffsetMinutes !== undefined) {
          createInput.plannedOffsetMinutes = plannedOffsetMinutes;
        }
        const created = await createRoutePoint(routeId, createInput);
        updatePoint(index, { ...toEditable(created, point.localKey), saving: false });
      } else {
        const updated = await updateRoutePoint(routeId, point.id, {
          name,
          checkpointRequired: point.checkpointRequired,
          checkpointType: point.checkpointRequired
            ? (point.checkpointType as CheckpointType)
            : null,
          plannedOffsetMinutes: plannedOffsetMinutes ?? null,
        });
        updatePoint(index, { ...toEditable(updated, point.localKey), saving: false });
      }
    } catch (err: unknown) {
      setError(mapErrorToMessage(err));
      updatePoint(index, { saving: false });
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= points.length) return;

    const savedPoints = points.filter((p) => !p.isNew);
    if (points[index]?.isNew || points[targetIndex]?.isNew) {
      // Only persisted points participate in server-side reorder.
      const reordered = [...points];
      const [moved] = reordered.splice(index, 1);
      if (moved) reordered.splice(targetIndex, 0, moved);
      setPoints(reordered);
      return;
    }

    const reorderedIds = [...savedPoints.map((p) => p.id)];
    const from = reorderedIds.indexOf(points[index]!.id);
    const to = reorderedIds.indexOf(points[targetIndex]!.id);
    const [movedId] = reorderedIds.splice(from, 1);
    if (movedId) reorderedIds.splice(to, 0, movedId);

    try {
      const result = await reorderRoutePoints(routeId, reorderedIds);
      setPoints(result.map((p) => toEditable(p)));
    } catch (err: unknown) {
      setError(mapErrorToMessage(err));
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Carregando pontos da rota...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-slate-900">Pontos da rota</h2>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <ol className="flex flex-col gap-3">
        {points.map((point, index) => (
          <li
            key={point.localKey}
            data-testid="route-point-row"
            className="flex flex-col gap-2 rounded-md border border-slate-200 p-3"
          >
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Ponto {index + 1}</span>
              <div className="ml-auto flex gap-1">
                <button
                  type="button"
                  aria-label="Mover para cima"
                  disabled={index === 0}
                  onClick={() => void handleMove(index, -1)}
                  className="rounded border border-slate-300 px-2 py-0.5 text-slate-700 disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Mover para baixo"
                  disabled={index === points.length - 1}
                  onClick={() => void handleMove(index, 1)}
                  className="rounded border border-slate-300 px-2 py-0.5 text-slate-700 disabled:opacity-40"
                >
                  ↓
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={`point-name-${point.localKey}`} className="text-sm font-medium text-slate-700">
                Nome
              </label>
              <input
                id={`point-name-${point.localKey}`}
                value={point.name}
                onChange={(event) => updatePoint(index, { name: event.target.value })}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor={`point-offset-${point.localKey}`}
                className="text-sm font-medium text-slate-700"
              >
                Deslocamento planejado (min)
              </label>
              <input
                id={`point-offset-${point.localKey}`}
                type="number"
                min="0"
                value={point.plannedOffsetMinutes}
                onChange={(event) =>
                  updatePoint(index, { plannedOffsetMinutes: event.target.value })
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <label
              htmlFor={`point-checkpoint-required-${point.localKey}`}
              className="flex items-center gap-2 text-sm font-medium text-slate-700"
            >
              <input
                id={`point-checkpoint-required-${point.localKey}`}
                type="checkbox"
                checked={point.checkpointRequired}
                onChange={(event) =>
                  updatePoint(index, {
                    checkpointRequired: event.target.checked,
                    checkpointType: event.target.checked ? point.checkpointType : '',
                  })
                }
              />
              Monitorar este ponto
            </label>

            {point.checkpointRequired && (
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`point-checkpoint-type-${point.localKey}`}
                  className="text-sm font-medium text-slate-700"
                >
                  Tipo de checkpoint
                </label>
                <select
                  id={`point-checkpoint-type-${point.localKey}`}
                  value={point.checkpointType}
                  onChange={(event) =>
                    updatePoint(index, { checkpointType: event.target.value as CheckpointType })
                  }
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Selecione...</option>
                  {CHECKPOINT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                disabled={point.saving}
                onClick={() => void handleSavePoint(index)}
              >
                {point.saving ? 'Salvando...' : point.isNew ? 'Adicionar' : 'Salvar ponto'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleRemovePoint(index)}
              >
                Remover
              </Button>
            </div>
          </li>
        ))}
      </ol>

      <Button type="button" variant="outline" onClick={handleAddPoint}>
        Adicionar ponto
      </Button>
    </div>
  );
}
