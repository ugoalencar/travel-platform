import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Copy, Archive } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { StatusBadge, type StatusTone } from '../components/ui/status-badge';
import { Modal } from '../components/ui/modal';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import { ApiError, getOffer, updateOffer, createOffer } from '../lib/api';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import type { Offer, OfferStatus } from '../types/offer';
import type { UpdateOfferInput, CreateOfferInput } from '../lib/api';

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

const emptyEditForm: UpdateOfferInput = {
  name: '',
  description: '',
  price: 0,
  validFrom: '',
  validUntil: '',
};

const emptyDuplicateForm: CreateOfferInput = {
  name: '',
  description: '',
  price: 0,
  validFrom: '',
  validUntil: '',
};

export function OfferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState<UpdateOfferInput>(emptyEditForm);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [showDuplicate, setShowDuplicate] = useState(false);
  const [duplicateForm, setDuplicateForm] = useState<CreateOfferInput>(emptyDuplicateForm);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [duplicateSaving, setDuplicateSaving] = useState(false);

  const [showArchive, setShowArchive] = useState(false);
  const [archiveSaving, setArchiveSaving] = useState(false);

  const load = useCallback(() => {
    if (!id) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    setLoading(true);
    setError(null);
    setNotFound(false);
    getOffer(id)
      .then((o) => {
        setOffer(o);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a oferta.');
        }
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit() {
    if (!offer) return;
    setEditForm({
      name: offer.name,
      description: offer.description,
      price: offer.price,
      validFrom: offer.validFrom ? offer.validFrom.split('T')[0] : '',
      validUntil: offer.validUntil ? offer.validUntil.split('T')[0] : '',
      status: offer.status,
    });
    setEditError(null);
    setShowEdit(true);
  }

  function openDuplicate() {
    if (!offer) return;
    setDuplicateForm({
      name: `${offer.name} (Cópia)`,
      description: offer.description,
      price: offer.price,
      validFrom: offer.validFrom ? offer.validFrom.split('T')[0] : '',
      validUntil: offer.validUntil ? offer.validUntil.split('T')[0] : '',
    });
    setDuplicateError(null);
    setShowDuplicate(true);
  }

  async function handleEdit() {
    if (!offer || !editForm.name?.trim()) {
      setEditError('Informe o nome da oferta.');
      return;
    }
    if (editForm.price !== undefined && editForm.price < 0) {
      setEditError('O preço não pode ser negativo.');
      return;
    }
    if (editForm.validFrom && editForm.validUntil && editForm.validFrom > editForm.validUntil) {
      setEditError('A data inicial não pode ser posterior à data final.');
      return;
    }

    setEditSaving(true);
    setEditError(null);
    try {
      const input: UpdateOfferInput = {
        ...(editForm.name?.trim() ? { name: editForm.name.trim() } : {}),
        ...(editForm.description?.trim() ? { description: editForm.description.trim() } : {}),
        ...(editForm.price !== undefined ? { price: editForm.price } : {}),
        ...(editForm.validFrom ? { validFrom: editForm.validFrom } : {}),
        ...(editForm.validUntil ? { validUntil: editForm.validUntil } : {}),
        ...(editForm.status ? { status: editForm.status } : {}),
      };
      const updated = await updateOffer(offer.id, input);
      setOffer(updated);
      setShowEdit(false);
    } catch (err: unknown) {
      setEditError(err instanceof ApiError ? err.message : 'Não foi possível salvar as alterações.');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDuplicate() {
    if (!duplicateForm.name?.trim()) {
      setDuplicateError('Informe o nome da oferta.');
      return;
    }
    if (duplicateForm.price < 0) {
      setDuplicateError('O preço não pode ser negativo.');
      return;
    }
    if (duplicateForm.validFrom && duplicateForm.validUntil && duplicateForm.validFrom > duplicateForm.validUntil) {
      setDuplicateError('A data inicial não pode ser posterior à data final.');
      return;
    }

    setDuplicateSaving(true);
    setDuplicateError(null);
    try {
      const input: CreateOfferInput = {
        name: duplicateForm.name.trim(),
        price: duplicateForm.price,
        ...(duplicateForm.description?.trim() ? { description: duplicateForm.description.trim() } : {}),
        ...(duplicateForm.validFrom ? { validFrom: duplicateForm.validFrom } : {}),
        ...(duplicateForm.validUntil ? { validUntil: duplicateForm.validUntil } : {}),
      };
      await createOffer(input);
      setShowDuplicate(false);
      load();
    } catch (err: unknown) {
      setDuplicateError(err instanceof ApiError ? err.message : 'Não foi possível duplicar a oferta.');
    } finally {
      setDuplicateSaving(false);
    }
  }

  async function handleArchive() {
    if (!offer) return;
    setArchiveSaving(true);
    try {
      await updateOffer(offer.id, { status: 'INACTIVE' });
      setOffer({ ...offer, status: 'INACTIVE' });
      setShowArchive(false);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível arquivar a oferta.');
    } finally {
      setArchiveSaving(false);
    }
  }

  if (loading) {
    return <LoadingState label="Carregando oferta…" />;
  }

  if (error) {
    return <ErrorState description={error} onRetry={load} />;
  }

  if (notFound || !offer) {
    return (
      <div className="space-y-4">
        <Link to="/offers" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Ofertas
        </Link>
        <ErrorState title="Oferta não encontrada" description="O ID informado não corresponde a nenhuma oferta registrada." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link to="/offers" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-3 w-3" /> Ofertas
          </Link>
          <h1 className="text-xl font-bold text-slate-900">{offer.name}</h1>
          <p className="text-sm text-slate-500">{formatBRL(offer.price)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openDuplicate}>
            <Copy className="h-4 w-4" />
            Duplicar
          </Button>
          <Button variant="outline" size="sm" onClick={openEdit}>
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
          {offer.status !== 'INACTIVE' && (
            <Button variant="outline" size="sm" onClick={() => setShowArchive(true)}>
              <Archive className="h-4 w-4" />
              Arquivar
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Detalhes</CardTitle>
            <StatusBadge tone={OFFER_STATUS_TONES[offer.status]}>
              {OFFER_STATUS_LABELS[offer.status]}
            </StatusBadge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500">Preço</label>
              <p className="text-lg font-semibold text-slate-900">{formatBRL(offer.price)}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Status</label>
              <p className="text-slate-900">{OFFER_STATUS_LABELS[offer.status]}</p>
            </div>
          </div>

          {offer.description && (
            <div>
              <label className="text-xs font-medium text-slate-500">Descrição</label>
              <p className="text-slate-700 mt-1">{offer.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {offer.validFrom && (
              <div>
                <label className="text-xs font-medium text-slate-500">Válida de</label>
                <p className="text-slate-900">{formatDateBR(offer.validFrom, { assumeDateOnly: true })}</p>
              </div>
            )}
            {offer.validUntil && (
              <div>
                <label className="text-xs font-medium text-slate-500">Válida até</label>
                <p className="text-slate-900">{formatDateBR(offer.validUntil, { assumeDateOnly: true })}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200">
            <div>
              <label className="text-xs font-medium text-slate-500">Criado em</label>
              <p className="text-sm text-slate-600">{formatDateBR(offer.createdAt)}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Atualizado em</label>
              <p className="text-sm text-slate-600">{formatDateBR(offer.updatedAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Modal
        open={showEdit}
        onClose={() => {
          setShowEdit(false);
          setEditForm(emptyEditForm);
          setEditError(null);
        }}
        title="Editar Oferta"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nome da Oferta *
            </label>
            <Input
              value={editForm.name || ''}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder="Ex: Pacote Portugal"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Descrição
            </label>
            <Textarea
              value={editForm.description || ''}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              placeholder="Descreva brevemente a oferta"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Preço (BRL) *
            </label>
            <Input
              type="number"
              value={editForm.price || 0}
              onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })}
              placeholder="0,00"
              min="0"
              step="0.01"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Válida de
              </label>
              <Input
                type="date"
                value={editForm.validFrom || ''}
                onChange={(e) => setEditForm({ ...editForm, validFrom: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Válida até
              </label>
              <Input
                type="date"
                value={editForm.validUntil || ''}
                onChange={(e) => setEditForm({ ...editForm, validUntil: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Status
            </label>
            <select
              value={editForm.status || 'ACTIVE'}
              onChange={(e) => setEditForm({ ...editForm, status: e.target.value as OfferStatus })}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ACTIVE">Ativa</option>
              <option value="INACTIVE">Inativa</option>
              <option value="EXPIRED">Expirada</option>
            </select>
          </div>

          {editError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {editError}
            </div>
          )}
        </div>
        <div className="flex gap-3 justify-end border-t border-slate-200 p-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowEdit(false);
              setEditForm(emptyEditForm);
              setEditError(null);
            }}
            disabled={editSaving}
          >
            Cancelar
          </Button>
          <Button size="sm" onClick={handleEdit} disabled={editSaving}>
            {editSaving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </Modal>

      {/* Duplicate Modal */}
      <Modal
        open={showDuplicate}
        onClose={() => {
          setShowDuplicate(false);
          setDuplicateForm(emptyDuplicateForm);
          setDuplicateError(null);
        }}
        title="Duplicar Oferta"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nome da Oferta *
            </label>
            <Input
              value={duplicateForm.name || ''}
              onChange={(e) => setDuplicateForm({ ...duplicateForm, name: e.target.value })}
              placeholder="Ex: Pacote Portugal"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Descrição
            </label>
            <Textarea
              value={duplicateForm.description || ''}
              onChange={(e) => setDuplicateForm({ ...duplicateForm, description: e.target.value })}
              placeholder="Descreva brevemente a oferta"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Preço (BRL) *
            </label>
            <Input
              type="number"
              value={duplicateForm.price || 0}
              onChange={(e) => setDuplicateForm({ ...duplicateForm, price: Number(e.target.value) })}
              placeholder="0,00"
              min="0"
              step="0.01"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Válida de
              </label>
              <Input
                type="date"
                value={duplicateForm.validFrom || ''}
                onChange={(e) => setDuplicateForm({ ...duplicateForm, validFrom: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Válida até
              </label>
              <Input
                type="date"
                value={duplicateForm.validUntil || ''}
                onChange={(e) => setDuplicateForm({ ...duplicateForm, validUntil: e.target.value })}
              />
            </div>
          </div>

          {duplicateError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {duplicateError}
            </div>
          )}
        </div>
        <div className="flex gap-3 justify-end border-t border-slate-200 p-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowDuplicate(false);
              setDuplicateForm(emptyDuplicateForm);
              setDuplicateError(null);
            }}
            disabled={duplicateSaving}
          >
            Cancelar
          </Button>
          <Button size="sm" onClick={handleDuplicate} disabled={duplicateSaving}>
            {duplicateSaving ? 'Duplicando…' : 'Duplicar'}
          </Button>
        </div>
      </Modal>

      {/* Archive Confirmation Modal */}
      <Modal
        open={showArchive}
        onClose={() => setShowArchive(false)}
        title="Arquivar Oferta"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            A oferta será marcada como inativa e não aparecerá mais para novos clientes. Você pode reativar depois se necessário.
          </p>
        </div>
        <div className="flex gap-3 justify-end border-t border-slate-200 p-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowArchive(false)}
            disabled={archiveSaving}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleArchive}
            disabled={archiveSaving}
            className="bg-red-600 hover:bg-red-700"
          >
            {archiveSaving ? 'Arquivando…' : 'Arquivar'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
