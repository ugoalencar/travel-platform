export type OfferStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED';

export interface Offer {
  id: string;
  agencyId: string;
  name: string;
  description?: string;
  price: number;
  validFrom?: string;
  validUntil?: string;
  status: OfferStatus;
  createdAt: string;
  updatedAt: string;
}
