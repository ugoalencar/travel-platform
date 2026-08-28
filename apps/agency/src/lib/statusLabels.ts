import type { WishStatus } from '../types/wish';
import type { TripStatus } from '../types/trip';
import type { ProposalStatus } from '../types/proposal';
import type { CustomerStatus } from '../types/customer';

const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  SUSPENDED: 'Suspenso',
};

export function getCustomerStatusLabel(status: CustomerStatus): string {
  return CUSTOMER_STATUS_LABELS[status] ?? status;
}

const WISH_STATUS_LABELS: Record<WishStatus, string> = {
  ACTIVE: 'Ativo',
  MATCHED: 'Combinado',
  PROPOSED: 'Em proposta',
  FULFILLED: 'Atendido',
  EXPIRED: 'Expirado',
  CANCELLED: 'Cancelado',
};

export function getWishStatusLabel(status: WishStatus): string {
  return WISH_STATUS_LABELS[status] ?? status;
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

export function getBookingStatusLabel(cancelled: boolean): string {
  return cancelled ? 'Cancelada' : 'Ativa';
}
