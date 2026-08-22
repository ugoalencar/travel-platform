import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, listDepartures, listSuppliers, listTransportProducts } from '../lib/api';
import type { ScheduledDeparture, Supplier, TransportProduct } from '../types/transport';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      departures: ScheduledDeparture[];
      productsById: Map<string, TransportProduct>;
      suppliersById: Map<string, Supplier>;
    };

export function DeparturesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading' });

    Promise.all([
      listDepartures(),
      listTransportProducts().catch(() => [] as TransportProduct[]),
      listSuppliers().catch(() => [] as Supplier[]),
    ])
      .then(([departures, products, suppliers]) => {
        if (cancelled) return;
        setState({
          status: 'success',
          departures,
          productsById: new Map(products.map((p) => [p.id, p])),
          suppliersById: new Map(suppliers.map((s) => [s.id, s])),
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar as saídas.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Saídas programadas</h1>
        <Button onClick={() => void navigate('/transport/departures/new')}>+ Nova saída</Button>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando saídas...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <DepartureTable
          departures={state.departures}
          productsById={state.productsById}
          suppliersById={state.suppliersById}
        />
      )}
    </div>
  );
}

function DepartureTable({
  departures,
  productsById,
  suppliersById,
}: {
  departures: ScheduledDeparture[];
  productsById: Map<string, TransportProduct>;
  suppliersById: Map<string, Supplier>;
}) {
  const navigate = useNavigate();

  if (departures.length === 0) {
    return <p className="text-sm text-slate-500">Nenhuma saída programada ainda.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Data/hora</th>
            <th className="px-4 py-3">Produto</th>
            <th className="px-4 py-3">Capacidade</th>
            <th className="px-4 py-3">Vagas disponíveis</th>
            <th className="px-4 py-3">Fornecedor</th>
            <th className="px-4 py-3">Tipo de serviço</th>
            <th className="px-4 py-3">Cancelada</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {departures.map((departure) => {
            // availableSeats is not a real field on ScheduledDeparture (only
            // AgendaEntry has it, computed server-side) -- this mirrors the
            // same cancelled ? 0 : capacity rule for display consistency.
            const availableSeats = departure.cancelled ? 0 : departure.capacity;
            return (
              <tr key={departure.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{departure.departureAt}</td>
                <td className="px-4 py-3 text-slate-600">
                  {productsById.get(departure.productId)?.name ?? departure.productId}
                </td>
                <td className="px-4 py-3 text-slate-600">{departure.capacity}</td>
                <td className="px-4 py-3 text-slate-600">{availableSeats}</td>
                <td className="px-4 py-3 text-slate-600">
                  {departure.supplierId
                    ? (suppliersById.get(departure.supplierId)?.name ?? departure.supplierId)
                    : '—'}
                </td>
                <td className="px-4 py-3 text-slate-600">{departure.serviceType}</td>
                <td className="px-4 py-3 text-slate-600">{departure.cancelled ? 'Sim' : 'Não'}</td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void navigate(`/transport/departures/${departure.id}`)}
                  >
                    Detalhes
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
