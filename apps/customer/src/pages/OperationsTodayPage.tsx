import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createOperation, listDepartures, listOperations } from '../lib/api';
import type { ScheduledDeparture } from '../types/transport';
import type { TransportOperation } from '../types/operations';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      operations: TransportOperation[];
      departuresById: Map<string, ScheduledDeparture>;
      // Today's departures that do not yet have an Operation -- shown with
      // a "create operation" action instead of a details link.
      departuresWithoutOperation: ScheduledDeparture[];
    };

function isToday(iso: string): boolean {
  const date = new Date(iso);
  const now = new Date();
  return (
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate()
  );
}

export function OperationsTodayPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = () => {
    setState({ status: 'loading' });

    Promise.all([listOperations(), listDepartures().catch(() => [] as ScheduledDeparture[])])
      .then(([operations, departures]) => {
        const departuresById = new Map(departures.map((d) => [d.id, d]));
        const operatedDepartureIds = new Set(operations.map((op) => op.departureId));
        const departuresWithoutOperation = departures.filter(
          (d) => isToday(d.departureAt) && !operatedDepartureIds.has(d.id),
        );
        setState({ status: 'success', operations, departuresById, departuresWithoutOperation });
      })
      .catch((error: unknown) => {
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar as operações.';
        setState({ status: 'error', message });
      });
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (departureId: string) => {
    setCreatingId(departureId);
    try {
      const result = await createOperation({ departureId });
      await navigate(`/operations/${result.operation.id}`);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Não foi possível criar a operação.';
      setState({ status: 'error', message });
    } finally {
      setCreatingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Operações de hoje</h1>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando operações...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <>
          {state.operations.length === 0 && state.departuresWithoutOperation.length === 0 && (
            <p className="text-sm text-slate-500">Nenhuma operação hoje.</p>
          )}

          {state.operations.length > 0 && (
            <ul className="flex flex-col gap-3">
              {state.operations.map((operation) => {
                const departure = state.departuresById.get(operation.departureId);
                return (
                  <li
                    key={operation.id}
                    className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        Saída {departure?.departureAt ?? operation.departureId}
                      </p>
                      <p className="text-sm text-slate-500">Operação {operation.id}</p>
                    </div>
                    <Button
                      className="w-full sm:w-auto"
                      onClick={() => void navigate(`/operations/${operation.id}`)}
                    >
                      Ver checklist
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {state.departuresWithoutOperation.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-slate-700">
                Saídas de hoje sem operação iniciada
              </h2>
              <ul className="flex flex-col gap-3">
                {state.departuresWithoutOperation.map((departure) => (
                  <li
                    key={departure.id}
                    className="flex flex-col gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-slate-900">Saída {departure.departureAt}</p>
                      <p className="text-sm text-slate-500">Capacidade {departure.capacity}</p>
                    </div>
                    <Button
                      className="w-full sm:w-auto"
                      disabled={creatingId === departure.id}
                      onClick={() => void handleCreate(departure.id)}
                    >
                      {creatingId === departure.id ? 'Criando...' : 'Iniciar operação'}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
