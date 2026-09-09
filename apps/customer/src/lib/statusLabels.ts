// Frontend-only Portuguese labels for backend enum values. Purely
// presentational: the underlying enums (packages/domain/types.ts) are the
// source of truth and are never changed here or inferred from here.
//
// Kept as one small typed lookup per entity (not one giant stringly-typed
// map) so a typo or a missing case is a compile error, not a silent "—".
import type { ProposalStatus } from '../types/proposal';
import type { SaleStatus } from '../types/sale';
import type { OfferStatus } from '../types/offer';
import type { FinancialObligationStatus } from '../types/financial';

export type TripStatus =
  | 'PLANNED'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT: 'Rascunho',
  SENT: 'Enviada',
  ACCEPTED: 'Aceita',
  DECLINED: 'Recusada',
  EXPIRED: 'Expirada',
  CANCELLED: 'Cancelada',
};

export function getProposalStatusLabel(status: ProposalStatus): string {
  return PROPOSAL_STATUS_LABELS[status] ?? status;
}

const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmada',
  PAID: 'Paga',
  CANCELLED: 'Cancelada',
  REFUNDED: 'Reembolsada',
};

export function getSaleStatusLabel(status: SaleStatus): string {
  return SALE_STATUS_LABELS[status] ?? status;
}

const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  PLANNED: 'Planejada',
  CONFIRMED: 'Confirmada',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

export function getTripStatusLabel(status: TripStatus): string {
  return TRIP_STATUS_LABELS[status] ?? status;
}

const RECEIVABLE_STATUS_LABELS: Record<FinancialObligationStatus, string> = {
  OPEN: 'Aberto',
  PARTIALLY_PAID: 'Parcial',
  PAID: 'Paga',
  CANCELLED: 'Cancelada',
};

export function getReceivableStatusLabel(status: FinancialObligationStatus): string {
  return RECEIVABLE_STATUS_LABELS[status] ?? status;
}

const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  ACTIVE: 'Ativa',
  INACTIVE: 'Inativa',
  EXPIRED: 'Expirada',
};

/** Label for an Offer's server-computed effective status (see types/offer.ts). */
export function getOfferStatusLabel(status: OfferStatus): string {
  return OFFER_STATUS_LABELS[status] ?? status;
}

/**
 * Booking has no status enum -- it is a `cancelled: boolean` (see
 * types/booking.ts). Provided here for symmetry so callers don't have to
 * special-case Booking's presentation.
 */
export function getBookingStatusLabel(cancelled: boolean): string {
  return cancelled ? 'Cancelada' : 'Ativa';
}

// Aliases used by customer-portal pages (untyped for simplicity).
export function tripStatusLabel(status: string): string {
  return TRIP_STATUS_LABELS[status as TripStatus] ?? status;
}

export function proposalStatusLabel(status: string): string {
  return PROPOSAL_STATUS_LABELS[status as ProposalStatus] ?? status;
}

export function offerStatusLabel(status: string): string {
  return OFFER_STATUS_LABELS[status as OfferStatus] ?? status;
}

export function bookingStatusLabel(booking: { cancelled: boolean; isFuture?: boolean }): string {
  if (booking.cancelled) return 'Cancelada';
  if (booking.isFuture === false) return 'Realizada';
  return 'Ativa';
}

export function tripTypeLabel(tripType: string): string {
  return tripType === 'ROUND_TRIP' ? 'Ida e volta' : 'Somente ida';
}
