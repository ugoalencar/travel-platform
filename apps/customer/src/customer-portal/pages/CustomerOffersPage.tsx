import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, listAvailableOffers } from '../../lib/customerApi';
import type { Offer } from '../../types/offer';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; offers: Offer[] };

export function CustomerOffersPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    listAvailableOffers()
      .then((offers) => {
        if (!cancelled) setState({ status: 'success', offers });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar as ofertas.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Ofertas disponíveis</h1>
      <p className="text-sm text-slate-500">
        Ofertas da agência, disponíveis para todos os clientes.
      </p>

      {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}
      {state.status === 'success' && state.offers.length === 0 && (
        <p className="text-sm text-slate-500">Nenhuma oferta disponível no momento.</p>
      )}
      {state.status === 'success' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {state.offers.map((offer) => (
            <Link
              key={offer.id}
              to={`/customer-portal/offers/${offer.id}`}
              className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-teal-300"
            >
              <div className="flex h-24 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">
                Imagem indisponível
              </div>
              <p className="font-medium text-slate-900">{offer.name}</p>
              <p className="text-sm text-slate-600">
                {offer.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
