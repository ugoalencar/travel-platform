import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { LoadingState } from '../../components/ui/loading-state';
import { ErrorState } from '../../components/ui/error-state';
import {
  ApiError,
  createProposalItem,
  createProposalSection,
  deleteProposalItem,
  deleteProposalSection,
  getProposal,
  linkMediaAssetToProposal,
  listProposalItems,
  listProposalMedia,
  listProposalSections,
  loadMediaAssetBlobUrl,
  unlinkProposalMedia,
  updateProposal,
  updateProposalItem,
  updateProposalSection,
  type EntityMediaItem,
  type MediaAsset,
  type Proposal,
  type ProposalItem,
  type ProposalItemType,
  type ProposalSection,
  type ProposalSectionType,
} from '../../lib/api';
import { ProposalVisualPreview } from './ProposalVisualPreview';
import { MediaAssetPicker } from '../../components/media/MediaAssetPicker';

const SECTION_TYPE_LABELS: Record<ProposalSectionType, string> = {
  OVERVIEW: 'Resumo',
  DESTINATIONS: 'Destinos',
  TRANSPORT: 'Transporte',
  ACCOMMODATION: 'Hospedagem',
  EXPERIENCES: 'Experiências',
  ITINERARY: 'Itinerário',
  INCLUSIONS: 'Inclusões',
  EXCLUSIONS: 'Exclusões',
  COMMERCIAL_TERMS: 'Condições comerciais',
  PAYMENT_OPTIONS: 'Formas de pagamento',
  MEDIA: 'Galeria',
  DOCUMENTS: 'Documentos',
  NOTES: 'Observações',
};

const ITEM_TYPE_LABELS: Record<ProposalItemType, string> = {
  TEXT: 'Texto',
  DESTINATION: 'Destino',
  TRANSPORT: 'Transporte',
  ACCOMMODATION: 'Hospedagem',
  EXPERIENCE: 'Experiência',
  ITINERARY_DAY: 'Dia de itinerário',
  INCLUSION: 'Inclusão',
  EXCLUSION: 'Exclusão',
  CONDITION: 'Condição',
  PAYMENT_OPTION: 'Forma de pagamento',
  IMAGE: 'Imagem',
};

type Tab = 'capa' | 'conteudo' | 'midia' | 'preview';

