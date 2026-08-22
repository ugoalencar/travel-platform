import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, listOffers } from '../lib/api';
import type { Offer } from '../types/offer';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; offers: Offer[] };

function formatPrice(price: number): string {
  return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function OffersPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading' });

    listOffers()
      .then((offers) => {
        if (!cancelled) {
          setState({ status: 'success', offers });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar as ofertas.';
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
          Ofertas
        </h1>
        <Button onClick={() => void navigate('/offers/new')}>+ Nova oferta</Button>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando ofertas...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && <OfferTable offers={state.offers} />}
    </div>
  );
}

function OfferTable({ offers }: { offers: Offer[] }) {
  const navigate = useNavigate();

  if (offers.length === 0) {
    return (
      <p className="text-sm text-slate-500">Nenhuma oferta cadastrada ainda.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Nome</th>
            <th className="px-4 py-3">Preço</th>
            <th className="px-4 py-3">Válido de</th>
            <th className="px-4 py-3">Válido até</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {offers.map((offer) => (
            <tr key={offer.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3 font-medium text-slate-900">{offer.name}</td>
              <td className="px-4 py-3 text-slate-600">{formatPrice(offer.price)}</td>
              <td className="px-4 py-3 text-slate-600">
                {offer.validFrom
                  ? new Date(offer.validFrom).toLocaleDateString('pt-BR')
                  : '—'}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {offer.validUntil
                  ? new Date(offer.validUntil).toLocaleDateString('pt-BR')
                  : '—'}
              </td>
              <td className="px-4 py-3 text-slate-600">{offer.status}</td>
              <td className="px-4 py-3 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void navigate(`/offers/${offer.id}`)}
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
