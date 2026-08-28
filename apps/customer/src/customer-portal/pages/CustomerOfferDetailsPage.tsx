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
  return (
    <>
      <OfferImagePlaceholder name={offer.name} className="h-40 rounded-lg text-4xl" />
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{offer.name}</h1>
      <p className="text-lg font-medium text-teal-700">
        {offer.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      </p>
      {(offer.validFrom || offer.validUntil) && (
        <p className="text-sm text-slate-500">
          Válida{offer.validFrom ? ` de ${new Date(offer.validFrom).toLocaleDateString('pt-BR')}` : ''}
          {offer.validUntil ? ` até ${new Date(offer.validUntil).toLocaleDateString('pt-BR')}` : ''}
        </p>
      )}
      {offer.description && <p className="text-sm text-slate-600">{offer.description}</p>}
      {/* No purchase/checkout flow yet -- this vertical is informational only. */}
    </>
  );
}
