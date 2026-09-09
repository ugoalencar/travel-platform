export type SaleStatus = 'PENDING' | 'CONFIRMED' | 'PAID' | 'CANCELLED' | 'REFUNDED';

export interface Sale {
  id: string;
  agencyId: string;
  customerId: string;
  customerName: string;
  salespersonName: string | null;
  tripId: string | null;
  tripName: string | null;
  proposalId?: string;
  brokerId?: string;
  userId: string;
  amount: number;
  discount: number;
  total: number;
  status: SaleStatus;
  notes?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSaleInput {
  customerId: string;
  proposalId?: string;
  brokerId?: string;
  amount: number;
  discount?: number;
  notes?: string;
}

export interface UpdateSaleInput {
  amount?: number;
  discount?: number;
  notes?: string;
}
