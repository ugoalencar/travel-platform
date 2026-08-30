import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { LoadingState } from '../components/ui/loading-state';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { StatusBadge } from '../components/ui/status-badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Modal } from '../components/ui/modal';
import { Textarea } from '../components/ui/textarea';
import {
  ApiError,
  listCaptures,
  captureUrl,
  deleteCapture,
  createOffer,
  type Capture,
  type CreateOfferInput,
} from '../lib/api';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; captures: Capture[] };

const emptyForm: CreateOfferInput = {
  name: '',
  description: '',
  price: 0,
  validFrom: '',
  validUntil: '',
};

export function PescadorPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [urlInput, setUrlInput] = useState('');
  const [capturingUrl, setCapturingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [selectedCapture, setSelectedCapture] = useState<Capture | null>(null);
  const [form, setForm] = useState<CreateOfferInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [savingOffer, setSavingOffer] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: 'loading' });

    listCaptures()
      .then((captures) => {
        setState({ status: 'success', captures });
      })
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
      setUrlError('Informe uma URL válida.');
      return;
    }

    try {
      new URL(trimmed);
    } catch {
      setUrlError('URL inválida.');
      return;
    }

    setCapturingUrl(true);
    setUrlError(null);
    try {
      await captureUrl(trimmed);
      setUrlInput('');
      load();
    } catch (err: unknown) {
      setUrlError(err instanceof ApiError ? err.message : 'Não foi possível capturar a URL.');
    } finally {
      setCapturingUrl(false);
    }
  }

  async function handleCreateOffer() {
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

    setSavingOffer(true);
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

      if (selectedCapture) {
        await deleteCapture(selectedCapture.id);
      }

      setShowOfferModal(false);
      setSelectedCapture(null);
      setForm(emptyForm);
      load();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar a oferta.');
    } finally {
      setSavingOffer(false);
    }
  }

  async function handleDeleteCapture(id: string) {
    setDeletingId(id);
    try {
      await deleteCapture(id);
      load();
    } catch (err: unknown) {
      console.error('Não foi possível deletar a captura:', err);
    } finally {
      setDeletingId(null);
    }
  }

  function handleOpenOfferModal(capture: Capture) {
    setSelectedCapture(capture);
    setForm({
      name: capture.normalizedTitle || '',
      description: '',
      price: capture.foundPrice ? parseFloat(capture.foundPrice) : 0,
      validFrom: '',
      validUntil: '',
    });
    setFormError(null);
    setShowOfferModal(true);
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  const captures = state.status === 'success' ? state.captures : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Captura de Ofertas"
        description="Importar ofertas de URLs externas."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Pescador' }]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Nova Captura</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              URL da Oferta *
            </label>
            <div className="flex gap-2">
              <Input
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  setUrlError(null);
                }}
                placeholder="https://exemplo.com/oferta"
                disabled={capturingUrl}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !capturingUrl) {
                    void handleCaptureUrl();
                  }
                }}
              />
              <Button
                onClick={() => void handleCaptureUrl()}
                disabled={capturingUrl}
                size="sm"
              >
                {capturingUrl ? 'Capturando…' : 'Capturar'}
              </Button>
            </div>
            {urlError && (
              <p className="text-sm text-red-600 mt-1">{urlError}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ofertas Capturadas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {state.status === 'loading' && <LoadingState label="Carregando capturas…" />}

          {captures && (
            captures.length === 0 ? (
              <EmptyState
                title="Nenhuma captura"
                description="Comece a capturar ofertas de URLs externas."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableHead>Fonte</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Preço</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {captures.map((capture) => (
                    <TableRow key={capture.id}>
                      <TableCell className="text-xs font-mono max-w-xs truncate text-slate-600">
                        {capture.sourceUrl}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{capture.sourceName}</TableCell>
                      <TableCell className="text-sm text-slate-900">
                        {capture.normalizedTitle || '—'}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {capture.foundPrice || '—'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={
                            capture.status === 'PENDING'
                              ? 'attention'
                              : capture.status === 'PROCESSED'
                                ? 'positive'
                                : 'attention'
                          }
                        >
                          {capture.status === 'PENDING'
                            ? 'Pendente'
                            : capture.status === 'PROCESSED'
                              ? 'Processado'
                              : 'Erro'}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm"
                          onClick={() => handleOpenOfferModal(capture)}
                          disabled={savingOffer || deletingId === capture.id}
                        >
                          Criar Oferta
                        </Button>
                        <button
                          onClick={() => void handleDeleteCapture(capture.id)}
                          disabled={deletingId === capture.id || savingOffer}
                          className="inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                          aria-label="Deletar captura"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
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
        open={showOfferModal}
        onClose={() => {
          setShowOfferModal(false);
          setSelectedCapture(null);
          setForm(emptyForm);
          setFormError(null);
        }}
        title="Criar Oferta"
      >
        <div className="space-y-5">
          <div className="p-3 bg-slate-50 rounded-md text-sm text-slate-600 border border-slate-200">
            <p className="font-medium">URL da captura:</p>
            <p className="text-xs font-mono break-all mt-1">{selectedCapture?.sourceUrl}</p>
          </div>

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
              setShowOfferModal(false);
              setSelectedCapture(null);
              setForm(emptyForm);
              setFormError(null);
            }}
            disabled={savingOffer}
          >
            Cancelar
          </Button>
          <Button size="sm" onClick={() => void handleCreateOffer()} disabled={savingOffer}>
            {savingOffer ? 'Salvando…' : 'Criar'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
