import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  Fish,
  ImageOff,
  Megaphone,
  Send,
  Share2,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { LoadingState } from '../components/ui/loading-state';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { StatusBadge, type StatusTone } from '../components/ui/status-badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  ApiError,
  approveCapture,
  captureUrl,
  listCaptures,
  publishCapture,
  reviewCapture,
  updateCapture,
  type Capture,
} from '../lib/api';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import { cn } from '../lib/utils';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; captures: Capture[] };

const CAPTURE_STATUS_LABELS: Record<Capture['status'], string> = {
  CAPTURED: 'Aguardando revisão',
  NORMALIZED: 'Aguardando revisão',
  UNDER_REVIEW: 'Em revisão',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  PUBLISHED: 'Convertida em oferta',
};

const CAPTURE_STATUS_TONES: Record<Capture['status'], StatusTone> = {
  CAPTURED: 'neutral',
  NORMALIZED: 'neutral',
  UNDER_REVIEW: 'attention',
  APPROVED: 'positive',
  REJECTED: 'inactive',
  PUBLISHED: 'positive',
};

const EDITABLE_STATUSES: Capture['status'][] = ['CAPTURED', 'NORMALIZED', 'UNDER_REVIEW'];

export function PescadorPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback((selectAfterId?: string) => {
    setState({ status: 'loading' });
    listCaptures()
      .then((captures) => {
        setState({ status: 'success', captures });
        setSelectedId((current) => {
          if (selectAfterId) return selectAfterId;
          if (current && captures.some((capture) => capture.id === current)) return current;
          return captures[0]?.id ?? null;
        });
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar as capturas.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCaptureUrl() {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setUrlError('Cole uma URL para pescar a oferta.');
      return;
    }
    try {
      new URL(trimmed);
    } catch {
      setUrlError('Informe uma URL válida, incluindo http ou https.');
      return;
    }

    setBusyAction('capture');
    setUrlError(null);
    setActionError(null);
    try {
      const capture = await captureUrl(trimmed);
      setUrlInput('');
      load(capture.id);
    } catch (err: unknown) {
      setUrlError(err instanceof ApiError ? err.message : 'Não foi possível pescar esta oferta.');
    } finally {
      setBusyAction(null);
    }
  }

  async function runCaptureAction(capture: Capture, action: 'review' | 'approve' | 'publish') {
    setBusyAction(`${action}:${capture.id}`);
    setActionError(null);
    try {
      if (action === 'review') {
        await reviewCapture(capture.id);
      } else if (action === 'approve') {
        await approveCapture(capture.id);
      } else {
        await publishCapture(capture.id);
      }
      load(capture.id);
    } catch (err: unknown) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível atualizar a captura.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveEdit(capture: Capture, patch: {
    normalizedTitle: string;
    normalizedDescription: string;
    foundPrice: string;
    currency: string;
    validUntil: string;
  }) {
    setBusyAction(`edit:${capture.id}`);
    setActionError(null);
    try {
      const priceValue = patch.foundPrice.trim().length > 0 ? Number(patch.foundPrice.replace(',', '.')) : undefined;
      const title = patch.normalizedTitle.trim();
      const description = patch.normalizedDescription.trim();
      const currency = patch.currency.trim();
      await updateCapture(capture.id, {
        ...(title ? { normalizedTitle: title } : {}),
        ...(description ? { normalizedDescription: description } : {}),
        ...(priceValue !== undefined && Number.isFinite(priceValue) ? { foundPrice: priceValue } : {}),
        ...(currency ? { currency } : {}),
        validUntil: patch.validUntil.trim().length > 0 ? patch.validUntil : null,
      });
      load(capture.id);
    } catch (err: unknown) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível salvar as correções.');
    } finally {
      setBusyAction(null);
    }
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={() => load()} />;
  }

  const captures = state.status === 'success' ? state.captures : null;
  const selected = captures?.find((capture) => capture.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pescador"
        description="Cole a URL de uma oferta externa, revise os dados capturados e transforme apenas o que foi aprovado em oferta própria."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Pescador' }]}
      />

      {/* Área 1 — Captura rápida */}
      <Card>
        <CardHeader>
          <CardTitle>1. Captura rápida</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="capture-url" className="sr-only">URL da oferta</label>
            <Input
              id="capture-url"
              value={urlInput}
              onChange={(event) => {
                setUrlInput(event.target.value);
                setUrlError(null);
              }}
              placeholder="https://fornecedor.com/oferta"
              disabled={busyAction === 'capture'}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && busyAction !== 'capture') {
                  void handleCaptureUrl();
                }
              }}
            />
            <Button onClick={() => void handleCaptureUrl()} disabled={busyAction === 'capture'}>
              <Fish className="h-4 w-4" />
              {busyAction === 'capture' ? 'Capturando...' : 'Capturar'}
            </Button>
          </div>
          {urlError && <p role="alert" className="text-sm font-medium text-red-700">{urlError}</p>}

          {captures && captures.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Capturas recentes</p>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {captures.map((capture) => (
                  <li key={capture.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(capture.id)}
                      className={cn(
                        'flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between',
                        selectedId === capture.id && 'bg-blue-50/60',
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {capture.normalizedTitle ?? 'Título pendente'}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {capture.sourceName} · {capture.sourceUrl}
                        </p>
                      </div>
                      <StatusBadge tone={CAPTURE_STATUS_TONES[capture.status]}>
                        {CAPTURE_STATUS_LABELS[capture.status]}
                      </StatusBadge>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {actionError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {state.status === 'loading' && <LoadingState label="Carregando capturas..." />}

      {captures && captures.length === 0 && (
        <EmptyState
          title="Nenhuma captura ainda"
          description="Cole uma URL acima para iniciar o fluxo de captura, revisão e criação de oferta."
          icon={<Fish className="h-8 w-8" />}
        />
      )}

      {selected && (
        <CaptureWorkflow
          key={selected.id}
          capture={selected}
          busyAction={busyAction}
          onReview={() => void runCaptureAction(selected, 'review')}
          onApprove={() => void runCaptureAction(selected, 'approve')}
          onPublish={() => void runCaptureAction(selected, 'publish')}
          onSaveEdit={(patch) => void handleSaveEdit(selected, patch)}
        />
      )}
    </div>
  );
}

interface EditFormState {
  normalizedTitle: string;
  normalizedDescription: string;
  foundPrice: string;
  currency: string;
  validUntil: string;
}

function toEditForm(capture: Capture): EditFormState {
  return {
    normalizedTitle: capture.normalizedTitle ?? '',
    normalizedDescription: capture.normalizedDescription ?? '',
    foundPrice: capture.foundPrice !== undefined ? String(capture.foundPrice) : '',
    currency: capture.currency ?? 'BRL',
    validUntil: capture.validUntil ? capture.validUntil.slice(0, 10) : '',
  };
}

function CaptureWorkflow({
  capture,
  busyAction,
  onReview,
  onApprove,
  onPublish,
  onSaveEdit,
}: {
  capture: Capture;
  busyAction: string | null;
  onReview: () => void;
  onApprove: () => void;
  onPublish: () => void;
  onSaveEdit: (patch: EditFormState) => void;
}) {
  const [editForm, setEditForm] = useState<EditFormState>(() => toEditForm(capture));
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setEditForm(toEditForm(capture));
    setIsDirty(false);
  }, [capture.id, capture.updatedAt]);

  const details = useMemo(() => getCaptureDetails(capture), [capture]);
  const hasFetchFailure = capture.normalizedDescription?.startsWith('Não foi possível extrair os dados automaticamente') ?? false;

  const missingFields: string[] = [];
  if (!capture.normalizedTitle || capture.normalizedTitle === 'Falha ao capturar') missingFields.push('título');
  if (capture.foundPrice === undefined) missingFields.push('preço');
  if (!capture.normalizedDescription || hasFetchFailure) missingFields.push('descrição');
  if (!capture.validUntil) missingFields.push('validade');

  const isEditable = EDITABLE_STATUSES.includes(capture.status);
  const canReview = capture.status === 'CAPTURED' || capture.status === 'NORMALIZED';
  const canApprove = capture.status === 'UNDER_REVIEW';
  const canPublish = capture.status === 'APPROVED';
  const isPublished = capture.status === 'PUBLISHED';
  const isBusy = busyAction !== null;

  return (
    <div className="space-y-6">
      {/* Área 2 — Dados extraídos */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>2. Dados extraídos</CardTitle>
          <StatusBadge tone={CAPTURE_STATUS_TONES[capture.status]}>
            {CAPTURE_STATUS_LABELS[capture.status]}
          </StatusBadge>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasFetchFailure && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                A extração automática desta URL falhou. Os campos abaixo não foram preenchidos pelo Pescador —
                complete-os manualmente na Área 3 antes de aprovar.
              </span>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="URL de origem" value={capture.sourceUrl} wide isLink />
            <Info label="Fornecedor / origem" value={capture.sourceName} />
            <Info label="Título" value={capture.normalizedTitle ?? 'Não detectado'} missing={!capture.normalizedTitle} />
            <Info label="Destino" value={details.destino} missing={details.destinoInferred} />
            <Info label="Preço" value={formatCapturePrice(capture)} missing={capture.foundPrice === undefined} />
            <Info label="Moeda" value={capture.currency ?? 'BRL'} />
            <Info
              label="Validade"
              value={capture.validUntil ? formatDateBR(capture.validUntil, { assumeDateOnly: true }) : 'Sem validade informada'}
              missing={!capture.validUntil}
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Imagens</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-slate-500">
                <ImageOff className="h-3.5 w-3.5" />
                Nenhuma imagem detectada
              </p>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Descrição</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {hasFetchFailure ? 'Descrição pendente de preenchimento manual.' : capture.normalizedDescription ?? 'Nenhuma descrição extraída.'}
            </p>
          </div>
          <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">
              Conteúdo bruto capturado
            </summary>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-600">
              {capture.rawContent}
            </pre>
          </details>
        </CardContent>
      </Card>

      {/* Área 3 — Revisão */}
      <Card>
        <CardHeader>
          <CardTitle>3. Revisão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {missingFields.length > 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Campos faltantes antes de aprovar: <strong>{missingFields.join(', ')}</strong>.
                Complete-os abaixo ou edite manualmente.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Nenhuma divergência encontrada. Dados prontos para revisão.
            </div>
          )}

          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveEdit(editForm);
              setIsDirty(false);
            }}
          >
            <Field label="Título" htmlFor="edit-title">
              <Input
                id="edit-title"
                value={editForm.normalizedTitle}
                disabled={!isEditable || isBusy}
                onChange={(event) => {
                  setEditForm((prev) => ({ ...prev, normalizedTitle: event.target.value }));
                  setIsDirty(true);
                }}
              />
            </Field>
            <Field label="Preço" htmlFor="edit-price">
              <Input
                id="edit-price"
                inputMode="decimal"
                placeholder="0,00"
                value={editForm.foundPrice}
                disabled={!isEditable || isBusy}
                onChange={(event) => {
                  setEditForm((prev) => ({ ...prev, foundPrice: event.target.value }));
                  setIsDirty(true);
                }}
              />
            </Field>
            <Field label="Moeda" htmlFor="edit-currency">
              <Input
                id="edit-currency"
                value={editForm.currency}
                disabled={!isEditable || isBusy}
                onChange={(event) => {
                  setEditForm((prev) => ({ ...prev, currency: event.target.value }));
                  setIsDirty(true);
                }}
              />
            </Field>
            <Field label="Validade" htmlFor="edit-valid-until">
              <Input
                id="edit-valid-until"
                type="date"
                value={editForm.validUntil}
                disabled={!isEditable || isBusy}
                onChange={(event) => {
                  setEditForm((prev) => ({ ...prev, validUntil: event.target.value }));
                  setIsDirty(true);
                }}
              />
            </Field>
            <Field label="Descrição" htmlFor="edit-description" wide>
              <textarea
                id="edit-description"
                className="min-h-[88px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                value={editForm.normalizedDescription}
                disabled={!isEditable || isBusy}
                onChange={(event) => {
                  setEditForm((prev) => ({ ...prev, normalizedDescription: event.target.value }));
                  setIsDirty(true);
                }}
              />
            </Field>
            {isEditable && (
              <div className="sm:col-span-2">
                <Button type="submit" variant="outline" size="sm" disabled={!isDirty || isBusy}>
                  {busyAction === `edit:${capture.id}` ? 'Salvando...' : 'Salvar correções'}
                </Button>
              </div>
            )}
          </form>

          {!isEditable && (
            <p className="text-xs text-slate-500">
              Esta captura já foi {capture.status === 'REJECTED' ? 'rejeitada' : 'aprovada ou publicada'} e não pode mais ser editada manualmente.
            </p>
          )}

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <Button
              size="sm"
              variant="outline"
              onClick={onReview}
              disabled={!canReview || isBusy}
            >
              <Eye className="h-4 w-4" />
              Enviar para revisão
            </Button>
            <Button
              size="sm"
              onClick={onApprove}
              disabled={!canApprove || isBusy || missingFields.length > 0}
              title={missingFields.length > 0 ? 'Complete os campos faltantes antes de aprovar' : undefined}
            >
              <CheckCircle2 className="h-4 w-4" />
              Aprovar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Área 4 — Resultado */}
      <Card>
        <CardHeader>
          <CardTitle>4. Resultado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isPublished ? (
            <>
              <p className="text-sm text-slate-600">
                Depois de aprovada, a captura pode ser transformada em uma oferta própria da agência.
              </p>
              <Button onClick={onPublish} disabled={!canPublish || isBusy}>
                <Send className="h-4 w-4" />
                Criar oferta
              </Button>
              {!canPublish && (
                <p className="text-xs text-slate-500">
                  Disponível após a captura ser aprovada na Área 3.
                </p>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Oferta criada a partir desta captura.
              </div>
              <div className="flex flex-wrap gap-2">
                {capture.publishedOfferId && (
                  <Link to={`/offers/${capture.publishedOfferId}`}>
                    <Button size="sm" variant="outline">
                      <ExternalLink className="h-4 w-4" />
                      Ver oferta
                    </Button>
                  </Link>
                )}
                <Link to={`/proposals?offerId=${capture.publishedOfferId ?? ''}`}>
                  <Button size="sm" variant="outline">
                    <Share2 className="h-4 w-4" />
                    Usar em proposta
                  </Button>
                </Link>
                <Link to={`/campaigns?offerId=${capture.publishedOfferId ?? ''}`}>
                  <Button size="sm" variant="outline">
                    <Megaphone className="h-4 w-4" />
                    Vincular a campanha
                  </Button>
                </Link>
              </div>
              <p className="text-xs text-slate-500">
                &ldquo;Usar em proposta&rdquo; e &ldquo;Vincular a campanha&rdquo; levam para as respectivas telas com a
                oferta já criada — a seleção automática dentro da proposta/campanha ainda depende de um fluxo dedicado,
                que fica para uma próxima onda.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  wide,
  children,
}: {
  label: string;
  htmlFor: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function Info({
  label,
  value,
  wide = false,
  missing = false,
  isLink = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
  missing?: boolean;
  isLink?: boolean;
}) {
  return (
    <div className={wide ? 'min-w-0 sm:col-span-2' : 'min-w-0'}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      {isLink ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-sm font-medium text-blue-700 hover:text-blue-800"
        >
          <span className="truncate">{value}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        <p className={cn('mt-1 break-words text-sm font-medium', missing ? 'text-slate-400 italic' : 'text-slate-900')}>
          {value}
        </p>
      )}
    </div>
  );
}

function formatCapturePrice(capture: Capture): string {
  if (capture.foundPrice === undefined) return 'Não detectado';
  if (capture.currency === 'BRL' || capture.currency === undefined) return formatBRL(capture.foundPrice);
  return `${capture.currency} ${capture.foundPrice.toLocaleString('pt-BR')}`;
}

function getCaptureDetails(capture: Capture) {
  const raw = readRawContent(capture.rawContent);
  const destino = readString(raw, 'destination') ?? readString(raw, 'destino') ?? destinationFromTitle(capture.normalizedTitle);
  return {
    destino,
    destinoInferred: !readString(raw, 'destination') && !readString(raw, 'destino'),
  };
}

function readRawContent(rawContent: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(rawContent);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function destinationFromTitle(title: string | undefined): string {
  if (!title) return 'Não detectado';
  return title.split(' com ')[0] ?? title;
}
