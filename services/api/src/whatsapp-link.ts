/**
 * WhatsApp Link Generator — Deep links e message builder
 * para compartilhamento de ofertas, propostas e viagens.
 *
 * Fase 1: Apenas geração de links (wa.me).
 * Fase 2: WhatsApp Business API.
 */

// ============================================================
// Phone Normalization
// ============================================================

/**
 * Normaliza telefone para formato internacional sem caracteres especiais.
 * Entrada: "(11) 99999-9999" ou "11999999999" ou "+5511999999999"
 * Saída: "5511999999999"
 */
export function normalizePhone(phone: string): string {
  // Remove tudo que não é dígito
  let digits = phone.replace(/\D/g, '');

  // Se começa com 0, remove (DDI brasileiro)
  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }

  // Se não começa com código do país (55 para Brasil), adiciona
  if (!digits.startsWith('55') && digits.length >= 10) {
    digits = '55' + digits;
  }

  return digits;
}

/**
 * Valida se o telefone é válido para WhatsApp.
 * Mínimo: 12 dígitos (55 + 2 DD + 9 dígitos)
 */
export function isValidPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  // Brasil: 55 + 2 dígitos DD + 9 dígitos = 13 dígitos
  // ou 55 + 2 dígitos DD + 8 dígitos = 12 dígitos (fixo)
  return normalized.length >= 12 && normalized.length <= 15 && /^\d+$/.test(normalized);
}

// ============================================================
// Deep Link Generation
// ============================================================

/**
 * Gera link de WhatsApp com mensagem pré-preenchida.
 * Formato: https://wa.me/5511999999999?text=encoded_message
 */
export function generateWhatsAppLink(phone: string, message: string): string {
  const normalized = normalizePhone(phone);
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${normalized}?text=${encodedMessage}`;
}

/**
 * Gera link para iniciar conversa sem mensagem pré-preenchida.
 */
export function generateWhatsAppChatLink(phone: string): string {
  const normalized = normalizePhone(phone);
  return `https://wa.me/${normalized}`;
}

// ============================================================
// Message Builders
// ============================================================

interface OfferShareData {
  name: string;
  destination?: string;
  nights?: number;
  category?: string;
  price: number;
  link: string;
}

interface ProposalShareData {
  offerName?: string;
  destination?: string;
  summary: string;
  validUntil?: Date;
  link: string;
}

interface TripShareData {
  destination: string;
  details: string;
  link: string;
}

/**
 * Gera mensagem de compartilhamento de oferta.
 * Exemplo:
 * "Olá, Maria! 🌴
 *  Temos uma oferta de Cancún que pode te interessar:
 *  7 noites · All inclusive
 *  A partir de R$ 4.500
 *  https://wa.me/..."
 */
export function buildOfferShareMessage(
  customerName: string,
  offer: OfferShareData,
): string {
  const lines: string[] = [];

  lines.push(`Olá, ${customerName}! 🌴`);
  lines.push('');

  if (offer.destination) {
    lines.push(`Temos uma oferta de ${offer.destination} que pode te interessar:`);
  } else {
    lines.push(`Temos uma oferta que pode te interessar:`);
  }

  lines.push('');

  const details: string[] = [];
  if (offer.nights) details.push(`${offer.nights} noites`);
  if (offer.category) details.push(offer.category);
  if (details.length > 0) {
    lines.push(details.join(' · '));
  }

  lines.push(`A partir de R$ ${formatPrice(offer.price)}`);
  lines.push('');
  lines.push(offer.link);

  return lines.join('\n');
}

/**
 * Gera mensagem de compartilhamento de proposta.
 */
export function buildProposalShareMessage(
  customerName: string,
  proposal: ProposalShareData,
): string {
  const lines: string[] = [];

  lines.push(`Olá, ${customerName}! ✈️`);
  lines.push('');

  if (proposal.destination) {
    lines.push(`Sua proposta para ${proposal.destination} está pronta:`);
  } else {
    lines.push(`Sua proposta está pronta:`);
  }

  lines.push('');
  lines.push(proposal.summary);

  if (proposal.validUntil) {
    lines.push('');
    lines.push(`Validade: ${proposal.validUntil.toLocaleDateString('pt-BR')}`);
  }

  lines.push('');
  lines.push(proposal.link);

  return lines.join('\n');
}

/**
 * Gera mensagem de compartilhamento de viagem.
 */
export function buildTripShareMessage(
  customerName: string,
  trip: TripShareData,
): string {
  const lines: string[] = [];

  lines.push(`Olá, ${customerName}! 🗺️`);
  lines.push('');
  lines.push(`Suas informações de viagem para ${trip.destination}:`);
  lines.push('');
  lines.push(trip.details);
  lines.push('');
  lines.push(trip.link);

  return lines.join('\n');
}

// ============================================================
// Helpers
// ============================================================

function formatPrice(price: number): string {
  return price.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
