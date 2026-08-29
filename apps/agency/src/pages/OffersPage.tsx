import { useEffect, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { LoadingState } from '../components/ui/loading-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { StatusBadge, type StatusTone } from '../components/ui/status-badge';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import { ApiError, listOffers, type Offer, type OfferStatus } from '../lib/api';

// Real offers, fetched from the same backend contract (GET /offers) that
// apps/customer's OffersPage already consumes -- see
// docs/plans/OFFERS_DECISION.md for why this screen calls the API
// directly instead of importing apps/customer's client (separate Vite
// build targets, no shared frontend package today), and why the Pescador
// external-offer-capture pipeline is out of scope here.

const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  ACTIVE: 'Ativa',
  INACTIVE: 'Inativa',
  EXPIRED: 'Expirada',
};

const OFFER_STATUS_TONES: Record<OfferStatus, StatusTone> = {
  ACTIVE: 'positive',
  INACTIVE: 'inactive',
  EXPIRED: 'attention',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; offers: Offer[] };

export function OffersPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

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
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar as ofertas.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader
        title="Ofertas"
        description="Ofertas e pacotes publicados pela agência."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Ofertas' }]}
        actions={<Button size="sm">Novo</Button>}
      />
      <Card>
        <CardHeader>
          <CardTitle>Ofertas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {state.status === 'loading' && <LoadingState label="Carregando ofertas…" />}

          {state.status === 'error' && (
            <div role="alert" aria-live="polite" className="p-4 text-sm text-red-700">
              {state.message}
            </div>
          )}

          {state.status === 'success' && (
            state.offers.length === 0 ? (
              <EmptyState
                title="Nenhum registro em ofertas"
                description="Quando houver dados, eles aparecerão aqui."
                action={<Button size="sm">Adicionar</Button>}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Preço</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detalhe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.offers.map((offer) => (
                    <TableRow key={offer.id}>
                      <TableCell className="font-medium text-slate-900">{offer.name}</TableCell>
                      <TableCell>{formatBRL(offer.price)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={OFFER_STATUS_TONES[offer.status]}>
                          {OFFER_STATUS_LABELS[offer.status]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        {offer.validUntil
                          ? `Válida até ${formatDateBR(offer.validUntil, { assumeDateOnly: true })}`
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
