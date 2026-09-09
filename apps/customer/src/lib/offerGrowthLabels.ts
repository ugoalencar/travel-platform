// Business-language label maps for the Offer & Growth vertical.
// Purpose: never show a raw backend enum/technical string (block kind,
// bindingKey, source, status) directly in the UI -- always translate it
// through one of these maps first. Every real enum value from
// packages/domain/types.ts / apps/customer/src/types/offerGrowth.ts must
// have an entry here; missing entries fall back to the raw value so a
// backend addition never crashes the UI, but should be filled in.
import type {
  AssetSourceType,
  AssetType,
  AutomationStatus,
  AutomationTrigger,
  CampaignStatus,
  CouponType,
  CreativeBinding,
  CreativeBindingKind,
  PublicationStatus,
} from '../types/offerGrowth';

export const CREATIVE_BLOCK_KIND_LABELS: Record<CreativeBindingKind, string> = {
  TITLE: 'Título',
  TEXT: 'Texto',
  IMAGE: 'Imagem',
  PRICE: 'Preço',
  PAYMENT: 'Pagamento',
  LIST: 'Lista',
  TABLE: 'Tabela',
  GRID: 'Grade',
  CTA: 'Botão de ação',
  LOGO: 'Logo',
  BADGE: 'Selo',
  DIVIDER: 'Divisor',
};

export const CREATIVE_BINDING_SOURCE_LABELS: Record<CreativeBinding['source'], string> = {
  manual: 'Conteúdo fixo',
  offer: 'Oferta',
  brand: 'Agência',
  asset: 'Arquivo',
};

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  IMAGE: 'Imagem',
  VIDEO: 'Vídeo',
  LOGO: 'Logo',
  ICON: 'Ícone',
  DOCUMENT: 'Documento',
};

export const ASSET_SOURCE_LABELS: Record<AssetSourceType, string> = {
  PESCADOR: 'Pescador',
  UPLOAD: 'Upload',
  AGENCY_LIBRARY: 'Biblioteca da agência',
  SUPPLIER: 'Fornecedor',
  GENERATED: 'Gerado',
  EXTERNAL_CONNECTOR: 'Conector externo',
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: 'Rascunho',
  SCHEDULED: 'Agendada',
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  FINISHED: 'Encerrada',
  CANCELLED: 'Cancelada',
};

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  DRAFT: 'Rascunho',
  SCHEDULED: 'Agendada',
  PUBLISHING: 'Publicando',
  PUBLISHED: 'Publicada',
  FAILED: 'Falhou',
  CANCELLED: 'Cancelada',
  ARCHIVED: 'Arquivada',
};

export const AUTOMATION_STATUS_LABELS: Record<AutomationStatus, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  ARCHIVED: 'Arquivada',
};

export const AUTOMATION_TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  COMMENT_KEYWORD: 'Comentário com palavra-chave',
  DIRECT_MESSAGE_KEYWORD: 'Mensagem direta com palavra-chave',
};

export const COUPON_TYPE_LABELS: Record<CouponType, string> = {
  FIXED_AMOUNT: 'Valor fixo',
  PERCENTAGE: 'Percentual',
  BENEFIT: 'Benefício',
};

// The only connector implemented in this batch -- an internal test/mock
// channel, never a real Meta/Instagram/WhatsApp connector. Always shown
// with an explicit TESTE/DEMO badge wherever a channel is displayed.
export const TEST_CHANNELS = new Set(['INTERNAL_TEST_INSTAGRAM']);

export function isTestChannel(channel: string): boolean {
  return TEST_CHANNELS.has(channel);
}

export function labelFor<T extends string>(map: Record<T, string>, value: T): string {
  return map[value] ?? value;
}
