import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../lib/api';
import {
  activateAutomation,
  createAutomation,
  createCampaign,
  createCoupon,
  createPublication,
  generatePublicationSnapshot,
  listAssets,
  listAutomations,
  listCampaigns,
  listCoupons,
  listEntitlements,
  listOffers,
  listPublications,
  publishPublication,
  simulateInternalComment,
} from '../lib/offerGrowthApi';
import type { Offer } from '../types/offer';
import type {
  AgencyEntitlement,
  Asset,
  Automation,
  Campaign,
  CancunDemoState,
  Coupon,
  CreativePage,
  CreativeTemplate,
  Publication,
} from '../types/offerGrowth';
import { Button } from '../components/ui/button';

const CHANNEL = 'INTERNAL_TEST_INSTAGRAM';
const TEMPLATE_ID = 'tpl-cancun-carousel';
const STORAGE_KEY = 'travel-platform.offer-growth.cancun-template';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      offers: Offer[];
      assets: Asset[];
      campaigns: Campaign[];
      publications: Publication[];
      automations: Automation[];
      coupons: Coupon[];
      entitlements: AgencyEntitlement[];
    };

function buildDefaultTemplate(offer?: Offer, assets: Asset[] = []): CreativeTemplate {
  const hero = assets.find((asset) => asset.type === 'IMAGE') ?? assets[0];
  const logo = assets.find((asset) => asset.type === 'LOGO');
  const bindings = [
    binding('offer.title', 'TITLE', offer?.name ?? 'Pacote Cancun', 'offer'),
    binding('offer.description', 'TEXT', offer?.description ?? 'Hotel, transfer e passeios inclusos', 'offer'),
    binding('offer.price', 'PRICE', offer ? formatCurrency(offer.price) : 'R$ 5.290,00', 'offer'),
    binding('offer.payment', 'PAYMENT', '10x sem juros', 'manual'),
    binding('asset.hero', 'IMAGE', hero?.storageUrl ?? hero?.localReference ?? 'asset-hero', 'asset'),
    binding('asset.secondary', 'GRID', 'Hotel, praia, passeio', 'asset'),
    binding('agency.logo', 'LOGO', logo?.storageUrl ?? logo?.localReference ?? 'agency-logo', 'brand'),
    binding('cta.keyword', 'CTA', 'Comente CANCUN', 'manual'),
    binding('coupon.badge', 'BADGE', 'CANCUN300', 'manual'),
    binding('included.list', 'LIST', 'Aereo; Hotel; Transfer; Passeio', 'manual'),
    binding('price.table', 'TABLE', 'Entrada | Parcelas | Total', 'manual'),
    binding('visual.divider', 'DIVIDER', '---', 'manual'),
  ] satisfies CreativeTemplate['bindings'];

  return {
    id: TEMPLATE_ID,
    name: 'Instagram Carousel Cancun',
    channel: CHANNEL,
    updatedAt: new Date().toISOString(),
    bindings,
    pages: [
      page('slide-1', 'Hero + destination', [
        block('s1-title', 'TITLE', 'Destino', 'offer.title'),
        block('s1-image', 'IMAGE', 'Hero image', 'asset.hero'),
        block('s1-logo', 'LOGO', 'Agency brand', 'agency.logo'),
      ]),
      page('slide-2', 'Hotel/details', [
        block('s2-text', 'TEXT', 'Detalhes do hotel', 'offer.description'),
        block('s2-grid', 'GRID', 'Secondary images', 'asset.secondary'),
      ]),
      page('slide-3', 'Included items', [
        block('s3-list', 'LIST', 'Itens inclusos', 'included.list'),
        block('s3-divider', 'DIVIDER', 'Separador', 'visual.divider'),
      ]),
      page('slide-4', 'Price/payment', [
        block('s4-price', 'PRICE', 'Preco', 'offer.price'),
        block('s4-payment', 'PAYMENT', 'Pagamento', 'offer.payment'),
        block('s4-table', 'TABLE', 'Resumo', 'price.table'),
      ]),
      page('slide-5', 'CTA/coupon keyword', [
        block('s5-cta', 'CTA', 'Chamada', 'cta.keyword'),
        block('s5-badge', 'BADGE', 'Cupom', 'coupon.badge'),
      ]),
    ],
  };
}

