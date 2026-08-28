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
