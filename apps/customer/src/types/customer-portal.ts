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
  address: Record<string, unknown> | null;
}

// Safe read-side projection of the agency's contact info (never staff
// account info, never billing/plan data).
export interface CustomerAgencyContact {
  name: string;
  email: string | null;
  phone: string | null;
}

// Server-side enriched booking read-model for the customer portal.
// `isFuture` is computed server-side (NOT cancelled AND departure in the
// future) -- the frontend must never recompute "future" from `cancelled`
// alone. No raw foreign-key ids (departure/product/route ids) are
// included; `id` is the booking's own id, used only for routing.
export interface CustomerBookingView {
  id: string;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  cancelled: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  departureAt: string;
  arrivalExpectedAt: string | null;
  productName: string;
  origin: string;
  destination: string;
  passengerCount: number;
  isFuture: boolean;
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
  includes?: string[];
}

export interface CustomerPassenger {
  id: string;
  name: string;
  documentType: string;
  documentLastDigits: string;
}
