import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, getAvailableOffer } from '../../lib/customerApi';
import type { Offer } from '../../types/offer';
import { BackLink } from '../BackLink';
import { OfferImagePlaceholder } from './CustomerOffersPage';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; offer: Offer };

export function CustomerOfferDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getAvailableOffer(id)
      .then((offer) => {
        if (!cancelled) setState({ status: 'success', offer });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar esta oferta.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="flex flex-col gap-4">
      <BackLink to="/customer-portal/offers" label="Voltar para ofertas" />

      <div aria-live="polite">
        {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
        {state.status === 'error' && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
      </div>

      {state.status === 'success' && <OfferDetails offer={state.offer} />}
    </div>
  );
}

function OfferDetails({ offer }: { offer: Offer }) {
  const validFromDate = offer.validFrom ? new Date(offer.validFrom) : null;
  const validUntilDate = offer.validUntil ? new Date(offer.validUntil) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <OfferImagePlaceholder name={offer.name} className="h-48 rounded-xl text-5xl" />
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{offer.name}</h1>
          <p className="mt-2 text-3xl font-bold text-purple-700">
            {offer.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </div>
      </div>

      {offer.description && (
        <div className="rounded-xl border-2 border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 mb-3">📝 Descrição</h3>
          <p className="text-slate-700 leading-relaxed">{offer.description}</p>
        </div>
      )}

      {(validFromDate || validUntilDate) && (
        <div className="rounded-xl border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 mb-3">⏰ Validade</h3>
          <div className="space-y-2 text-sm">
            {validFromDate && (
              <p>
                <span className="font-medium text-slate-600">Válida a partir de: </span>
                <span className="text-slate-900">{validFromDate.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </p>
            )}
            {validUntilDate && (
              <p>
                <span className="font-medium text-slate-600">Válida até: </span>
                <span className="text-slate-900">{validUntilDate.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </p>
            )}
          </div>
        </div>
      )}
      {/* No purchase/checkout flow yet -- this vertical is informational only. */}
    </div>
  );
}
