import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { LoadingState } from '../components/ui/loading-state';
import { ErrorState } from '../components/ui/error-state';
import { Modal } from '../components/ui/modal';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
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
import { ApiError, listOffers, createOffer, type CreateOfferInput } from '../lib/api';
import type { Offer, OfferStatus } from '../types/offer';

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

const emptyForm: CreateOfferInput = {
  name: '',
  description: '',
  price: 0,
  validFrom: '',
  validUntil: '',
};

export function OffersPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showNewOffer, setShowNewOffer] = useState(false);
  const [form, setForm] = useState<CreateOfferInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setState({ status: 'loading' });

    listOffers()
      .then((offers) => {
        setState({ status: 'success', offers });
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar as ofertas.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    if (!form.name.trim()) {
      setFormError('Informe o nome da oferta.');
      return;
    }
    if (form.price < 0) {
      setFormError('O preço não pode ser negativo.');
      return;
    }
    if (form.validFrom && form.validUntil && form.validFrom > form.validUntil) {
      setFormError('A data inicial não pode ser posterior à data final.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const input: CreateOfferInput = {
        name: form.name.trim(),
        price: form.price,
        ...(form.description?.trim() ? { description: form.description.trim() } : {}),
        ...(form.validFrom ? { validFrom: form.validFrom } : {}),
        ...(form.validUntil ? { validUntil: form.validUntil } : {}),
      };
      await createOffer(input);
      setShowNewOffer(false);
      setForm(emptyForm);
      load();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar a oferta.');
    } finally {
      setSaving(false);
    }
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  const offers = state.status === 'success' ? state.offers : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Ofertas"
        description="Ofertas e pacotes publicados pela agência."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Ofertas' }]}
        actions={
          <Button size="sm" onClick={() => setShowNewOffer(true)}>
            <Plus className="h-4 w-4" />
            Novo
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Ofertas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {state.status === 'loading' && <LoadingState label="Carregando ofertas…" />}

          {offers && (
            offers.length === 0 ? (
              <EmptyState
                title="Nenhum registro em ofertas"
                description="Quando houver dados, eles aparecerão aqui."
                action={<Button size="sm" onClick={() => setShowNewOffer(true)}>Adicionar</Button>}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Preço</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Válida até</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offers.map((offer) => (
                    <TableRow key={offer.id}>
                      <TableCell className="font-semibold text-slate-900">{offer.name}</TableCell>
                      <TableCell className="font-medium">{formatBRL(offer.price)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={OFFER_STATUS_TONES[offer.status]}>
                          {OFFER_STATUS_LABELS[offer.status]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {offer.validUntil
                          ? formatDateBR(offer.validUntil, { assumeDateOnly: true })
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link to={`/offers/${offer.id}`} className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                          Detalhe
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}
        </CardContent>
      </Card>

      <Modal
        open={showNewOffer}
        onClose={() => {
          setShowNewOffer(false);
          setForm(emptyForm);
          setFormError(null);
        }}
        title="Nova Oferta"
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Nome da Oferta *
            </label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Pacote Portugal"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Descrição
            </label>
            <Textarea
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Descreva brevemente a oferta"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Preço (BRL) *
            </label>
            <Input
              type="number"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
              placeholder="0,00"
              min="0"
              step="0.01"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Válida de
              </label>
              <Input
                type="date"
                value={form.validFrom || ''}
                onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Válida até
              </label>
              <Input
                type="date"
                value={form.validUntil || ''}
                onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
              />
            </div>
          </div>

          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm font-medium text-red-700">
              {formError}
            </div>
          )}
        </div>
        <div className="flex gap-3 justify-end border-t border-slate-100 bg-slate-50/50 p-5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowNewOffer(false);
              setForm(emptyForm);
              setFormError(null);
            }}
            disabled={saving}
          >
            Cancelar
          </Button>
          {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
          <Button size="sm" onClick={handleCreate} disabled={saving}>
            {saving ? 'Salvando…' : 'Criar'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
