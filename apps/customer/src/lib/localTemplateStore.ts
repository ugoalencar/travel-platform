// Local-only Template Library persistence.
//
// GAP (documented, not silently worked around): services/api/src has no
// Template/CreativeTemplate backend at all -- no table, no route, no
// client function. CreativeTemplate only ever existed as a
// browser-localStorage concept (see the original OfferGrowthStudioPage).
// Building a "real" Template Library screen therefore means: keep using
// localStorage as the store (same persistence the Studio page already
// relied on), never claim server-side durability, and never invent a
// templates.ts backend module ourselves. See the stream report's
// DEFERRED section for the follow-up ask (a real templates table +
// CRUD routes) needed to make this durable/shared across devices.
import type { Asset } from '../types/offerGrowth';
import type { CreativeBinding, CreativePage, CreativeTemplate } from '../types/offerGrowth';
import type { Offer } from '../types/offer';

const STORE_KEY = 'travel-platform.offer-growth.templates.v1';
export const DEFAULT_TEMPLATE_ID = 'tpl-cancun-carousel';
const DEFAULT_CHANNEL = 'INTERNAL_TEST_INSTAGRAM';

function binding(
  key: string,
  kind: CreativeBinding['kind'],
  value: string,
  source: CreativeBinding['source'],
): CreativeBinding {
  return { key, kind, value, source };
}

function block(id: string, kind: CreativePage['blocks'][number]['kind'], label: string, bindingKey: string) {
  return { id, kind, label, bindingKey };
}

function page(id: string, title: string, blocks: CreativePage['blocks']): CreativePage {
  return { id, title, blocks };
}

export function buildDefaultTemplate(offer?: Offer, assets: Asset[] = [], id = DEFAULT_TEMPLATE_ID): CreativeTemplate {
  const hero = assets.find((asset) => asset.type === 'IMAGE') ?? assets[0];
  const logo = assets.find((asset) => asset.type === 'LOGO');
  const bindings: CreativeBinding[] = [
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
  ];

  return {
    id,
    name: offer ? `Criativo — ${offer.name}` : 'Instagram Carousel Cancun',
    channel: DEFAULT_CHANNEL,
    updatedAt: new Date().toISOString(),
    bindings,
    pages: [
      page('slide-1', 'Destaque + destino', [
        block('s1-title', 'TITLE', 'Destino', 'offer.title'),
        block('s1-image', 'IMAGE', 'Imagem principal', 'asset.hero'),
        block('s1-logo', 'LOGO', 'Marca da agência', 'agency.logo'),
      ]),
      page('slide-2', 'Detalhes', [
        block('s2-text', 'TEXT', 'Detalhes da oferta', 'offer.description'),
        block('s2-grid', 'GRID', 'Imagens secundárias', 'asset.secondary'),
      ]),
      page('slide-3', 'Itens inclusos', [
        block('s3-list', 'LIST', 'Itens inclusos', 'included.list'),
        block('s3-divider', 'DIVIDER', 'Separador', 'visual.divider'),
      ]),
      page('slide-4', 'Preço/pagamento', [
        block('s4-price', 'PRICE', 'Preço', 'offer.price'),
        block('s4-payment', 'PAYMENT', 'Pagamento', 'offer.payment'),
        block('s4-table', 'TABLE', 'Resumo', 'price.table'),
      ]),
      page('slide-5', 'Chamada + cupom', [
        block('s5-cta', 'CTA', 'Chamada para ação', 'cta.keyword'),
        block('s5-badge', 'BADGE', 'Cupom', 'coupon.badge'),
      ]),
    ],
  };
}

export function listTemplates(): CreativeTemplate[] {
  const raw = safeGet();
  if (raw.length > 0) return raw;
  const seeded = [buildDefaultTemplate()];
  safeSet(seeded);
  return seeded;
}

export function getTemplate(id: string): CreativeTemplate | undefined {
  return listTemplates().find((template) => template.id === id);
}

export function saveTemplate(template: CreativeTemplate): void {
  const all = listTemplates();
  const index = all.findIndex((item) => item.id === template.id);
  if (index >= 0) {
    all[index] = template;
  } else {
    all.push(template);
  }
  safeSet(all);
}

export function deleteTemplate(id: string): void {
  safeSet(listTemplates().filter((template) => template.id !== id));
}

export function duplicateTemplate(id: string): CreativeTemplate | undefined {
  const source = listTemplates().find((template) => template.id === id);
  if (!source) return undefined;
  const copy: CreativeTemplate = {
    ...source,
    id: `${source.id}-copy-${Date.now()}`,
    name: `${source.name} (cópia)`,
    updatedAt: new Date().toISOString(),
  };
  saveTemplate(copy);
  return copy;
}

export function createBlankTemplate(name: string): CreativeTemplate {
  const template: CreativeTemplate = {
    id: `tpl-${Date.now()}`,
    name,
    channel: DEFAULT_CHANNEL,
    updatedAt: new Date().toISOString(),
    bindings: [],
    pages: [page('slide-1', 'Slide 1', [])],
  };
  saveTemplate(template);
  return template;
}

function safeGet(): CreativeTemplate[] {
  try {
    const stored = window.localStorage.getItem(STORE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as CreativeTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeSet(templates: CreativeTemplate[]): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(templates));
  } catch {
    // Non-critical local persistence.
  }
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
