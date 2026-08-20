// Mirrors packages/domain/types.ts Wish, as it comes back over the wire
// (JSON has no Date type, so date fields arrive as ISO strings).
export type WishStatus =
  | 'ACTIVE'
  | 'MATCHED'
  | 'PROPOSED'
  | 'FULFILLED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface Wish {
  id: string;
  agencyId: string;
  customerId: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  travelersCount?: number;
  notes?: string;
  status: WishStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWishInput {
  customerId: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  travelersCount?: number;
  notes?: string;
}

export interface UpdateWishInput {
  destination?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  travelersCount?: number;
  notes?: string;
}
