export type SaleStatus = 'OPEN' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

export interface Sale {
  id: string;
  agencyId: string;
  bookingId: string;
  customerId: string;
  amount: number;
  currency: string;
  status: SaleStatus;
  commissionPercentage?: number;
  commissionAmount?: number;
  createdAt: string;
  updatedAt: string;
}

export type CreateSaleInput = {
  bookingId: string;
  amount: number;
  currency?: string;
  commissionPercentage?: number;
};

export type UpdateSaleInput = {
  status?: SaleStatus;
  commissionPercentage?: number;
};
