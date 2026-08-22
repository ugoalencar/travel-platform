import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, listRoutes } from '../lib/api';
import type { Route } from '../types/transport';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; routes: Route[] };

export function TransportRoutesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading' });

    listRoutes()
      .then((routes) => {
        if (cancelled) return;
        setState({ status: 'success', routes });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar as rotas.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Rotas</h1>
        <Button onClick={() => void navigate('/transport/routes/new')}>+ Nova rota</Button>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando rotas...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && <RouteTable routes={state.routes} />}
    </div>
  );
}

function RouteTable({ routes }: { routes: Route[] }) {
  const navigate = useNavigate();

  if (routes.length === 0) {
    return <p className="text-sm text-slate-500">Nenhuma rota cadastrada ainda.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Origem</th>
            <th className="px-4 py-3">Destino</th>
            <th className="px-4 py-3">Ativa</th>
            <th className="px-4 py-3">Notas</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => (
            <tr key={route.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3 font-medium text-slate-900">{route.origin}</td>
              <td className="px-4 py-3 text-slate-600">{route.destination}</td>
              <td className="px-4 py-3 text-slate-600">{route.active ? 'Sim' : 'Não'}</td>
              <td className="px-4 py-3 text-slate-600">{route.notes ?? '—'}</td>
              <td className="px-4 py-3 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void navigate(`/transport/routes/${route.id}`)}
                >
                  Detalhes
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
