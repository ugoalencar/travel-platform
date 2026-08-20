import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, listWishes } from '../lib/api';
import type { Wish } from '../types/wish';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; wishes: Wish[] };

export function WishesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading' });

    listWishes()
      .then((wishes) => {
        if (!cancelled) {
          setState({ status: 'success', wishes });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os desejos.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Desejos
        </h1>
        <Button onClick={() => void navigate('/wishes/new')}>+ Novo desejo</Button>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando desejos...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && <WishTable wishes={state.wishes} />}
    </div>
  );
}

function WishTable({ wishes }: { wishes: Wish[] }) {
  const navigate = useNavigate();

  if (wishes.length === 0) {
    return (
      <p className="text-sm text-slate-500">Nenhum desejo cadastrado ainda.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Destino</th>
            <th className="px-4 py-3">Orçamento</th>
            <th className="px-4 py-3">Viajantes</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Início</th>
            <th className="px-4 py-3">Fim</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {wishes.map((wish) => (
            <tr key={wish.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3 font-medium text-slate-900">
                {wish.destination ?? '—'}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {wish.budget !== undefined ? wish.budget : '—'}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {wish.travelersCount !== undefined ? wish.travelersCount : '—'}
              </td>
              <td className="px-4 py-3 text-slate-600">{wish.status}</td>
              <td className="px-4 py-3 text-slate-600">{wish.startDate ?? '—'}</td>
              <td className="px-4 py-3 text-slate-600">{wish.endDate ?? '—'}</td>
              <td className="px-4 py-3 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void navigate(`/wishes/${wish.id}`)}
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
