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
