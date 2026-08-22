import { useEffect, useState } from 'react';
import { ApiError, getAgenda } from '../lib/api';
import type { AgendaEntry } from '../types/transport';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; entries: AgendaEntry[] };

export function TransportAgendaPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading' });

    getAgenda()
      .then((entries) => {
        if (cancelled) return;
        setState({ status: 'success', entries });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar a agenda.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Agenda de saídas</h1>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando agenda...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && <AgendaTable entries={state.entries} />}
    </div>
  );
}

function AgendaTable({ entries }: { entries: AgendaEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">Nenhuma saída na agenda.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Data/hora</th>
            <th className="px-4 py-3">Rota</th>
            <th className="px-4 py-3">Produto</th>
            <th className="px-4 py-3">Capacidade</th>
            <th className="px-4 py-3">Vagas disponíveis</th>
            <th className="px-4 py-3">Fornecedor</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.departure.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3 font-medium text-slate-900">{entry.departure.departureAt}</td>
              <td className="px-4 py-3 text-slate-600">
                {entry.outboundOrigin} → {entry.outboundDestination}
              </td>
              <td className="px-4 py-3 text-slate-600">{entry.productName}</td>
              <td className="px-4 py-3 text-slate-600">{entry.departure.capacity}</td>
              <td className="px-4 py-3 text-slate-600">{entry.availableSeats}</td>
              <td className="px-4 py-3 text-slate-600">{entry.supplierName ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
