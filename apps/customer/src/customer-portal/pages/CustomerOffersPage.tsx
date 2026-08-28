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
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Ofertas disponíveis</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ofertas exclusivas da sua agência de viagens.
        </p>
      </div>

      <div aria-live="polite">
        {state.status === 'loading' && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
            <span className="text-sm text-slate-500">Carregando ofertas...</span>
          </div>
        )}
        {state.status === 'error' && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
        {state.status === 'success' && state.offers.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <div className="text-4xl">🎯</div>
            <p className="mt-3 text-sm font-medium text-slate-600">Nenhuma oferta disponível</p>
            <p className="mt-1 text-xs text-slate-400">
              Ofertas exclusivas aparecerão aqui quando sua agência as publicar.
            </p>
          </div>
        )}
      </div>

      {state.status === 'success' && state.offers.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {state.offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      )}
    </div>
  );
}

function OfferCard({ offer }: { offer: Offer }) {
  const isExpiringSoon =
    offer.validUntil &&
    new Date(offer.validUntil).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

  return (
    <Link
      to={`/customer-portal/offers/${offer.id}`}
      className="group block overflow-hidden rounded-xl border border-purple-200 bg-white shadow-sm transition-all hover:border-purple-300 hover:shadow-md"
    >
      {/* Offer Image */}
      <div className="relative h-32 bg-gradient-to-br from-purple-100 to-purple-200">
        <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-60">
          🎯
        </div>
        {isExpiringSoon && (
          <div className="absolute right-3 top-3">
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
              ⏰ Últimas vagas
            </span>
          </div>
        )}
      </div>

      {/* Offer Info */}
      <div className="p-4">
        <h3 className="text-lg font-semibold text-slate-900 group-hover:text-purple-700">
          {offer.name}
        </h3>
        {offer.description && (
          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{offer.description}</p>
        )}

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xl font-bold text-purple-700">
            {offer.price.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}
          </p>
          {offer.validUntil && (
            <p className="text-xs text-slate-500">
              Válida até {new Date(offer.validUntil).toLocaleDateString('pt-BR')}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

// Improved image placeholder: a themed initial-letter tile instead of a
// raw "broken image" state or plain gray box, since offers have no image
// field on the backend to actually render.
export function OfferImagePlaceholder({
  name,
  className = 'h-24 rounded-md text-2xl',
}: {
  name: string;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br from-purple-100 to-slate-100 font-semibold text-purple-700 ${className}`}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
