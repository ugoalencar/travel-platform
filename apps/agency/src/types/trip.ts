export type TripStatus =
  | 'PLANNED'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type TripCategory = 'AEREO' | 'TERRESTRE' | 'EXCURSAO' | 'OUTRO';

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
  category: TripCategory;
}
