import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import {
  ApiError,
  getCommunication,
  createCommunication,
  updateCommunication,
  type CreateCommunicationInput,
  type UpdateCommunicationInput,
} from '../lib/api';
import type { AgencyCommunication, MediaAsset } from '../lib/api';
import { MediaAssetPicker } from '../components/media/MediaAssetPicker';

const TYPE_OPTIONS: { value: AgencyCommunication['type']; label: string }[] = [
  { value: 'OFFER', label: 'Oferta' },
  { value: 'NOTICE', label: 'Aviso' },
  { value: 'CAMPAIGN', label: 'Campanha' },
  { value: 'INFORMATION', label: 'Informação' },
];

const PLACEMENT_OPTIONS: { value: AgencyCommunication['placement']; label: string }[] = [
  { value: 'CUSTOMER_APP_HOME', label: 'Home do App do Cliente' },
  { value: 'CUSTOMER_APP_OFFERS', label: 'Ofertas do App do Cliente' },
  { value: 'AGENCY_DASHBOARD', label: 'Dashboard da Agência' },
];

const STATUS_OPTIONS: AgencyCommunication['status'][] = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'EXPIRED', 'ARCHIVED'];

type FormData = {
  type: AgencyCommunication['type'];
  title: string;
  body: string;
  imageUrl: string;
  coverMediaAssetId: string;
  ctaLabel: string;
  ctaUrl: string;
  placement: AgencyCommunication['placement'];
  displayPriority: number;
  targetSegmentId: string;
  visibleFrom: string;
  visibleUntil: string;
  status: AgencyCommunication['status'];
};

const emptyForm: FormData = {
  type: 'NOTICE',
  title: '',
  body: '',
  imageUrl: '',
  coverMediaAssetId: '',
  ctaLabel: '',
  ctaUrl: '',
  placement: 'CUSTOMER_APP_HOME',
  displayPriority: 100,
  targetSegmentId: '',
  visibleFrom: '',
  visibleUntil: '',
  status: 'DRAFT',
};

