import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getProposal, updateProposal } from '../lib/api';
import type { UpdateProposalInput } from '../types/proposal';
import { Button } from '../components/ui/button';

interface FormFields {
  proposedPrice: string;
  discount: string;
  validUntil: string;
  conditions: string;
  notes: string;
}

const emptyFields: FormFields = {
  proposedPrice: '',
  discount: '',
  validUntil: '',
  conditions: '',
  notes: '',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; status_field: string };

function mapLoadErrorToMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Proposta não encontrada.';
  }
  return 'Não foi possível carregar a proposta. Tente novamente.';
}

function mapSubmitErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Sessão local indisponível. Verifique a autenticação de desenvolvimento.';
      case 403:
        return 'Você não tem permissão para editar propostas.';
      case 404:
        return 'Proposta não encontrada.';
      default:
        return 'Não foi possível salvar a proposta. Tente novamente.';
    }
  }
  return 'Não foi possível salvar a proposta. Tente novamente.';
}

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

export function ProposalEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [fields, setFields] = useState<FormFields>(emptyFields);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setLoadState({ status: 'error', message: 'Proposta não encontrada.' });
      return;
    }

    setLoadState({ status: 'loading' });

    getProposal(id)
      .then((proposal) => {
        if (cancelled) return;
        setFields({
          proposedPrice: String(proposal.proposedPrice),
          discount: String(proposal.discount),
          validUntil: proposal.validUntil ?? '',
          conditions: proposal.conditions ?? '',
          notes: proposal.notes ?? '',
        });
        setLoadState({ status: 'ready', status_field: proposal.status });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadState({ status: 'error', message: mapLoadErrorToMessage(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  function updateField<K extends keyof FormFields>(key: K, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting || !id) {
      return;
    }

    setSubmitting(true);
    setError(null);

    const input: UpdateProposalInput = {};
    const proposedPrice = fields.proposedPrice.trim();
    const discount = fields.discount.trim();
    const validUntil = fields.validUntil.trim();
    const conditions = fields.conditions.trim();
    const notes = fields.notes.trim();
    if (proposedPrice) input.proposedPrice = Number(proposedPrice);
    if (discount) input.discount = Number(discount);
    if (validUntil) input.validUntil = validUntil;
    if (conditions) input.conditions = conditions;
    if (notes) input.notes = notes;

    try {
      await updateProposal(id, input);
      void navigate(`/proposals/${id}`);
    } catch (err: unknown) {
      setError(mapSubmitErrorToMessage(err));
      setSubmitting(false);
    }
  }

  if (loadState.status === 'loading') {
    return <p className="text-sm text-slate-500">Carregando proposta...</p>;
  }

  if (loadState.status === 'error') {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Editar proposta
        </h1>
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadState.message}
        </div>
      </div>
    );
  }

  const total = previewTotal(fields.proposedPrice, fields.discount);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Editar proposta
      </h1>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="flex max-w-lg flex-col gap-4"
      >
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
          <span className="font-medium">Total (prévia):</span> {total !== null ? total : '—'}
          <p className="mt-1 text-xs text-slate-500">
            Prévia apenas para exibição — o servidor recalcula e retorna o total oficial.
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

        <p className="text-xs text-slate-500">
          Status atual: {loadState.status_field} (somente leitura — não editável nesta versão).
        </p>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => void navigate(`/proposals/${id}`)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
