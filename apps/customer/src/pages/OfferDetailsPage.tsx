import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getOffer } from '../lib/api';
import type { Offer } from '../types/offer';
import { Button } from '../components/ui/button';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import { getOfferStatusLabel } from '../lib/statusLabels';
import { StatusPill, offerStatusTone } from '../components/ui/StatusPill';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; offer: Offer };

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return 'Oferta não encontrada.';
    }
    return 'Não foi possível carregar a oferta. Tente novamente.';
  }
  return 'Não foi possível carregar a oferta. Tente novamente.';
}

export function OfferDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setState({ status: 'error', message: 'Oferta não encontrada.' });
      return;
    }

    setState({ status: 'loading' });

    getOffer(id)
      .then((offer) => {
        if (!cancelled) {
          setState({ status: 'success', offer });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ status: 'error', message: mapErrorToMessage(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Detalhes da oferta
        </h1>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => void navigate('/offers')}>
            Voltar
          </Button>
          {state.status === 'success' && (
            <>
              <Button
                variant="outline"
                onClick={() =>
                  void navigate(`/offer-growth/studio?offerId=${encodeURIComponent(state.offer.id)}`)
                }
              >
                Criar material
              </Button>
              <Button onClick={() => void navigate(`/offers/${state.offer.id}/edit`)}>
                Editar
              </Button>
            </>
          )}
        </div>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando oferta...</p>
      )}

      {state.status === 'error' && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <dl className="grid max-w-lg grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2">
          <Field label="Nome" value={state.offer.name} />
          <Field label="Preço" value={formatBRL(state.offer.price)} />
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Status
            </dt>
            <dd>
              <StatusPill tone={offerStatusTone(state.offer.status)}>
                {getOfferStatusLabel(state.offer.status)}
              </StatusPill>
            </dd>
          </div>
          <Field
            label="Válido de"
            value={
              state.offer.validFrom
                ? formatDateBR(state.offer.validFrom, { assumeDateOnly: true })
                : undefined
            }
          />
          <Field
            label="Válido até"
            value={
              state.offer.validUntil
                ? formatDateBR(state.offer.validUntil, { assumeDateOnly: true })
                : undefined
            }
          />
          <Field label="Descrição" value={state.offer.description} />
          <Field label="Criado em" value={formatDateBR(state.offer.createdAt)} />
          <Field label="Atualizado em" value={formatDateBR(state.offer.updatedAt)} />
        </dl>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="text-sm text-slate-900">{value ?? '—'}</dd>
    </div>
  );
}
