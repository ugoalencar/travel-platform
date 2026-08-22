import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, confirmArrival, confirmDeparture, getOperation } from '../lib/api';
import type { OperationCheckpoint, OperationWithCheckpoints } from '../types/operations';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: OperationWithCheckpoints };

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Display-only: computed client-side from two timestamps already present
// in the API response (expectedAt, arrivalCheckedAt/departureCheckedAt).
// Never sent back to the server, never a substitute for a backend field.
function formatDelayMinutes(expectedIso: string, actualIso: string): string {
  const deltaMinutes = Math.round(
    (new Date(actualIso).getTime() - new Date(expectedIso).getTime()) / 60_000,
  );
  if (deltaMinutes === 0) return 'no horário previsto';
  if (deltaMinutes > 0) return `${deltaMinutes} min de atraso`;
  return `${Math.abs(deltaMinutes)} min de adiantamento`;
}

export function OperationDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = () => {
    if (!id) return;
    setState({ status: 'loading' });
    getOperation(id)
      .then((data) => setState({ status: 'success', data }))
      .catch((error: unknown) => {
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar a operação.';
        setState({ status: 'error', message });
      });
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleConfirm = async (checkpoint: OperationCheckpoint, kind: 'arrival' | 'departure') => {
    if (!id) return;
    setConfirmingId(`${checkpoint.id}-${kind}`);
    try {
      const confirmFn = kind === 'arrival' ? confirmArrival : confirmDeparture;
      await confirmFn(id, checkpoint.id);
      load();
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Não foi possível confirmar o checkpoint.';
      setState({ status: 'error', message });
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Checklist da operação</h1>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando operação...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <ul className="flex flex-col gap-4">
          {state.data.checkpoints.length === 0 && (
            <p className="text-sm text-slate-500">Nenhum checkpoint monitorado nesta operação.</p>
          )}
          {state.data.checkpoints.map((checkpoint) => (
            <li
              key={checkpoint.id}
              className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-col gap-1">
                <p className="font-medium text-slate-900">Checkpoint {checkpoint.routePointId}</p>
                {checkpoint.expectedAt && (
                  <p className="text-sm text-slate-500">
                    Previsto: {formatTime(checkpoint.expectedAt)}
                  </p>
                )}
              </div>

              {(checkpoint.checkpointType === 'ARRIVAL' || checkpoint.checkpointType === 'BOTH') && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  {checkpoint.arrivalCheckedAt ? (
                    <span className="text-sm font-medium text-emerald-700">
                      Chegada confirmada às {formatTime(checkpoint.arrivalCheckedAt)}
                      {checkpoint.expectedAt &&
                        ` (${formatDelayMinutes(checkpoint.expectedAt, checkpoint.arrivalCheckedAt)})`}
                    </span>
                  ) : (
                    <Button
                      className="w-full sm:w-auto"
                      disabled={confirmingId === `${checkpoint.id}-arrival`}
                      onClick={() => void handleConfirm(checkpoint, 'arrival')}
                    >
                      CONFIRMAR CHEGADA
                    </Button>
                  )}
                </div>
              )}

              {(checkpoint.checkpointType === 'DEPARTURE' || checkpoint.checkpointType === 'BOTH') && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  {checkpoint.departureCheckedAt ? (
                    <span className="text-sm font-medium text-emerald-700">
                      Saída confirmada às {formatTime(checkpoint.departureCheckedAt)}
                      {checkpoint.expectedAt &&
                        ` (${formatDelayMinutes(checkpoint.expectedAt, checkpoint.departureCheckedAt)})`}
                    </span>
                  ) : (
                    <Button
                      className="w-full sm:w-auto"
                      disabled={confirmingId === `${checkpoint.id}-departure`}
                      onClick={() => void handleConfirm(checkpoint, 'departure')}
                    >
                      CONFIRMAR SAÍDA
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
