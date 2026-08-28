export type FinancialObligationStatus =
  | 'OPEN'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'CANCELLED';

export type PaymentDirection = 'IN' | 'OUT';

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

export interface Payable {
  id: string;
  agencyId: string;
  saleId: string | null;
  supplierId: string | null;
  commissionId: string | null;
  transportOperationId: string | null;
  operationalCostId: string | null;
  description: string;
  amount: number;
  dueAt: string;
  status: FinancialObligationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  agencyId: string;
  direction: PaymentDirection;
  amount: number;
  occurredAt: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface PaymentAllocation {
  id: string;
  agencyId: string;
  paymentId: string;
  receivableId: string | null;
  payableId: string | null;
  amount: number;
  createdAt: string;
}

export interface OperationalCost {
  id: string;
  agencyId: string;
  saleId: string | null;
  transportOperationId: string | null;
  supplierId: string | null;
  description: string;
  costType: string;
  expectedAmount: number | null;
  actualAmount: number | null;
  incurredAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaleMargin {
  saleId: string;
  revenue: number;
  supplierCosts: number;
  operationalCosts: number;
  commission: number;
  margin: number;
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
