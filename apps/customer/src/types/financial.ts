export type FinancialObligationStatus =
  | 'OPEN'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'CANCELLED';

export interface Receivable {
  id: string;
  agencyId: string;
  saleId: string | null;
  customerId: string;
  description: string;
  amount: number;
  dueAt: string;
  status: FinancialObligationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CashFlowSummary {
  projected: {
    receivablesDue: number;
    payablesDue: number;
    balance: number;
  };
  realized: {
    paymentsIn: number;
    paymentsOut: number;
    balance: number;
  };
}

export interface FinancialPeriod {
  from: string;
  to: string;
}
