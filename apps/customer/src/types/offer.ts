// Mirrors packages/domain/types.ts Offer, as it comes back over the wire
// (JSON has no Date type, so date fields arrive as ISO strings).
//
// `status` on a fetched Offer is always the server-computed EFFECTIVE status:
// the API derives EXPIRED whenever validUntil is in the past, overriding
// whatever is actually stored, on every read (list/get/create/update
// response). The frontend must never recompute this itself. The only place
// `status` is user-editable is via UpdateOfferInput, which targets the
// underlying stored value through PATCH — a distinct concept from the
// always-present derived value shown on every read.
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

export interface CreateOfferInput {
  name: string;
  price: number;
  description?: string;
  validFrom?: string;
  validUntil?: string;
  featured?: boolean;
  showOnCustomerApp?: boolean;
  targetSegmentId?: string;
  displayPriority?: number;
  imageUrl?: string;
}

export interface UpdateOfferInput {
  name?: string;
  description?: string;
  price?: number;
  validFrom?: string;
  validUntil?: string;
  status?: OfferStatus;
  featured?: boolean;
  showOnCustomerApp?: boolean;
  targetSegmentId?: string;
  displayPriority?: number;
  imageUrl?: string;
}
