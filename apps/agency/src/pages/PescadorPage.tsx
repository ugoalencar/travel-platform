import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Eye, Fish, Send } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
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
  type Capture,
} from '../lib/api';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; captures: Capture[] };

const CAPTURE_STATUS_LABELS: Record<Capture['status'], string> = {
  CAPTURED: 'Capturada',
  NORMALIZED: 'Capturada',
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

export function PescadorPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    listCaptures()
      .then((captures) => setState({ status: 'success', captures }))
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar as capturas.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      await captureUrl(trimmed);
      setUrlInput('');
      load();
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
      load();
    } catch (err: unknown) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível atualizar a captura.');
    } finally {
      setBusyAction(null);
    }
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  const captures = state.status === 'success' ? state.captures : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pescador"
        description="Pesque ofertas externas, revise os dados capturados e converta apenas ofertas aprovadas."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Pescador' }]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Colar URL</CardTitle>
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
              {busyAction === 'capture' ? 'Pescando...' : 'Pescar'}
            </Button>
          </div>
          {urlError && <p role="alert" className="text-sm font-medium text-red-700">{urlError}</p>}
        </CardContent>
      </Card>

      {actionError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {state.status === 'loading' && <LoadingState label="Carregando capturas..." />}

      {captures && (
        captures.length === 0 ? (
          <EmptyState
            title="Nenhuma captura"
            description="Cole uma URL para iniciar o fluxo de revisão."
          />
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Fila de revisão</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead>Título</TableHead>
                      <TableHead>Fonte</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead>Preço</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {captures.map((capture) => {
                      const details = getCaptureDetails(capture);
                      return (
                        <TableRow key={capture.id}>
                          <TableCell className="max-w-xs truncate text-xs">
                            <a
                              href={capture.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-800"
                            >
                              {capture.sourceUrl}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </TableCell>
                          <TableCell className="max-w-xs break-words font-medium text-slate-900">
                            {capture.normalizedTitle ?? 'Título pendente'}
                          </TableCell>
                          <TableCell>{capture.sourceName}</TableCell>
                          <TableCell>{details.destino}</TableCell>
                          <TableCell>{formatCapturePrice(capture)}</TableCell>
                          <TableCell>
                            <StatusBadge tone={CAPTURE_STATUS_TONES[capture.status]}>
                              {CAPTURE_STATUS_LABELS[capture.status]}
                            </StatusBadge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void runCaptureAction(capture, 'review')}
                                disabled={!['CAPTURED', 'NORMALIZED'].includes(capture.status) || busyAction !== null}
                                aria-label={`Revisar captura ${capture.normalizedTitle ?? capture.sourceName}`}
                              >
                                <Eye className="h-4 w-4" />
                                Revisar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void runCaptureAction(capture, 'approve')}
                                disabled={capture.status !== 'UNDER_REVIEW' || busyAction !== null}
                                aria-label={`Aprovar captura ${capture.normalizedTitle ?? capture.sourceName}`}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                Aprovar
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => void runCaptureAction(capture, 'publish')}
                                disabled={capture.status !== 'APPROVED' || busyAction !== null}
                                aria-label={`Criar oferta ${capture.normalizedTitle ?? capture.sourceName}`}
                              >
                                <Send className="h-4 w-4" />
                                Criar oferta
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {captures.map((capture) => {
              const details = getCaptureDetails(capture);
              return (
                <Card key={`${capture.id}-review`}>
                  <CardHeader>
                    <CardTitle>{capture.normalizedTitle ?? 'Captura sem título'}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Info label="URL" value={capture.sourceUrl} wide />
                      <Info label="Fonte" value={capture.sourceName} />
                      <Info label="Destino" value={details.destino} />
                      <Info label="Preço" value={formatCapturePrice(capture)} />
                      <Info label="Moeda" value={capture.currency ?? 'BRL'} />
                      <Info label="Hotel" value={details.hotel} />
                      <Info label="Datas" value={details.datas} />
                      <Info label="Transporte" value={details.transporte} />
                      <Info label="Inclusões" value={details.inclusoes} wide />
                      <Info label="Validade" value={capture.validUntil ? formatDateBR(capture.validUntil, { assumeDateOnly: true }) : 'Sem validade'} />
                      <Info label="Imagens" value={details.imagens} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Descrição</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {capture.normalizedDescription ?? 'Revise a captura antes de aprovar.'}
                      </p>
                    </div>
                    <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                        Detalhes avançados da extração
                      </summary>
                      <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-600">
                        {capture.rawContent}
                      </pre>
                    </details>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'min-w-0 sm:col-span-2' : 'min-w-0'}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function formatCapturePrice(capture: Capture): string {
  if (capture.foundPrice === undefined) return 'Preço pendente';
  if (capture.currency === 'BRL' || capture.currency === undefined) return formatBRL(capture.foundPrice);
  return `${capture.currency} ${capture.foundPrice.toLocaleString('pt-BR')}`;
}

function getCaptureDetails(capture: Capture) {
  const raw = readRawContent(capture.rawContent);
  return {
    destino: readString(raw, 'destination') ?? readString(raw, 'destino') ?? destinationFromTitle(capture.normalizedTitle),
    hotel: readString(raw, 'hotel') ?? 'Hotel a confirmar',
    datas: readString(raw, 'dates') ?? readString(raw, 'datas') ?? 'Datas a confirmar',
    transporte: readString(raw, 'transport') ?? readString(raw, 'transporte') ?? 'Transporte a confirmar',
    inclusoes: readString(raw, 'inclusions') ?? readString(raw, 'inclusoes') ?? 'Inclusões a revisar',
    imagens: readString(raw, 'images') ?? readString(raw, 'imagens') ?? 'Sem imagens anexadas',
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
  if (!title) return 'Destino a confirmar';
  return title.split(' com ')[0] ?? title;
}
