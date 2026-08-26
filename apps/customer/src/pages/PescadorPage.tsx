import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ApiError,
  approveExternalOfferCapture,
  createExternalOfferCapture,
  listExternalOfferCaptures,
  publishExternalOfferCapture,
  rejectExternalOfferCapture,
  reviewExternalOfferCapture,
} from '../lib/api';
import type {
  CreateExternalOfferCaptureInput,
  ExternalOfferCapture,
  ExternalOfferCaptureStatus,
} from '../types/pescador';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; captures: ExternalOfferCapture[] };

interface CaptureFormState {
  sourceUrl: string;
  sourceName: string;
  rawContent: string;
  normalizedTitle: string;
  normalizedDescription: string;
  foundPrice: string;
  currency: string;
  validUntil: string;
}

const initialFormState: CaptureFormState = {
  sourceUrl: '',
  sourceName: '',
  rawContent: '',
  normalizedTitle: '',
  normalizedDescription: '',
  foundPrice: '',
  currency: 'BRL',
  validUntil: '',
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

export function PescadorPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [form, setForm] = useState<CaptureFormState>(initialFormState);
  const [isSubmitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading' });
    listExternalOfferCaptures()
      .then((captures) => {
        if (cancelled) return;
        setState({ status: 'success', captures });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message:
            error instanceof ApiError
              ? error.message
              : 'Nao foi possivel carregar as capturas.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(
    () => buildStats(state.status === 'success' ? state.captures : []),
    [state],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const input = buildCreateInput(form);
    if (!input) {
      setFormError('Informe origem, URL e conteudo bruto da captura.');
      return;
    }

    setSubmitting(true);
    try {
      const capture = await createExternalOfferCapture(input);
      setState((current) =>
        current.status === 'success'
          ? { status: 'success', captures: [capture, ...current.captures] }
          : { status: 'success', captures: [capture] },
      );
      setForm(initialFormState);
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Nao foi possivel criar a captura.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function runAction(
    capture: ExternalOfferCapture,
    action: (id: string) => Promise<ExternalOfferCapture>,
  ) {
    setActionId(capture.id);
    setFormError(null);
    try {
      const updated = await action(capture.id);
      setState((current) =>
        current.status === 'success'
          ? {
              status: 'success',
              captures: current.captures.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            }
          : current,
      );
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'Nao foi possivel atualizar a captura.',
      );
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Pescador
        </h1>
        <p className="text-sm text-slate-500">
          Capturas externas revisadas antes de virarem ofertas publicadas.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Capturadas" value={stats.captured} />
        <MetricCard label="Em revisao" value={stats.review} />
        <MetricCard label="Aprovadas" value={stats.approved} />
        <MetricCard label="Publicadas" value={stats.published} />
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Nova captura</h2>
          <p className="text-sm text-slate-500">
            Cole o material encontrado e, quando possivel, normalize titulo e preco.
          </p>
        </div>

        <form className="grid gap-4 lg:grid-cols-2" onSubmit={(event) => void handleSubmit(event)}>
          <TextField
            label="Fonte"
            value={form.sourceName}
            onChange={(value) => setForm((current) => ({ ...current, sourceName: value }))}
            required
          />
          <TextField
            label="URL"
            type="url"
            value={form.sourceUrl}
            onChange={(value) => setForm((current) => ({ ...current, sourceUrl: value }))}
            required
          />
          <TextField
            label="Titulo normalizado"
            value={form.normalizedTitle}
            onChange={(value) =>
              setForm((current) => ({ ...current, normalizedTitle: value }))
            }
          />
          <div className="grid gap-4 sm:grid-cols-[1fr_120px_160px]">
            <TextField
              label="Preco encontrado"
              type="number"
              min="0"
              step="0.01"
              value={form.foundPrice}
              onChange={(value) => setForm((current) => ({ ...current, foundPrice: value }))}
            />
            <TextField
              label="Moeda"
              value={form.currency}
              onChange={(value) => setForm((current) => ({ ...current, currency: value }))}
            />
            <TextField
              label="Validade"
              type="date"
              value={form.validUntil}
              onChange={(value) => setForm((current) => ({ ...current, validUntil: value }))}
            />
          </div>
          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="text-sm font-medium text-slate-700">Conteudo bruto</span>
            <textarea
              className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
              value={form.rawContent}
              onChange={(event) =>
                setForm((current) => ({ ...current, rawContent: event.target.value }))
              }
              required
            />
          </label>
          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="text-sm font-medium text-slate-700">
              Descricao normalizada
            </span>
            <textarea
              className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
              value={form.normalizedDescription}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  normalizedDescription: event.target.value,
                }))
              }
            />
          </label>

          {formError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 lg:col-span-2">
              {formError}
            </div>
          )}

          <div className="lg:col-span-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:pointer-events-none disabled:opacity-50"
            >
              {isSubmitting ? 'Salvando...' : 'Salvar captura'}
            </button>
          </div>
        </form>
      </section>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando capturas...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <CapturesTable
          captures={state.captures}
          actionId={actionId}
          onAction={(capture, action) => void runAction(capture, action)}
        />
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function CapturesTable({
  captures,
  actionId,
  onAction,
}: {
  captures: ExternalOfferCapture[];
  actionId: string | null;
  onAction: (
    capture: ExternalOfferCapture,
    action: (id: string) => Promise<ExternalOfferCapture>,
  ) => void;
}) {
  if (captures.length === 0) {
    return <p className="text-sm text-slate-500">Nenhuma captura encontrada.</p>;
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Capturas</h2>
          <p className="text-sm text-slate-500">
            Revisao manual, aprovacao e publicacao explicita como oferta.
          </p>
        </div>
        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          {captures.length} itens
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Fonte</th>
              <th className="px-4 py-3">Titulo</th>
              <th className="px-4 py-3">Validade</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Preco</th>
              <th className="px-4 py-3 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {captures.map((capture) => (
              <tr key={capture.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{capture.sourceName}</div>
                  <a
                    className="text-xs text-slate-500 underline-offset-4 hover:underline"
                    href={capture.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Origem
                  </a>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {capture.normalizedTitle ?? capture.rawContent}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {capture.validUntil ? formatDate(capture.validUntil) : '-'}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={capture.status} />
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">
                  {capture.foundPrice == null ? '-' : formatCurrency(capture.foundPrice)}
                </td>
                <td className="px-4 py-3">
                  <ActionButtons
                    capture={capture}
                    busy={actionId === capture.id}
                    onAction={onAction}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ActionButtons({
  capture,
  busy,
  onAction,
}: {
  capture: ExternalOfferCapture;
  busy: boolean;
  onAction: (
    capture: ExternalOfferCapture,
    action: (id: string) => Promise<ExternalOfferCapture>,
  ) => void;
}) {
  const actions: Array<{
    label: string;
    visible: boolean;
    run: (id: string) => Promise<ExternalOfferCapture>;
  }> = [
    {
      label: 'Revisar',
      visible: capture.status === 'CAPTURED' || capture.status === 'NORMALIZED',
      run: reviewExternalOfferCapture,
    },
    {
      label: 'Aprovar',
      visible: capture.status === 'UNDER_REVIEW',
      run: approveExternalOfferCapture,
    },
    {
      label: 'Rejeitar',
      visible:
        capture.status === 'CAPTURED' ||
        capture.status === 'NORMALIZED' ||
        capture.status === 'UNDER_REVIEW',
      run: rejectExternalOfferCapture,
    },
    {
      label: 'Publicar',
      visible: capture.status === 'APPROVED',
      run: publishExternalOfferCapture,
    },
  ].filter((action) => action.visible);

  if (actions.length === 0) {
    return <span className="block text-right text-xs text-slate-500">Sem acoes</span>;
  }

  return (
    <div className="flex justify-end gap-2">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          disabled={busy}
          onClick={() => {
            onAction(capture, action.run);
          }}
          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
        >
          {busy ? '...' : action.label}
        </button>
      ))}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  min,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  min?: string;
  step?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
        type={type}
        value={value}
        required={required}
        min={min}
        step={step}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function StatusBadge({ status }: { status: ExternalOfferCaptureStatus }) {
  return (
    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
      {status}
    </span>
  );
}

function buildCreateInput(
  form: CaptureFormState,
): CreateExternalOfferCaptureInput | null {
  const sourceUrl = form.sourceUrl.trim();
  const sourceName = form.sourceName.trim();
  const rawContent = form.rawContent.trim();

  if (!sourceUrl || !sourceName || !rawContent) return null;

  const input: CreateExternalOfferCaptureInput = {
    sourceUrl,
    sourceName,
    rawContent,
  };

  const normalizedTitle = form.normalizedTitle.trim();
  const normalizedDescription = form.normalizedDescription.trim();
  const currency = form.currency.trim();

  if (normalizedTitle) input.normalizedTitle = normalizedTitle;
  if (normalizedDescription) input.normalizedDescription = normalizedDescription;
  if (form.foundPrice) input.foundPrice = Number(form.foundPrice);
  if (currency) input.currency = currency;
  if (form.validUntil) input.validUntil = `${form.validUntil}T00:00:00.000Z`;

  return input;
}

function buildStats(captures: ExternalOfferCapture[]) {
  return captures.reduce(
    (stats, capture) => {
      if (capture.status === 'CAPTURED' || capture.status === 'NORMALIZED') {
        stats.captured += 1;
      }
      if (capture.status === 'UNDER_REVIEW') stats.review += 1;
      if (capture.status === 'APPROVED') stats.approved += 1;
      if (capture.status === 'PUBLISHED') stats.published += 1;
      return stats;
    },
    { captured: 0, review: 0, approved: 0, published: 0 },
  );
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}