export function CommunicationFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState<FormData>(emptyForm);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);

  useEffect(() => {
    if (!isEdit || !id) return;
    let cancelled = false;
    getCommunication(id)
      .then((comm) => {
        if (cancelled) return;
        setForm({
          type: comm.type,
          title: comm.title,
          body: comm.body ?? '',
          imageUrl: comm.imageUrl ?? '',
          coverMediaAssetId: comm.coverMediaAssetId ?? '',
          ctaLabel: comm.ctaLabel ?? '',
          ctaUrl: comm.ctaUrl ?? '',
          placement: comm.placement,
          displayPriority: comm.displayPriority,
          targetSegmentId: comm.targetSegmentId ?? '',
          visibleFrom: comm.visibleFrom ? comm.visibleFrom.slice(0, 16) : '',
          visibleUntil: comm.visibleUntil ? comm.visibleUntil.slice(0, 16) : '',
          status: comm.status,
        });
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.message : 'Erro ao carregar comunicação.';
        setError(msg);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, isEdit]);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Título é obrigatório.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const trimmedBody = form.body.trim();
      const trimmedImage = form.imageUrl.trim();
      const trimmedCoverAsset = form.coverMediaAssetId.trim();
      const trimmedCtaLabel = form.ctaLabel.trim();
      const trimmedCtaUrl = form.ctaUrl.trim();
      const trimmedSegment = form.targetSegmentId.trim();

      if (isEdit && id) {
        const input: UpdateCommunicationInput = {
          type: form.type,
          title: form.title.trim(),
          placement: form.placement,
          displayPriority: form.displayPriority,
          status: form.status,
          ...(trimmedBody ? { body: trimmedBody } : {}),
          ...(trimmedImage ? { imageUrl: trimmedImage } : {}),
          ...(trimmedCoverAsset ? { coverMediaAssetId: trimmedCoverAsset } : {}),
          ...(trimmedCtaLabel ? { ctaLabel: trimmedCtaLabel } : {}),
          ...(trimmedCtaUrl ? { ctaUrl: trimmedCtaUrl } : {}),
          ...(trimmedSegment ? { targetSegmentId: trimmedSegment } : {}),
          ...(form.visibleFrom ? { visibleFrom: form.visibleFrom } : {}),
          ...(form.visibleUntil ? { visibleUntil: form.visibleUntil } : {}),
        };
        await updateCommunication(id, input);
        void navigate(`/communications/${id}`);
      } else {
        const input: CreateCommunicationInput = {
          type: form.type,
          title: form.title.trim(),
          placement: form.placement,
          displayPriority: form.displayPriority,
          ...(trimmedBody ? { body: trimmedBody } : {}),
          ...(trimmedImage ? { imageUrl: trimmedImage } : {}),
          ...(trimmedCoverAsset ? { coverMediaAssetId: trimmedCoverAsset } : {}),
          ...(trimmedCtaLabel ? { ctaLabel: trimmedCtaLabel } : {}),
          ...(trimmedCtaUrl ? { ctaUrl: trimmedCtaUrl } : {}),
          ...(trimmedSegment ? { targetSegmentId: trimmedSegment } : {}),
          ...(form.visibleFrom ? { visibleFrom: form.visibleFrom } : {}),
          ...(form.visibleUntil ? { visibleUntil: form.visibleUntil } : {}),
        };
        const created = await createCommunication(input);
        void navigate(`/communications/${created.id}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Erro ao salvar comunicação.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/communications" className="rounded-lg p-2 hover:bg-slate-100 transition-colors">
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isEdit ? 'Editar Comunicação' : 'Nova Comunicação'}
          </h1>
          <p className="text-sm text-slate-500">
            {isEdit ? 'Atualize os dados da comunicação.' : 'Crie um banner, aviso ou campanha para seus clientes.'}
          </p>
        </div>
      </div>

      {error && <ErrorState description={error} />}

      {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Configurações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">Tipo *</span>
                <select
                  value={form.type}
                  onChange={(e) => update('type', e.target.value as AgencyCommunication['type'])}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">Destino *</span>
                <select
                  value={form.placement}
                  onChange={(e) => update('placement', e.target.value as AgencyCommunication['placement'])}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
                >
                  {PLACEMENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">Título *</span>
              <Input
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder="Ex: Super Oferta de Verão"
                required
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">Descrição / Mensagem</span>
              <Textarea
                value={form.body}
                onChange={(e) => update('body', e.target.value)}
                placeholder="Texto que aparecerá para o cliente..."
                rows={4}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">Imagem de capa</span>
              <span className="text-xs text-slate-500">
                Selecione uma imagem da Biblioteca de Mídia (administrada pelo Marketing).
              </span>
              <Button type="button" variant="outline" className="w-fit" onClick={() => setCoverPickerOpen(true)}>
                {form.coverMediaAssetId ? 'Trocar imagem selecionada' : 'Selecionar da biblioteca'}
              </Button>
              {form.coverMediaAssetId && (
                <span className="text-xs text-green-700">Imagem selecionada da biblioteca.</span>
              )}
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">URL da Imagem (alternativa manual)</span>
              <Input
                value={form.imageUrl}
                onChange={(e) => update('imageUrl', e.target.value)}
                placeholder="https://..."
              />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">Texto do Botão (CTA)</span>
                <Input
                  value={form.ctaLabel}
                  onChange={(e) => update('ctaLabel', e.target.value)}
                  placeholder="Ex: Ver Oferta"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">URL do Botão (CTA)</span>
                <Input
                  value={form.ctaUrl}
                  onChange={(e) => update('ctaUrl', e.target.value)}
                  placeholder="https://..."
                />
              </label>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Visibilidade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">Prioridade</span>
                <Input
                  type="number"
                  value={form.displayPriority}
                  onChange={(e) => update('displayPriority', Number(e.target.value))}
                  min={0}
                  max={9999}
                />
                <span className="text-xs text-slate-400">Maior = mais visível</span>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">Visível a partir de</span>
                <Input
                  type="datetime-local"
                  value={form.visibleFrom}
                  onChange={(e) => update('visibleFrom', e.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">Visível até</span>
                <Input
                  type="datetime-local"
                  value={form.visibleUntil}
                  onChange={(e) => update('visibleUntil', e.target.value)}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">Segmento-alvo</span>
              <Input
                value={form.targetSegmentId}
                onChange={(e) => update('targetSegmentId', e.target.value)}
                placeholder="ID do segmento (vazio = todos os clientes)"
              />
            </label>

            {isEdit && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">Status</span>
                <select
                  value={form.status}
                  onChange={(e) => update('status', e.target.value as AgencyCommunication['status'])}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Link to="/communications" className="text-sm font-medium text-slate-600 hover:underline">
            Cancelar
          </Link>
          <Button type="submit" disabled={saving}>
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Comunicação'}
          </Button>
        </div>
      </form>

      <MediaAssetPicker
        open={coverPickerOpen}
        onClose={() => setCoverPickerOpen(false)}
        onSelect={(asset: MediaAsset) => {
          update('coverMediaAssetId', asset.id);
        }}
      />
    </div>
  );
}