export function ProposalEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('conteudo');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [sections, setSections] = useState<ProposalSection[]>([]);
  const [itemsBySection, setItemsBySection] = useState<Record<string, ProposalItem[]>>({});
  const [media, setMedia] = useState<EntityMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [p, s] = await Promise.all([getProposal(id), listProposalSections(id)]);
      setProposal(p);
      setSections(s);
      const itemLists = await Promise.all(s.map((section) => listProposalItems(section.id)));
      const map: Record<string, ProposalItem[]> = {};
      s.forEach((section, idx) => {
        map[section.id] = itemLists[idx] ?? [];
      });
      setItemsBySection(map);
      const m = await listProposalMedia(id);
      setMedia(m);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a proposta.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Carregando editor de proposta…" />;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (!proposal || !id) return <ErrorState description="Proposta não encontrada." onRetry={() => void load()} />;

  const editable = proposal.status === 'DRAFT' || proposal.status === 'SENT';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/proposals/${id}`} className="rounded-lg p-2 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Editor visual da proposta</h1>
          <p className="text-sm text-slate-500">
            {proposal.title || `Proposta ${proposal.id.slice(0, 8)}`}
          </p>
        </div>
      </div>

      {!editable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Esta proposta está com status <strong>{proposal.status}</strong> e não pode mais ser editada —
          o conteúdo fica travado assim que a proposta é aceita, recusada, cancelada ou expira.
        </div>
      )}

      <div className="flex gap-2 border-b border-slate-200">
        {(['capa', 'conteudo', 'midia', 'preview'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'capa' ? 'Capa' : t === 'conteudo' ? 'Conteúdo' : t === 'midia' ? 'Mídia' : 'Prévia'}
          </button>
        ))}
      </div>

      {tab === 'capa' && (
        <CoverTab proposal={proposal} editable={editable} onSaved={setProposal} />
      )}

      {tab === 'conteudo' && (
        <ContentTab
          proposalId={id}
          editable={editable}
          sections={sections}
          itemsBySection={itemsBySection}
          onReload={load}
        />
      )}

      {tab === 'midia' && (
        <MediaTab proposalId={id} editable={editable} media={media} onReload={load} />
      )}

      {tab === 'preview' && (
        <ProposalVisualPreview data={{ proposal, sections, itemsBySection, media }} />
      )}
    </div>
  );
}

function CoverTab({
  proposal,
  editable,
  onSaved,
}: {
  proposal: Proposal;
  editable: boolean;
  onSaved: (p: Proposal) => void;
}) {
  const [form, setForm] = useState({
    title: proposal.title ?? '',
    subtitle: proposal.subtitle ?? '',
    destinationSummary: proposal.destinationSummary ?? '',
    travelPeriod: proposal.travelPeriod ?? '',
    travelerSummary: proposal.travelerSummary ?? '',
    introText: proposal.introText ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProposal(proposal.id, form);
      onSaved(updated);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar a capa.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Capa e resumo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">Título</span>
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Ex: Cancún em família"
            disabled={!editable}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">Subtítulo</span>
          <Input
            value={form.subtitle}
            onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
            placeholder="Ex: 7 noites all-inclusive"
            disabled={!editable}
          />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Destino</span>
            <Input
              value={form.destinationSummary}
              onChange={(e) => setForm((f) => ({ ...f, destinationSummary: e.target.value }))}
              disabled={!editable}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Período</span>
            <Input
              value={form.travelPeriod}
              onChange={(e) => setForm((f) => ({ ...f, travelPeriod: e.target.value }))}
              placeholder="Ex: 12 a 19 de dezembro"
              disabled={!editable}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Viajantes</span>
            <Input
              value={form.travelerSummary}
              onChange={(e) => setForm((f) => ({ ...f, travelerSummary: e.target.value }))}
              placeholder="Ex: 2 adultos, 1 criança"
              disabled={!editable}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">Texto de introdução</span>
          <Textarea
            value={form.introText}
            onChange={(e) => setForm((f) => ({ ...f, introText: e.target.value }))}
            rows={4}
            disabled={!editable}
          />
        </label>
        {editable && (
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar capa'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ContentTab({
  proposalId,
  editable,
  sections,
  itemsBySection,
  onReload,
}: {
  proposalId: string;
  editable: boolean;
  sections: ProposalSection[];
  itemsBySection: Record<string, ProposalItem[]>;
  onReload: () => Promise<void>;
}) {
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionType, setNewSectionType] = useState<ProposalSectionType>('OVERVIEW');
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleAddSection() {
    if (!newSectionTitle.trim()) return;
    try {
      await createProposalSection(proposalId, { type: newSectionType, title: newSectionTitle.trim() });
      setNewSectionTitle('');
      setAddingSection(false);
      await onReload();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a seção.');
    }
  }

  const sorted = sections.slice().sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {sorted.map((section, idx) => (
        <SectionCard
          key={section.id}
          section={section}
          items={itemsBySection[section.id] ?? []}
          editable={editable}
          isFirst={idx === 0}
          isLast={idx === sorted.length - 1}
          swapWith={sorted[idx - 1]}
          swapWithNext={sorted[idx + 1]}
          onReload={onReload}
        />
      ))}

      {sorted.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Nenhuma seção ainda. Adicione a primeira seção da proposta abaixo.
        </p>
      )}

      {editable && (
        <Card>
          <CardContent className="pt-6">
            {!addingSection ? (
              <Button variant="outline" onClick={() => setAddingSection(true)}>
                <Plus className="mr-2 h-4 w-4" /> Adicionar seção
              </Button>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-sm font-medium text-slate-700">Tipo</span>
                  <Select value={newSectionType} onChange={(e) => setNewSectionType(e.target.value as ProposalSectionType)}>
                    {Object.entries(SECTION_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                </label>
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-sm font-medium text-slate-700">Título</span>
                  <Input value={newSectionTitle} onChange={(e) => setNewSectionTitle(e.target.value)} placeholder="Ex: Hospedagem" />
                </label>
                <div className="flex gap-2">
                  <Button onClick={() => void handleAddSection()}>Adicionar</Button>
                  <Button variant="outline" onClick={() => { setAddingSection(false); setNewSectionTitle(''); }}>Cancelar</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SectionCard({
  section,
  items,
  editable,
  isFirst,
  isLast,
  swapWith,
  swapWithNext,
  onReload,
}: {
  section: ProposalSection;
  items: ProposalItem[];
  editable: boolean;
  isFirst: boolean;
  isLast: boolean;
  swapWith?: ProposalSection | undefined;
  swapWithNext?: ProposalSection | undefined;
  onReload: () => Promise<void>;
}) {
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  async function handleToggleVisible() {
    await updateProposalSection(section.id, { isVisibleToCustomer: !section.isVisibleToCustomer });
    await onReload();
  }

  async function handleMoveUp() {
    if (!swapWith) return;
    await Promise.all([
      updateProposalSection(section.id, { sortOrder: swapWith.sortOrder }),
      updateProposalSection(swapWith.id, { sortOrder: section.sortOrder }),
    ]);
    await onReload();
  }

  async function handleMoveDown() {
    if (!swapWithNext) return;
    await Promise.all([
      updateProposalSection(section.id, { sortOrder: swapWithNext.sortOrder }),
      updateProposalSection(swapWithNext.id, { sortOrder: section.sortOrder }),
    ]);
    await onReload();
  }

  async function handleDelete() {
    await deleteProposalSection(section.id);
    await onReload();
  }

  const sortedItems = items.slice().sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">{section.title}</CardTitle>
          <p className="text-xs text-slate-500">{SECTION_TYPE_LABELS[section.type]}</p>
        </div>
        {editable && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => void handleMoveUp()} disabled={isFirst}>▲</Button>
            <Button size="sm" variant="outline" onClick={() => void handleMoveDown()} disabled={isLast}>▼</Button>
            <Button size="sm" variant="outline" onClick={() => void handleToggleVisible()}>
              {section.isVisibleToCustomer ? 'Ocultar do cliente' : 'Mostrar ao cliente'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void handleDelete()}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {!section.isVisibleToCustomer && (
          <p className="text-xs font-medium text-amber-700">Oculta do cliente — só a agência vê esta seção.</p>
        )}
        {sortedItems.map((item) => (
          <div key={item.id}>
            {editingItemId === item.id ? (
              <ItemEditor
                sectionId={section.id}
                sectionType={section.type}
                initial={item}
                onDone={async () => {
                  setEditingItemId(null);
                  await onReload();
                }}
                onCancel={() => setEditingItemId(null)}
              />
            ) : (
              <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase text-slate-400">
                    {ITEM_TYPE_LABELS[item.type]}
                    {item.dayNumber ? ` · Dia ${item.dayNumber}` : ''}
                  </p>
                  {item.title && <p className="text-sm font-medium text-slate-900">{item.title}</p>}
                  {item.description && <p className="text-sm text-slate-600">{item.description}</p>}
                </div>
                {editable && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditingItemId(item.id)}>Editar</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void deleteProposalItem(item.id).then(onReload);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {editable && (
          addingItem ? (
            <ItemEditor
              sectionId={section.id}
              sectionType={section.type}
              onDone={async () => {
                setAddingItem(false);
                await onReload();
              }}
              onCancel={() => setAddingItem(false)}
            />
          ) : (
            <Button size="sm" variant="outline" onClick={() => setAddingItem(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar item
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}

function ItemEditor({
  sectionId,
  sectionType,
  initial,
  onDone,
  onCancel,
}: {
  sectionId: string;
  sectionType: ProposalSectionType;
  initial?: ProposalItem | undefined;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [type, setType] = useState<ProposalItemType>(initial?.type ?? (sectionType === 'ITINERARY' ? 'ITINERARY_DAY' : 'TEXT'));
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [dayNumber, setDayNumber] = useState(initial?.dayNumber?.toString() ?? '');
  const [price, setPrice] = useState(initial?.price?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(dayNumber ? { dayNumber: Number(dayNumber) } : {}),
        ...(price ? { price: Number(price) } : {}),
      };
      if (initial) {
        await updateProposalItem(initial.id, payload);
      } else {
        await createProposalItem(sectionId, { type, ...payload });
      }
      await onDone();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar o item.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {!initial && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">Tipo</span>
            <Select value={type} onChange={(e) => setType(e.target.value as ProposalItemType)}>
              {Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </label>
        )}
        {type === 'ITINERARY_DAY' && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">Dia número</span>
            <Input type="number" min={1} value={dayNumber} onChange={(e) => setDayNumber(e.target.value)} />
          </label>
        )}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-600">Título</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Chegada em Cancún" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-600">Descrição</span>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-600">Preço (opcional)</span>
        <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

function MediaTab({
  proposalId,
  editable,
  media,
  onReload,
}: {
  proposalId: string;
  editable: boolean;
  media: EntityMediaItem[];
  onReload: () => Promise<void>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelectFromLibrary(asset: MediaAsset) {
    setError(null);
    try {
      const usage = media.length === 0 ? 'COVER' : 'GALLERY';
      await linkMediaAssetToProposal(proposalId, asset.id, usage);
      await onReload();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível vincular a imagem.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Capa e galeria</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-500">
          As imagens da proposta vêm da Biblioteca de Mídia, administrada pelo Marketing. Selecione uma
          imagem já existente ou envie uma nova -- ela entrará na biblioteca e ficará disponível para
          reuso em outras propostas, ofertas e comunicações.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {editable && (
          <Button type="button" variant="outline" onClick={() => setPickerOpen(true)} className="gap-2">
            <ImagePlus className="h-4 w-4" />
            Selecionar da biblioteca
          </Button>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {media.map((item) => (
            <MediaThumb key={item.linkId} media={item} editable={editable} onReload={onReload} />
          ))}
        </div>
        {media.length === 0 && <p className="text-sm text-slate-500">Nenhuma imagem selecionada ainda.</p>}
      </CardContent>
      <MediaAssetPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handleSelectFromLibrary} />
    </Card>
  );
}

function MediaThumb({
  media,
  editable,
  onReload,
}: {
  media: EntityMediaItem;
  editable: boolean;
  onReload: () => Promise<void>;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMediaAssetBlobUrl(media.mediaAssetId)
      .then((url: string) => {
        if (!cancelled) setBlobUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [media.mediaAssetId]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200">
      {blobUrl ? (
        <img src={blobUrl} alt={media.altText ?? ''} className="h-24 w-full object-cover" />
      ) : (
        <div className="h-24 w-full animate-pulse bg-slate-100" />
      )}
      {media.usage === 'COVER' && (
        <span className="absolute left-1 top-1 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">Capa</span>
      )}
      {editable && (
        <button
          type="button"
          onClick={() => {
            void unlinkProposalMedia(media.linkId).then(onReload);
          }}
          className="absolute right-1 top-1 rounded bg-white/90 p-1 text-red-600 shadow hover:bg-white"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
