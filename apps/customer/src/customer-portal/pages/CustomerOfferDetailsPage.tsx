import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, getAvailableOffer } from '../../lib/customerApi';
import type { Offer } from '../../types/offer';

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

  if (state.status === 'loading') {
    return <p className="text-sm text-slate-500">Carregando...</p>;
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {state.message}
      </div>
    );
  }

  const { offer } = state;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-40 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-400">
        Imagem indisponível
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{offer.name}</h1>
      <p className="text-lg font-medium text-teal-700">
        {offer.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      </p>
      {offer.description && <p className="text-sm text-slate-600">{offer.description}</p>}
      {/* No purchase/checkout flow yet -- this vertical is informational only. */}
    </div>
  );
}
