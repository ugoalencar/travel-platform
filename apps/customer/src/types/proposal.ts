// Mirrors packages/domain/types.ts Proposal, as it comes back over the wire
// (JSON has no Date type, so date fields arrive as ISO strings).
//
// `total` is ALWAYS server-computed (total = proposedPrice - discount) and is
// never accepted as client input -- it is intentionally absent from
// CreateProposalInput/UpdateProposalInput below, making it structurally
// impossible to send it as authority.
//
// `status` is read-only in this vertical: it is always present on a fetched
// Proposal exactly as stored (no derivation, unlike Offer), and is likewise
// absent from both input types -- there is no way to set or change it here.
export type ProposalStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface Proposal {
  id: string;
  agencyId: string;
  customerId: string;
  offerId?: string;
  wishId?: string;
  userId?: string;
  proposedPrice: number;
  discount: number;
  total: number;
  validUntil?: string;
  conditions?: string;
  notes?: string;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProposalInput {
  customerId: string;
  offerId?: string;
  wishId?: string;
  proposedPrice: number;
  discount?: number;
  validUntil?: string;
  conditions?: string;
  notes?: string;
}

export interface UpdateProposalInput {
  proposedPrice?: number;
  discount?: number;
  validUntil?: string;
  conditions?: string;
  notes?: string;
}
