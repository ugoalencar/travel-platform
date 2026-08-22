import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createProposal, listCustomers, listOffers, listWishes } from '../lib/api';
import type { CreateProposalInput } from '../types/proposal';
import type { Customer } from '../types/customer';
import type { Offer } from '../types/offer';
import type { Wish } from '../types/wish';
import { Button } from '../components/ui/button';

interface FormFields {
  customerId: string;
  offerId: string;
  wishId: string;
  proposedPrice: string;
  discount: string;
  validUntil: string;
  conditions: string;
  notes: string;
}

const initialFields: FormFields = {
  customerId: '',
  offerId: '',
  wishId: '',
  proposedPrice: '',
  discount: '',
  validUntil: '',
  conditions: '',
  notes: '',
};

type RelationsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; customers: Customer[]; offers: Offer[]; wishes: Wish[] };

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Sessão local indisponível. Verifique a autenticação de desenvolvimento.';
      case 403:
        return 'Você não tem permissão para criar propostas.';
      case 404:
        return 'Cliente, oferta ou desejo selecionado não encontrado.';
      default:
        return 'Não foi possível salvar a proposta. Tente novamente.';
    }
  }
  return 'Não foi possível salvar a proposta. Tente novamente.';
}

/** Client-side preview only; the server always computes the authoritative total. */
function previewTotal(proposedPrice: string, discount: string): number | null {
  const price = Number(proposedPrice);
  if (proposedPrice.trim() === '' || Number.isNaN(price)) {
    return null;
  }
  const discountValue = discount.trim() === '' ? 0 : Number(discount);
  if (Number.isNaN(discountValue)) {
    return null;
  }
  return price - discountValue;
}

export function ProposalFormPage() {
  const navigate = useNavigate();
  const [fields, setFields] = useState<FormFields>(initialFields);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relationsState, setRelationsState] = useState<RelationsState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    setRelationsState({ status: 'loading' });

    Promise.all([listCustomers(), listOffers().catch(() => []), listWishes().catch(() => [])])
      .then(([customers, offers, wishes]) => {
        if (cancelled) return;
        setRelationsState({ status: 'ready', customers, offers, wishes });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? err.message : 'Não foi possível carregar os dados relacionados.';
        setRelationsState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function updateField<K extends keyof FormFields>(key: K, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleOfferChange(offerId: string) {
    updateField('offerId', offerId);
    if (relationsState.status !== 'ready' || !offerId || fields.proposedPrice.trim() !== '') {
      return;
    }
    // UX convenience pre-fill only: selecting an Offer suggests its price, but this is
    // reversible and never syncs again after this point (no backend rule follows it).
    const offer = relationsState.offers.find((o) => o.id === offerId);
    if (offer) {
      updateField('proposedPrice', String(offer.price));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const customerId = fields.customerId.trim();
    if (!customerId) {
      setError('Cliente é obrigatório.');
      return;
    }

    const proposedPrice = fields.proposedPrice.trim();
    if (!proposedPrice || Number.isNaN(Number(proposedPrice))) {
      setError('Preço proposto é obrigatório.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const input: CreateProposalInput = {
      customerId,
      proposedPrice: Number(proposedPrice),
    };
    if (fields.offerId.trim()) input.offerId = fields.offerId.trim();
    if (fields.wishId.trim()) input.wishId = fields.wishId.trim();
    if (fields.discount.trim()) input.discount = Number(fields.discount.trim());
    if (fields.validUntil.trim()) input.validUntil = fields.validUntil.trim();
    if (fields.conditions.trim()) input.conditions = fields.conditions.trim();
    if (fields.notes.trim()) input.notes = fields.notes.trim();

    try {
      const created = await createProposal(input);
      void navigate(`/proposals/${created.id}`);
    } catch (err: unknown) {
      setError(mapErrorToMessage(err));
      setSubmitting(false);
    }
  }

  const total = previewTotal(fields.proposedPrice, fields.discount);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Nova proposta
      </h1>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {relationsState.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {relationsState.message}
        </div>
      )}

      {relationsState.status === 'ready' && relationsState.customers.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Nenhum cliente disponível. Cadastre um cliente antes de criar uma proposta.{' '}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => void navigate('/customers/new')}
          >
            Cadastrar cliente
          </button>
        </div>
      )}

      {(relationsState.status === 'ready' || relationsState.status === 'loading') && (
        <form
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          className="flex max-w-lg flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="proposal-customer" className="text-sm font-medium text-slate-700">
              Cliente
            </label>
            <select
              id="proposal-customer"
              name="customerId"
              disabled={relationsState.status === 'loading'}
              value={fields.customerId}
              onChange={(event) => updateField('customerId', event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">
                {relationsState.status === 'loading' ? 'Carregando clientes...' : 'Selecione um cliente'}
              </option>
              {relationsState.status === 'ready' &&
                relationsState.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="proposal-offer" className="text-sm font-medium text-slate-700">
              Oferta (opcional)
            </label>
            <select
              id="proposal-offer"
              name="offerId"
              disabled={relationsState.status === 'loading'}
              value={fields.offerId}
              onChange={(event) => handleOfferChange(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Nenhuma</option>
              {relationsState.status === 'ready' &&
                relationsState.offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="proposal-wish" className="text-sm font-medium text-slate-700">
              Desejo (opcional)
            </label>
            <select
              id="proposal-wish"
              name="wishId"
              disabled={relationsState.status === 'loading'}
              value={fields.wishId}
              onChange={(event) => updateField('wishId', event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Nenhum</option>
              {relationsState.status === 'ready' &&
                relationsState.wishes.map((wish) => (
                  <option key={wish.id} value={wish.id}>
                    {wish.destination ?? wish.id}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="proposal-price" className="text-sm font-medium text-slate-700">
              Preço proposto
            </label>
            <input
              id="proposal-price"
              name="proposedPrice"
              type="number"
              min="0"
              step="0.01"
              value={fields.proposedPrice}
              onChange={(event) => updateField('proposedPrice', event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="proposal-discount" className="text-sm font-medium text-slate-700">
              Desconto (valor absoluto)
            </label>
            <input
              id="proposal-discount"
              name="discount"
              type="number"
              min="0"
              step="0.01"
              value={fields.discount}
              onChange={(event) => updateField('discount', event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <span className="font-medium">Total (prévia):</span>{' '}
            {total !== null ? total : '—'}
            <p className="mt-1 text-xs text-slate-500">
              Prévia apenas para exibição — o servidor calcula e retorna o total oficial.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="proposal-valid-until" className="text-sm font-medium text-slate-700">
              Válida até
            </label>
            <input
              id="proposal-valid-until"
              name="validUntil"
              type="date"
              value={fields.validUntil}
              onChange={(event) => updateField('validUntil', event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="proposal-conditions" className="text-sm font-medium text-slate-700">
              Condições
            </label>
            <textarea
              id="proposal-conditions"
              name="conditions"
              value={fields.conditions}
              onChange={(event) => updateField('conditions', event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              rows={3}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="proposal-notes" className="text-sm font-medium text-slate-700">
              Notas
            </label>
            <textarea
              id="proposal-notes"
              name="notes"
              value={fields.notes}
              onChange={(event) => updateField('notes', event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => void navigate('/proposals')}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
