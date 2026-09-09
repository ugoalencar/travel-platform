import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { ErrorState } from '../../components/ui/error-state';
import { LoadingState } from '../../components/ui/loading-state';
import { StatusBadge } from '../../components/ui/status-badge';
import { Select } from '../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { ApiError, listOperationalPassengers, type OperationalPassenger } from '../../lib/api';

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'success' };

export function PassengersPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [passengers, setPassengers] = useState<OperationalPassenger[]>([]);
  const [tripFilter, setTripFilter] = useState<string>('ALL');

  const load = useCallback(() => {
    setState({ status: 'loading' });
    listOperationalPassengers()
      .then((data) => {
        setPassengers(data);
        setState({ status: 'success' });
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar os passageiros.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const trips = useMemo(() => {
    const byId = new Map<string, { id: string; label: string }>();
    for (const p of passengers) {
      if (!byId.has(p.tripId)) {
        byId.set(p.tripId, { id: p.tripId, label: `${p.tripName} — ${p.destination}` });
      }
    }
    return [...byId.values()];
  }, [passengers]);

  const filtered = useMemo(
    () => (tripFilter === 'ALL' ? passengers : passengers.filter((p) => p.tripId === tripFilter)),
    [passengers, tripFilter],
  );

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader
          title="Passageiros"
          description="Viajantes de todas as viagens ativas, com status de documentação."
        />
        <LoadingState label="Carregando passageiros..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Passageiros"
        description="Todos os viajantes (clientes e dependentes) em viagens planejadas, confirmadas ou em andamento, agregados a partir de serviços aéreos, terrestres e da viagem principal."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Passageiros' }]}
      />

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <Select
          aria-label="Filtrar por viagem"
          value={tripFilter}
          onChange={(event) => setTripFilter(event.target.value)}
          className="sm:w-72"
        >
          <option value="ALL">Todas as viagens</option>
          {trips.map((trip) => (
            <option key={trip.id} value={trip.id}>{trip.label}</option>
          ))}
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Passageiros</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {passengers.length === 0 ? (
            <EmptyState
              title="Nenhum passageiro encontrado"
              description="Não há viagens ativas com viajantes cadastrados no momento."
            />
          ) : filtered.length === 0 ? (
            <EmptyState title="Nenhum resultado" description="Ajuste o filtro para encontrar outros passageiros." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Viajante</TableHead>
                  <TableHead>Viagem</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Documentos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const complete = p.documentsRequired > 0 && p.documentsFulfilled === p.documentsRequired;
                  const hasGap = p.documentsRequired > 0 && p.documentsFulfilled < p.documentsRequired;
                  return (
                    <TableRow key={`${p.tripId}-${p.customerId}-${p.dependentId ?? 'self'}`}>
                      <TableCell className="font-medium">
                        {p.travelerName}
                        {p.dependentId ? (
                          <div className="text-xs font-normal text-slate-500">Dependente</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Link to={`/trips/${p.tripId}`} className="text-slate-900 underline-offset-2 hover:underline">
                          {p.tripName}
                        </Link>
                        <div className="text-xs text-slate-500">{p.destination}</div>
                      </TableCell>
                      <TableCell className="text-xs">{p.startDate.slice(0, 10)}</TableCell>
                      <TableCell className="text-xs">
                        <div>{p.contactEmail ?? '-'}</div>
                        <div>{p.contactPhone ?? '-'}</div>
                      </TableCell>
                      <TableCell>
                        {p.documentsRequired === 0 ? (
                          <StatusBadge tone="neutral">Sem requisitos</StatusBadge>
                        ) : complete ? (
                          <StatusBadge tone="positive">{`${p.documentsFulfilled}/${p.documentsRequired} completos`}</StatusBadge>
                        ) : hasGap ? (
                          <StatusBadge tone="attention">{`${p.documentsFulfilled}/${p.documentsRequired} pendentes`}</StatusBadge>
                        ) : (
                          <StatusBadge tone="neutral">-</StatusBadge>
                        )}
                        <div className="mt-1">
                          <Link
                            to={`/customers/${p.customerId}`}
                            className="text-xs text-slate-500 underline-offset-2 hover:underline"
                          >
                            Ver documentos do cliente
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
