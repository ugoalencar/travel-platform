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

      <div aria-live="polite">
        {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
        {state.status === 'error' && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
        {state.status === 'success' && state.offers.length === 0 && (
          <p className="text-sm text-slate-500">Nenhuma oferta disponível no momento.</p>
        )}
      </div>
      {state.status === 'success' && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {state.offers.map((offer) => (
            <Link
              key={offer.id}
              to={`/customer-portal/offers/${offer.id}`}
              className="flex flex-col gap-3 rounded-xl border-2 border-slate-200 bg-white p-4 shadow-md hover:shadow-lg hover:border-purple-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 transition-all"
            >
              <OfferImagePlaceholder name={offer.name} />
              <div className="flex-1 flex flex-col gap-2">
                <p className="font-bold text-lg text-slate-900">{offer.name}</p>
                {offer.description && (
                  <p className="line-clamp-2 text-sm text-slate-600">{offer.description}</p>
                )}
              </div>
              <div className="border-t border-slate-100 pt-3">
                <p className="text-xl font-bold text-purple-700">
                  {offer.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
                {offer.validUntil && (
                  <p className="text-xs text-slate-500 mt-2">
                    <span aria-hidden="true">⏰</span> Válida até {new Date(offer.validUntil).toLocaleDateString('pt-BR')}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// Improved image placeholder: a themed initial-letter tile instead of a
// raw "broken image" state or plain gray box, since offers have no image
// field on the backend to actually render.
export function OfferImagePlaceholder({
  name,
  className = 'h-32 rounded-lg text-3xl',
}: {
  name: string;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const colors = [
    'from-purple-200 to-indigo-200 text-purple-700',
    'from-blue-200 to-cyan-200 text-blue-700',
    'from-pink-200 to-rose-200 text-pink-700',
    'from-amber-200 to-orange-200 text-amber-700',
    'from-green-200 to-emerald-200 text-green-700',
  ];
  const colorClass = colors[initial.charCodeAt(0) % colors.length];
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br ${colorClass} font-bold ${className}`}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
