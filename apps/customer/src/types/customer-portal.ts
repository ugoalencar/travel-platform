// Types for the end-customer-facing portal (/customer-portal/*). Kept
// separate from the staff admin types re-exported elsewhere in this app,
// mirroring how the backend keeps customer-portal.ts separate from the
// staff data-access modules.
export interface CustomerProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpfMasked: string | null;
  passportMasked: string | null;
}

export interface CustomerProposalView {
  id: string;
  agencyId: string;
  customerId: string;
  offerId: string | null;
  wishId: string | null;
  proposedPrice: number;
  discount: number;
  total: number;
  validUntil: string | null;
  conditions: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}
