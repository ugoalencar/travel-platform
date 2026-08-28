// pt-BR labels for customer-facing statuses (Trip / Proposal / Offer /
// Booking). Deliberately small and flat -- if another productization
// stream introduces a shared status-label utility elsewhere in
// apps/customer/src/lib/, prefer consolidating onto that one instead of
// keeping this file; nothing here depends on internals that would make
// that hard.

const TRIP_STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Planejada',
  CONFIRMED: 'Confirmada',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  SENT: 'Enviada',
  ACCEPTED: 'Aceita',
  REJECTED: 'Recusada',
  EXPIRED: 'Expirada',
};

const OFFER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativa',
  INACTIVE: 'Inativa',
  EXPIRED: 'Expirada',
};

export function tripStatusLabel(status: string): string {
  return TRIP_STATUS_LABELS[status] ?? status;
}

export function proposalStatusLabel(status: string): string {
  return PROPOSAL_STATUS_LABELS[status] ?? status;
}

export function offerStatusLabel(status: string): string {
  return OFFER_STATUS_LABELS[status] ?? status;
}

export function bookingStatusLabel(booking: { cancelled: boolean; isFuture?: boolean }): string {
  if (booking.cancelled) {
    return 'Cancelada';
  }
  if (booking.isFuture === false) {
    return 'Realizada';
  }
  return 'Ativa';
}

export function tripTypeLabel(tripType: string): string {
  return tripType === 'ROUND_TRIP' ? 'Ida e volta' : 'Somente ida';
}