function binding(
  key: CreativeTemplate['bindings'][number]['key'],
  kind: CreativeTemplate['bindings'][number]['kind'],
  value: string,
  source: CreativeTemplate['bindings'][number]['source'],
) {
  return { key, kind, value, source };
}

function page(id: string, title: string, blocks: CreativePage['blocks']): CreativePage {
  return { id, title, blocks };
}

function block(
  id: string,
  kind: CreativePage['blocks'][number]['kind'],
  label: string,
  bindingKey: string,
) {
  return { id, kind, label, bindingKey };
}

export function OfferGrowthStudioPage() {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [template, setTemplate] = useState<CreativeTemplate>(() => readTemplate());
  const [selectedOfferId, setSelectedOfferId] = useState(searchParams.get('offerId') ?? '');
  const [previewUpdatedAt, setPreviewUpdatedAt] = useState<string | null>(null);
  const [demoState, setDemoState] = useState<CancunDemoState>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    Promise.all([
      listOffers(),
      listAssets().catch(() => []),
      listCampaigns().catch(() => []),
      listPublications().catch(() => []),
      listAutomations().catch(() => []),
      listCoupons().catch(() => []),
      listEntitlements().catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 403) return [];
        throw error;
      }),
    ])
      .then(([offers, assets, campaigns, publications, automations, coupons, entitlements]) => {
        if (cancelled) return;
        const offerId = selectedOfferId || offers[0]?.id || '';
        setSelectedOfferId(offerId);
        const offer = offers.find((item) => item.id === offerId) ?? offers[0];
        const nextTemplate = mergeOfferIntoTemplate(template, offer, assets);
        setTemplate(nextTemplate);
        writeTemplate(nextTemplate);
        setState({
          status: 'ready',
          offers,
          assets,
          campaigns,
          publications,
          automations,
          coupons,
          entitlements,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ status: 'error', message: mapLoadError(error) });
      });

    return () => {
      cancelled = true;
    };
    // Initial bootstrap only; slide edits are local to this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedOffer = useMemo(() => {
    if (state.status !== 'ready') return undefined;
    return state.offers.find((offer) => offer.id === selectedOfferId) ?? state.offers[0];
  }, [selectedOfferId, state]);

  const socialAutomationEnabled =
    state.status === 'ready' &&
    state.entitlements.some((item) => item.feature === 'SOCIAL_AUTOMATION' && item.enabled);

  function updateTemplate(next: CreativeTemplate) {
    setTemplate(next);
    writeTemplate(next);
  }

  function addSlide() {
    const index = template.pages.length + 1;
    updateTemplate({
      ...template,
      updatedAt: new Date().toISOString(),
      pages: [
        ...template.pages,
        page(`slide-${Date.now()}`, `Slide ${index}`, [
          block(`slide-${Date.now()}-text`, 'TEXT', 'Texto', 'offer.description'),
        ]),
      ],
    });
  }

  function duplicateSlide(index: number) {
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
    if (template.pages.length <= 1) return;
    updateTemplate({
      ...template,
      pages: template.pages.filter((_, itemIndex) => itemIndex !== index),
      updatedAt: new Date().toISOString(),
    });
  }

  function moveSlide(index: number, direction: -1 | 1) {
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

  async function runCancunDemo() {
    if (!selectedOffer || !socialAutomationEnabled) return;
    setBusy(true);
    setMessage(null);

    try {
      const campaign = await createCampaign({
        name: 'CANCUN SETEMBRO',
        description: 'Campanha demo para validar Offer & Growth E2E.',
        startsAt: '2026-09-01T00:00:00.000Z',
        endsAt: '2026-09-30T23:59:59.000Z',
        publicationStartsAt: '2026-09-01T00:00:00.000Z',
        publicationEndsAt: '2026-09-30T23:59:59.000Z',
        timezone: 'America/Sao_Paulo',
        offerIds: [selectedOffer.id],
      });
      const coupon = await createCoupon({
        code: 'CANCUN300',
        name: 'Desconto Cancun',
        type: 'FIXED_AMOUNT',
        value: 300,
        maxUses: 1,
        campaignId: campaign.id,
        offerId: selectedOffer.id,
      }).catch(async (error: unknown) => {
        if (error instanceof ApiError && error.status === 409) {
          const existing = (await listCoupons()).find((item) => item.code === 'CANCUN300');
          if (existing) return existing;
        }
        throw error;
      });
      const publication = await createPublication({
        campaignId: campaign.id,
        offerId: selectedOffer.id,
        channel: CHANNEL,
        creativeTemplateId: template.id,
      });
      const snapshotted = await generatePublicationSnapshot(publication.id, buildSnapshot(selectedOffer, template));
      const published = await publishPublication(snapshotted.id);
      const automation = await createAutomation({
        name: 'COMMENT CANCUN',
        trigger: 'COMMENT_KEYWORD',
        channel: CHANNEL,
        campaignId: campaign.id,
        publicationId: published.id,
        keyword: 'CANCUN',
        cooldownSeconds: 0,
        actions: [
          { type: 'PUBLIC_REPLY', message: 'Enviamos os detalhes no privado.' },
          { type: 'PRIVATE_MESSAGE', message: 'Use o cupom CANCUN300 para falar com um consultor.' },
          { type: 'SEND_COUPON', couponId: coupon.id, deliveryChannel: CHANNEL },
          { type: 'CREATE_OPPORTUNITY' },
        ],
      });
      const activeAutomation = await activateAutomation(automation.id);
      const event = {
        channel: CHANNEL,
        externalEventId: 'evt-cancun-demo-1',
        externalUserId: 'ig-cancun-demo-user',
        content: 'CANCUN',
        campaignId: campaign.id,
        publicationId: published.id,
        offerId: selectedOffer.id,
      };
      const simulation = await simulateInternalComment(event);
      const duplicateSimulation = await simulateInternalComment(event);

      setDemoState({
        offer: selectedOffer,
        campaign,
        publication: published,
        coupon,
        automation: activeAutomation,
        simulation,
        duplicateSimulation,
      });
      setMessage('Cancun demo ready without duplicating CRM.');
    } catch (error) {
      setMessage(mapLoadError(error));
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'loading') {
    return <p className="text-sm text-slate-500">Carregando Offer & Growth...</p>;
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {state.message}
      </div>
    );
  }

  const mainExecution = demoState.simulation?.executions[0];
  const replayExecution = demoState.duplicateSimulation?.executions[0];
  const opportunityId = mainExecution?.createdOpportunityId;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Offer & Growth
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Creative Studio
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={refreshPreview}>
            Atualizar preview
          </Button>
          <Button
            onClick={() => void runCancunDemo()}
            disabled={!socialAutomationEnabled || busy || !selectedOffer}
          >
            {busy ? 'Preparando...' : 'Preparar demo Cancun'}
          </Button>
        </div>
      </div>

      {!socialAutomationEnabled && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          SOCIAL_AUTOMATION: recurso nao habilitado para esta agencia. A interface fica bloqueada e o backend segue fail-closed.
        </div>
      )}

      {message && (
        <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700">
          {message}
          {replayExecution?.deduped && <span> Duplicate replay deduped.</span>}
          {opportunityId && <span> Opportunity {opportunityId}.</span>}
        </div>
      )}

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
                  updateTemplate(mergeOfferIntoTemplate(template, offer, state.assets));
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
              TEST / INTERNAL CHANNEL
            </span>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Metric label="Template" value={template.name} />
            <Metric label="Pages" value={String(template.pages.length)} />
            <Metric label="Bindings" value={String(template.bindings.length)} />
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
                  {slide.blocks.map((item) => (
                    <li key={item.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <span className="font-medium">{item.kind}</span> {item.label}
                      <span className="block text-xs text-slate-500">{item.bindingKey}</span>
                    </li>
                  ))}
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
          <Panel title="Asset Picker">
            <div className="flex flex-col gap-2">
              {state.assets.length === 0 && (
                <p className="text-sm text-slate-500">Nenhum asset disponivel.</p>
              )}
              {state.assets.map((asset) => (
                <div key={asset.id} className="rounded-md border border-slate-200 p-3 text-sm">
                  <p className="font-medium text-slate-900">{asset.id}</p>
                  <p className="text-slate-500">
                    {asset.type} / {asset.source}
                  </p>
                  {asset.sourceCaptureId && (
                    <p className="text-xs text-slate-500">Provenance: {asset.sourceCaptureId}</p>
                  )}
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Preview">
            <div className="aspect-[4/5] rounded-md border border-slate-300 bg-slate-950 p-4 text-white">
              <p className="text-xs font-semibold text-slate-300">{CHANNEL}</p>
              <h2 className="mt-4 text-2xl font-semibold">{selectedOffer?.name ?? 'Pacote Cancun'}</h2>
              <p className="mt-2 text-sm text-slate-200">{selectedOffer?.description}</p>
              <p className="mt-6 text-xl font-semibold">
                {selectedOffer ? formatCurrency(selectedOffer.price) : 'R$ 5.290,00'}
              </p>
              <p className="mt-3 inline-flex rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-900">
                Comente CANCUN
              </p>
            </div>
            {previewUpdatedAt && (
              <p className="mt-2 text-xs text-slate-500">Preview atualizado {previewUpdatedAt}</p>
            )}
          </Panel>

          <Panel title="Demo links">
            <div className="grid gap-2 text-sm">
              <Link className="text-slate-700 underline" to="/pescador">Pescador</Link>
              <Link className="text-slate-700 underline" to="/commercial/pipeline">CRM Pipeline</Link>
              {opportunityId && (
                <Link className="text-slate-700 underline" to={`/commercial/pipeline?opportunityId=${opportunityId}`}>
                  Commercial Opportunity
                </Link>
              )}
              <Link className="text-slate-700 underline" to="/proposals/new">Proposal context</Link>
              <Link className="text-slate-700 underline" to="/sales/new">Sale context</Link>
            </div>
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

function readTemplate(): CreativeTemplate {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as CreativeTemplate;
  } catch {
    return buildDefaultTemplate();
  }
  return buildDefaultTemplate();
}

function writeTemplate(template: CreativeTemplate) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(template));
  } catch {
    // Non-critical local persistence; publication snapshot remains server-side.
  }
}

function mergeOfferIntoTemplate(
  template: CreativeTemplate,
  offer: Offer | undefined,
  assets: Asset[],
): CreativeTemplate {
  const defaults = buildDefaultTemplate(offer, assets);
  return {
    ...template,
    bindings: defaults.bindings,
    updatedAt: new Date().toISOString(),
  };
}

function buildSnapshot(offer: Offer, template: CreativeTemplate): Record<string, unknown> {
  return {
    channelLabel: 'TEST / INTERNAL CHANNEL',
    templateId: template.id,
    templateName: template.name,
    offer: {
      id: offer.id,
      title: offer.name,
      description: offer.description,
      price: offer.price,
    },
    pages: template.pages,
    bindings: template.bindings,
  };
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function mapLoadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Recurso nao habilitado ou acesso bloqueado pelo backend.';
    if (error.status === 409) return 'Conflito de lifecycle ou duplicidade detectado com seguranca.';
    return error.message;
  }
  return 'Nao foi possivel carregar Offer & Growth.';
}
