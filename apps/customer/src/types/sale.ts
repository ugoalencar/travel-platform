// Mirrors packages/domain/types.ts Sale, as it comes back over the wire
// (JSON has no Date type, so date fields arrive as ISO strings).
//
// `total` is ALWAYS server-computed (total = amount - discount) and is
// never accepted as client input -- it is intentionally absent from
// CreateSaleInput/UpdateSaleInput below, making it structurally impossible
// to send it as authority.
//
// `status` is read-only in this vertical: it is always present on a fetched
// Sale exactly as stored (no derivation), and is likewise absent from both
// input types -- there is no way to set or change it here.
//
// `userId` is always assigned server-side from the authenticated session and
// is never client-settable -- absent from both input types.
//
// `paidAt` is unmanaged in this vertical (always null on create, never
// mutated by update) -- absent from both input types.
export type SaleStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PAID'
  | 'CANCELLED'
  | 'REFUNDED';

export interface Sale {
  id: string;
  agencyId: string;
  customerId: string;
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
