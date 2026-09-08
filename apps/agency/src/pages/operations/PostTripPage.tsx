import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Checkbox } from '../../components/ui/checkbox';
import { EmptyState } from '../../components/ui/empty-state';
import { ErrorState } from '../../components/ui/error-state';
import { LoadingState } from '../../components/ui/loading-state';
import { StatusBadge } from '../../components/ui/status-badge';
import {
  ApiError,
  listCompletedTripsWithChecklist,
  setPostTripChecklistItem,
  type CompletedTripWithChecklist,
  type PostTripChecklistItemKey,
} from '../../lib/api';

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'success' };

const ITEM_LABELS: Record<PostTripChecklistItemKey, string> = {
  SATISFACAO_ENVIADA: 'Pesquisa de satisfação enviada',
  AVALIACAO_RECEBIDA: 'Avaliação recebida',
  DOCUMENTOS_DEVOLVIDOS: 'Documentos devolvidos ao cliente',
  PROXIMA_OFERTA_SUGERIDA: 'Próxima oferta sugerida',
};

export function PostTripPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [trips, setTrips] = useState<CompletedTripWithChecklist[]>([]);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    listCompletedTripsWithChecklist()
      .then((data) => {
        setTrips(data);
        setState({ status: 'success' });
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar as viagens concluídas.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleItem(tripId: string, itemKey: PostTripChecklistItemKey, done: boolean) {
    const key = `${tripId}-${itemKey}`;
    setPendingKey(key);
    try {
      await setPostTripChecklistItem(tripId, itemKey, done);
      setTrips((prev) =>
        prev.map((trip) =>
          trip.tripId !== tripId
            ? trip
            : {
                ...trip,
                items: trip.items.map((item) =>
                  item.itemKey === itemKey ? { ...item, done, doneAt: done ? new Date().toISOString() : null } : item,
                ),
              },
        ),
      );
    } catch (err: unknown) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : 'Não foi possível atualizar o item do checklist.',
      });
    } finally {
      setPendingKey(null);
    }
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Pós-viagem" description="Checklist de encerramento para viagens concluídas." />
        <LoadingState label="Carregando viagens concluídas..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pós-viagem"
        description="Checklist manual de encerramento para cada viagem concluída: satisfação, avaliação, devolução de documentos e sugestão da próxima oferta."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Pós-viagem' }]}
      />

      {trips.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              title="Nenhuma viagem concluída"
              description="Quando uma viagem for marcada como concluída, ela aparecerá aqui para o checklist pós-viagem."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {trips.map((trip) => {
            const doneCount = trip.items.filter((i) => i.done).length;
            return (
              <Card key={trip.tripId}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>{trip.tripName}</CardTitle>
                    <p className="text-sm text-slate-500">
                      {trip.customerName} · {trip.destination} · Concluída em {trip.endDate.slice(0, 10)}
                    </p>
                  </div>
                  <StatusBadge tone={doneCount === trip.items.length ? 'positive' : 'attention'}>
                    {doneCount}/{trip.items.length} concluído
                  </StatusBadge>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {trip.items.map((item) => {
                      const key = `${trip.tripId}-${item.itemKey}`;
                      return (
                        <li key={key} className="flex items-center gap-3">
                          <Checkbox
                            id={key}
                            checked={item.done}
                            disabled={pendingKey === key}
                            onChange={(event) => {
                              void toggleItem(trip.tripId, item.itemKey, event.target.checked);
                            }}
                          />
                          <label htmlFor={key} className="text-sm text-slate-700">
                            {ITEM_LABELS[item.itemKey]}
                          </label>
                          {item.doneAt ? (
                            <span className="text-xs text-slate-400">em {item.doneAt.slice(0, 10)}</span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
