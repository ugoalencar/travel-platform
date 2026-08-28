import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, getAvailableOffer } from '../../lib/customerApi';
import type { Offer } from '../../types/offer';
import { BackLink } from '../BackLink';

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
    <div className="flex flex-col gap-6">
      <BackLink to="/customer-portal/offers" label="Voltar para ofertas" />

      <div aria-live="polite">
        {state.status === 'loading' && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
            <span className="text-sm text-slate-500">Carregando oferta...</span>
          </div>
        )}
        {state.status === 'error' && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
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
      {/* Hero Image */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 to-purple-800 p-8 text-white shadow-xl">
        <div className="absolute -right-8 -top-8 text-8xl opacity-20">🎯</div>
        <div className="relative">
          <h1 className="text-3xl font-bold tracking-tight">{offer.name}</h1>
          <p className="mt-2 text-lg text-purple-100">
            {offer.price.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}
          </p>
          {(offer.validFrom || offer.validUntil) && (
            <p className="mt-2 text-sm text-purple-200">
              Válida
              {offer.validFrom
                ? ` de ${new Date(offer.validFrom).toLocaleDateString('pt-BR')}`
                : ''}
              {offer.validUntil
                ? ` até ${new Date(offer.validUntil).toLocaleDateString('pt-BR')}`
                : ''}
            </p>
          )}
        </div>
      </div>

      {/* Description */}
      {offer.description && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Sobre esta oferta
          </h2>
          <p className="text-sm text-slate-700 leading-relaxed">{offer.description}</p>
        </div>
      )}

      {/* Price Card */}
      <div className="rounded-xl border border-purple-200 bg-purple-50 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-purple-700">A partir de</p>
            <p className="text-3xl font-bold text-purple-900">
              {offer.price.toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </p>
          </div>
          <div className="text-right">
            {offer.validUntil && (
              <p className="text-xs text-purple-600">
                Válida até {new Date(offer.validUntil).toLocaleDateString('pt-BR')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Contact CTA (Prototype) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Interessado nesta oferta?
        </h2>
        <p className="mb-4 text-sm text-slate-600">
          Entre em contato com sua agência para mais detalhes e personalização.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-700"
          >
            📞 Falar com a agência
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            💬 Enviar mensagem
          </button>
        </div>
      </div>

      {/* Privacy Note */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
        <p>
          Esta oferta é informativa. Para personalização e reservas, entre em contato com sua agência
          de viagens.
        </p>
      </div>
    </>
  );
}
