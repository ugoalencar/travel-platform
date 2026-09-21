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
  featured: boolean;
  showOnCustomerApp: boolean;
  targetSegmentId?: string;
  displayPriority: number;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}
