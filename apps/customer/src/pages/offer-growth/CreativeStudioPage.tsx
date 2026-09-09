import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { listAssets, listOffers } from '../../lib/offerGrowthApi';
import {
  buildDefaultTemplate,
  getTemplate,
  saveTemplate,
} from '../../lib/localTemplateStore';
import {
  ASSET_SOURCE_LABELS,
  ASSET_TYPE_LABELS,
  CREATIVE_BINDING_SOURCE_LABELS,
  CREATIVE_BLOCK_KIND_LABELS,
  labelFor,
} from '../../lib/offerGrowthLabels';
import type { Offer } from '../../types/offer';
import type { Asset, CreativePage, CreativeTemplate } from '../../types/offerGrowth';
import { Button } from '../../components/ui/button';
import { EntitlementNotice } from '../../components/offer-growth/EntitlementNotice';

type LoadState =
  | { status: 'loading' }
  | { status: 'entitlement-disabled' }
  | { status: 'error'; message: string }
  | { status: 'ready'; offers: Offer[]; assets: Asset[] };

export function CreativeStudioPage() {
  const [searchParams] = useSearchParams();
  const offerIdParam = searchParams.get('offerId') ?? '';
  const templateIdParam = searchParams.get('templateId') ?? '';

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selectedOfferId, setSelectedOfferId] = useState(offerIdParam);
  const [template, setTemplate] = useState<CreativeTemplate | null>(null);
  const [previewUpdatedAt, setPreviewUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    Promise.all([listOffers(), listAssets().catch(() => [])])
      .then(([offers, assets]) => {
        if (cancelled) return;

        const seededOfferId = offerIdParam || selectedOfferId || offers[0]?.id || '';
        setSelectedOfferId(seededOfferId);
        const offer = offers.find((item) => item.id === seededOfferId);

        // The offerId query param (set by OfferDetailsPage's "Criar
        // material" button) always wins: it seeds a brand-new creative
        // from the REAL Offer's data, never the hardcoded Cancun demo
        // Offer, whenever a template isn't explicitly requested.
        let nextTemplate: CreativeTemplate;
        if (templateIdParam) {
          nextTemplate = getTemplate(templateIdParam) ?? buildDefaultTemplate(offer, assets, templateIdParam);
        } else if (offerIdParam && offer) {
          nextTemplate = buildDefaultTemplate(offer, assets, `tpl-offer-${offer.id}`);
        } else {
          nextTemplate = getTemplate('tpl-cancun-carousel') ?? buildDefaultTemplate(offer, assets);
        }

        setTemplate(nextTemplate);
        saveTemplate(nextTemplate);
        setState({ status: 'ready', offers, assets });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 403) {
          setState({ status: 'entitlement-disabled' });
          return;
        }
        setState({ status: 'error', message: 'Não foi possível carregar o Estúdio criativo.' });
      });

    return () => {
      cancelled = true;
    };
    // Bootstrap only on mount / when the URL's seed params change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerIdParam, templateIdParam]);

  const selectedOffer = useMemo(() => {
    if (state.status !== 'ready') return undefined;
    return state.offers.find((offer) => offer.id === selectedOfferId) ?? state.offers[0];
  }, [selectedOfferId, state]);

  function updateTemplate(next: CreativeTemplate) {
    setTemplate(next);
    saveTemplate(next);
  }

  function addSlide() {
    if (!template) return;
    const index = template.pages.length + 1;
    updateTemplate({
      ...template,
      updatedAt: new Date().toISOString(),
      pages: [
        ...template.pages,
        { id: `slide-${Date.now()}`, title: `Slide ${index}`, blocks: [] },
      ],
    });
  }

  function duplicateSlide(index: number) {
    if (!template) return;
    const source = template.pages[index];
    if (!source) return;
    const copy: CreativePage = {
      ...source,
      id: `${source.id}-copy-${Date.now()}`,
      blocks: source.blocks.map((item) => ({ ...item, id: `${item.id}-copy-${Date.now()}` })),
    };
    const pages = [...template.pages];
    pages.splice(index + 1, 0, copy);
    updateTemplate({ ...template, pages, updatedAt: new Date().toISOString() });
  }

  function removeSlide(index: number) {
    if (!template || template.pages.length <= 1) return;
    updateTemplate({
      ...template,
      pages: template.pages.filter((_, itemIndex) => itemIndex !== index),
      updatedAt: new Date().toISOString(),
    });
  }

  function moveSlide(index: number, direction: -1 | 1) {
    if (!template) return;
    const target = index + direction;
    if (target < 0 || target >= template.pages.length) return;
    const pages = [...template.pages];
    const [slide] = pages.splice(index, 1);
    if (!slide) return;
    pages.splice(target, 0, slide);
    updateTemplate({ ...template, pages, updatedAt: new Date().toISOString() });
  }

  function refreshPreview() {
    setPreviewUpdatedAt(new Date().toLocaleTimeString('pt-BR'));
  }

  if (state.status === 'entitlement-disabled') {
    return <EntitlementNotice feature="CREATIVE_STUDIO" />;
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {state.message}
      </div>
    );
  }

  if (state.status === 'loading' || !template) {
    return <p className="text-sm text-slate-500">Carregando estúdio criativo...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ofertas e crescimento</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Estúdio criativo</h1>
        </div>
        <Button variant="outline" onClick={refreshPreview}>
              Atualizar prévia
        </Button>
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Oferta
              <select
                className="h-9 rounded-md border border-slate-300 px-3 text-sm"
                value={selectedOffer?.id ?? ''}
                onChange={(event) => {
                  setSelectedOfferId(event.target.value);
                  const offer = state.offers.find((item) => item.id === event.target.value);
                  updateTemplate(buildDefaultTemplate(offer, state.assets, template.id));
                }}
              >
                {state.offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">
              Canal de teste/demo interno
            </span>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Metric label="Modelo" value={template.name} />
            <Metric label="Slides" value={String(template.pages.length)} />
            <Metric label="Vínculos" value={String(template.bindings.length)} />
          </div>

          <div className="flex flex-col gap-3">
            {template.pages.map((slide, index) => (
              <div key={slide.id} className="rounded-md border border-slate-200 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Slide {index + 1}
                    </p>
                    <h2 className="text-base font-semibold text-slate-900">{slide.title}</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Mover slide ${index + 1} para cima`}
                      onClick={() => moveSlide(index, -1)}
                    >
                      Subir
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Duplicar slide ${index + 1}`}
                      onClick={() => duplicateSlide(index)}
                    >
                      Duplicar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Remover slide ${index + 1}`}
                      onClick={() => removeSlide(index)}
                    >
                      Remover
                    </Button>
                  </div>
                </div>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {slide.blocks.map((item) => {
                    const boundBinding = template.bindings.find((binding) => binding.key === item.bindingKey);
                    return (
                      <li key={item.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        <span className="font-medium">{labelFor(CREATIVE_BLOCK_KIND_LABELS, item.kind)}</span>{' '}
                        {item.label}
                        <span className="block text-xs text-slate-500">
                          Origem:{' '}
                          {boundBinding
                            ? labelFor(CREATIVE_BINDING_SOURCE_LABELS, boundBinding.source)
                            : labelFor(CREATIVE_BINDING_SOURCE_LABELS, 'manual')}
                        </span>
                      </li>
                    );
                  })}
                  {slide.blocks.length === 0 && (
                    <li className="text-sm text-slate-400">Nenhum bloco neste slide ainda.</li>
                  )}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={addSlide}>
              Adicionar slide
            </Button>
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <Panel title="Arquivos vinculados">
            <div className="flex flex-col gap-2">
              {state.assets.length === 0 && (
                <p className="text-sm text-slate-500">Nenhum arquivo disponível.</p>
              )}
              {state.assets.slice(0, 6).map((asset) => (
                <div key={asset.id} className="rounded-md border border-slate-200 p-3 text-sm">
                  <p className="font-medium text-slate-900">{asset.id}</p>
                  <p className="text-slate-500">
                    {labelFor(ASSET_TYPE_LABELS, asset.type)} · {labelFor(ASSET_SOURCE_LABELS, asset.source)}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Prévia">
            <div className="aspect-[4/5] rounded-md border border-slate-300 bg-slate-950 p-4 text-white">
              <p className="text-xs font-semibold text-slate-300">Canal de teste/demo interno</p>
              <h2 className="mt-4 text-2xl font-semibold">{selectedOffer?.name ?? 'Pacote Cancun'}</h2>
              <p className="mt-2 text-sm text-slate-200">{selectedOffer?.description}</p>
              <p className="mt-6 text-xl font-semibold">
                {selectedOffer ? formatCurrency(selectedOffer.price) : 'R$ 5.290,00'}
              </p>
            </div>
            {previewUpdatedAt && (
              <p className="mt-2 text-xs text-slate-500">Prévia atualizada {previewUpdatedAt}</p>
            )}
          </Panel>
        </aside>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="truncate text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
