// Mirrors packages/domain/types.ts Trip, as it comes back over the wire
// (JSON has no Date type, so date fields arrive as ISO strings).
export type TripStatus =
  | 'PLANNED'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export interface Trip {
  id: string;
  agencyId: string;
  customerId: string;
  saleId?: string;
  name: string;
  destination: string;
  description?: string;
  startDate: string;
  endDate: string;
  status: TripStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTripInput {
  customerId: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  description?: string;
  notes?: string;
}

export interface UpdateTripInput {
  name?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  notes?: string;
}
