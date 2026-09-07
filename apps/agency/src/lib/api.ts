import type { Customer, CustomerStatus } from '../types/customer';
import type { CustomerAddress, CustomerDependent, CustomerDocument } from '../types/customer360';
import type { Wish, WishStatus } from '../types/wish';
import type { Trip, TripStatus } from '../types/trip';
import type { Proposal, ProposalStatus } from '../types/proposal';
import type { Booking } from '../types/booking';
import type { Sale, SaleStatus } from '../types/sale';

// Thin API client for the agency staff app, targeting the same backend
// routes (`/commercial/*`, `/offers`) that apps/customer's staff-facing
// pages already consume via `/api/*` behind the Vite dev-auth proxy (see
// vite.config.ts). No AuthProvider/TenantContext exists in this app yet;
// tenant scoping and RBAC are enforced entirely server-side, exactly as in
// apps/customer -- this client only calls the API and renders what comes
// back, it never computes or overrides tenant-authoritative numbers.
//
// Types below mirror apps/customer/src/types/offer.ts and the
// DashboardSummary shape returned by GET /commercial/dashboard
// (services/api/src/commercial-cockpit.ts). Kept as a local subset instead
// of a new shared frontend package: apps/agency and apps/customer are
// independent Vite build targets with no existing shared frontend lib, and
// introducing one is out of scope for this change (see OFFERS_DECISION.md).

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

interface ApiErrorBody {
  error: string;
  code: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const body = (await safeJson(response)) as Partial<ApiErrorBody> | null;
    throw new ApiError(
      body?.error ?? 'Request failed.',
      body?.code ?? 'UNKNOWN_ERROR',
      response.status,
    );
  }

  return (await response.json()) as T;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

// ============================================================
// DASHBOARD (GET /commercial/dashboard)
// Every field here is a server-computed, tenant-scoped aggregate --
// see services/api/src/commercial-cockpit.ts:getDashboardSummary.
// The frontend never recomputes or derives these numbers itself.
// ============================================================

export interface DashboardSummary {
  openOpportunitiesCount: number;
  followUpsDueTodayCount: number;
  overdueFollowUpsCount: number;
  proposalsWaitingCount: number;
  sentProposalsCount: number;
  acceptedProposalsCount: number;
  openProposalValueSum: string;
  salesThisMonthCount: number;
  salesThisMonthTotal: string;
  pendingSalesCount: number;
  confirmedSalesCount: number;
  paidSalesCount: number;
  overdueReceivablesCount: number;
  cancelledBookingsCount: number;
  pescadorReviewQueueCount: number;
  upcomingTripsCount: number;
  postSalePendingCount: number;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return request<DashboardSummary>('/api/commercial/dashboard');
}

export interface TravelSearchResult {
  operational: Array<{
    bookingId: string;
    customerId: string;
    departureAt: string;
    originDestination: string;
  }>;
  commercial: Array<{
    tripId: string;
    customerId: string;
    destination: string;
    startDate: string;
    endDate: string;
  }>;
}

// Reuses GET /commercial/travel-search (already tenant-scoped) instead of
// inventing a new "upcoming departures" endpoint -- range=week gives the
// dashboard's "próximas partidas" count for free.
export async function getUpcomingTravel(range: 'today' | 'week' | '30d'): Promise<TravelSearchResult> {
  return request<TravelSearchResult>(`/api/commercial/travel-search?range=${range}`);
}

export interface ProposalWaiting {
  id: string;
  agencyId: string;
  customerId: string;
  status: string;
  total: string;
  validUntil?: string;
  notes?: string;
}

export async function listProposalsWaiting(): Promise<ProposalWaiting[]> {
  const data = await request<{ proposals: ProposalWaiting[] }>('/api/commercial/proposals-waiting');
  return data.proposals;
}

export type InteractionChannel = 'EMAIL' | 'PHONE' | 'WHATSAPP' | 'IN_PERSON' | 'OTHER';
export type InteractionDirection = 'INBOUND' | 'OUTBOUND';

export interface CustomerInteraction {
  id: string;
  agencyId: string;
  customerId: string;
  userId: string;
  channel: InteractionChannel;
  direction: InteractionDirection;
  occurredAt: string;
  summary: string;
  createdAt: string;
}

// Recent customer activity feed for the dashboard, reusing the existing
// GET /commercial/interactions list (already tenant-scoped, ordered by
// occurred_at DESC) instead of adding a bespoke "recent actions" endpoint.
export async function listRecentInteractions(limit = 5): Promise<CustomerInteraction[]> {
  const data = await request<{ interactions: CustomerInteraction[] }>(
    `/api/commercial/interactions?limit=${limit}`,
  );
  return data.interactions;
}

// ============================================================
// OFFERS (GET /offers) -- same domain/contract apps/customer's
// OffersPage already uses. See docs/plans/OFFERS_DECISION.md.
// ============================================================

export type OfferStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED';

export interface Offer {
  id: string;
  agencyId: string;
  name: string;
  description?: string;
  price: number;
  validFrom?: string;
  validUntil?: string;
  status: OfferStatus;
  createdAt: string;
  updatedAt: string;
}

export async function listOffers(): Promise<Offer[]> {
  const data = await request<{ offers: Offer[] }>('/api/offers');
  return data.offers;
}

export async function getOffer(id: string): Promise<Offer> {
  const data = await request<{ offer: Offer }>(`/api/offers/${encodeURIComponent(id)}`);
  return data.offer;
}

export interface CreateOfferInput {
  name: string;
  description?: string;
  price: number;
  validFrom?: string;
  validUntil?: string;
}

export interface UpdateOfferInput {
  name?: string;
  description?: string;
  price?: number;
  validFrom?: string;
  validUntil?: string;
  status?: OfferStatus;
}

export async function createOffer(input: CreateOfferInput): Promise<Offer> {
  const data = await request<{ offer: Offer }>('/api/offers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.offer;
}

export async function updateOffer(id: string, input: UpdateOfferInput): Promise<Offer> {
  const data = await request<{ offer: Offer }>(`/api/offers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.offer;
}

// ============================================================
// CAMPAIGNS
// ============================================================

export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'FINISHED' | 'CANCELLED';

export interface Campaign {
  id: string;
  agencyId: string;
  name: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  publicationStartsAt?: string;
  publicationEndsAt?: string;
  timezone: string;
  status: CampaignStatus;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCampaignInput {
  name: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  publicationStartsAt?: string;
  publicationEndsAt?: string;
  timezone?: string;
  offerIds?: string[];
}

export async function listCampaigns(): Promise<Campaign[]> {
  const data = await request<{ campaigns: Campaign[] }>('/api/campaigns');
  return data.campaigns;
}

export async function getCampaign(id: string): Promise<Campaign> {
  const data = await request<{ campaign: Campaign }>(`/api/campaigns/${encodeURIComponent(id)}`);
  return data.campaign;
}

export async function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  const data = await request<{ campaign: Campaign }>('/api/campaigns', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.campaign;
}

// ============================================================
// COUPONS
// ============================================================

export type CouponType = 'FIXED' | 'PERCENTAGE' | 'BOGO';

export interface Coupon {
  id: string;
  agencyId: string;
  code: string;
  name: string;
  type: CouponType;
  value?: number;
  benefitDescription?: string;
  startsAt?: string;
  expiresAt?: string;
  maxUses?: number;
  maxUsesPerCustomer?: number;
  campaignId?: string;
  offerId?: string;
  active: boolean;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCouponInput {
  code: string;
  name: string;
  type: CouponType;
  value?: number;
  benefitDescription?: string;
  startsAt?: string;
  expiresAt?: string;
  maxUses?: number;
  maxUsesPerCustomer?: number;
  campaignId?: string;
  offerId?: string;
}

export async function listCoupons(): Promise<Coupon[]> {
  const data = await request<{ coupons: Coupon[] }>('/api/coupons');
  return data.coupons;
}

export async function getCoupon(id: string): Promise<Coupon> {
  const data = await request<{ coupon: Coupon }>(`/api/coupons/${encodeURIComponent(id)}`);
  return data.coupon;
}

export async function createCoupon(input: CreateCouponInput): Promise<Coupon> {
  const data = await request<{ coupon: Coupon }>('/api/coupons', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.coupon;
}

// ============================================================
// FINANCIAL (GET /financial/summary)
// Server-authoritative financial metrics for the agency.
// No client-side computation of totals, margins, or receivables.
// ============================================================

export type FinancialObligationStatus = 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';

export interface FinancialSummary {
  salesThisMonth: {
    total: number;
    count: number;
  };
  received: number;
  pending: number;
  expectedMargin: number;
  recentPayments: Array<{
    id: string;
    customerId: string;
    customerName: string;
    description: string;
    amount: number;
    occurredAt: string;
    status: 'PAID' | 'PENDING';
  }>;
  upcomingReceivables: Array<{
    id: string;
    customerId: string;
    customerName: string;
    description: string;
    amount: number;
    dueAt: string;
    status: FinancialObligationStatus;
  }>;
}

export interface SaleFinancialStory {
  saleId: string;
  customerName: string;
  tripName: string | null;
  grossSale: number;
  received: number;
  remainingReceivable: number;
  supplierPayables: Array<{
    description: string;
    amount: number;
    dueAt: string;
    status: FinancialObligationStatus;
  }>;
  totalSupplierPayable: number;
  installmentSchedule: Array<{
    description: string;
    amount: number;
    dueDate: string;
    status: string;
  }>;
  margin: {
    grossSale: number;
    supplierCosts: number;
    commissionAndFees: number;
    grossMargin: number;
    netMargin: number;
  };
}

export async function getFinancialSummary(): Promise<FinancialSummary> {
  const data = await request<{ summary: FinancialSummary }>('/api/financial/summary');
  return data.summary;
}

export async function getSaleFinancialStory(saleId: string): Promise<SaleFinancialStory> {
  const data = await request<{ story: SaleFinancialStory }>(
    `/api/financial/sales/${encodeURIComponent(saleId)}/story`,
  );
  return data.story;
}
// CUSTOMERS
// ============================================================

export interface CreateCustomerInput {
  name: string;
  email?: string | undefined;
  phone?: string | undefined;
  cpf?: string | undefined;
  passport?: string | undefined;
  notes?: string | undefined;
}

export interface UpdateCustomerInput {
  name?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  cpf?: string | undefined;
  passport?: string | undefined;
  notes?: string | undefined;
  status?: CustomerStatus | undefined;
}

export async function listCustomers(): Promise<Customer[]> {
  const data = await request<{ customers: Customer[] }>('/api/customers');
  return data.customers;
}

export async function getCustomer(id: string): Promise<Customer> {
  const data = await request<{ customer: Customer }>(`/api/customers/${encodeURIComponent(id)}`);
  return data.customer;
}

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const data = await request<{ customer: Customer }>('/api/customers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.customer;
}

export async function updateCustomer(id: string, input: UpdateCustomerInput): Promise<Customer> {
  const data = await request<{ customer: Customer }>(`/api/customers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.customer;
}

// ============================================================
// CUSTOMER 360: ADDRESSES
// ============================================================

export interface CreateAddressInput {
  type?: string | undefined;
  isPrimary?: boolean | undefined;
  cep?: string | undefined;
  street: string;
  number: string;
  complement?: string | undefined;
  district: string;
  city: string;
  state: string;
  country?: string | undefined;
}

export type UpdateAddressInput = Partial<CreateAddressInput>;

export async function listCustomerAddresses(customerId: string): Promise<CustomerAddress[]> {
  const data = await request<{ addresses: CustomerAddress[] }>(
    `/api/customers/${encodeURIComponent(customerId)}/addresses`,
  );
  return data.addresses;
}

export async function createCustomerAddress(
  customerId: string,
  input: CreateAddressInput,
): Promise<CustomerAddress> {
  const data = await request<{ address: CustomerAddress }>(
    `/api/customers/${encodeURIComponent(customerId)}/addresses`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data.address;
}

export async function updateCustomerAddress(
  customerId: string,
  addressId: string,
  input: UpdateAddressInput,
): Promise<CustomerAddress> {
  const data = await request<{ address: CustomerAddress }>(
    `/api/customers/${encodeURIComponent(customerId)}/addresses/${encodeURIComponent(addressId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
  return data.address;
}

export async function deleteCustomerAddress(customerId: string, addressId: string): Promise<void> {
  await request<{ address: CustomerAddress }>(
    `/api/customers/${encodeURIComponent(customerId)}/addresses/${encodeURIComponent(addressId)}`,
    { method: 'DELETE' },
  );
}

// ============================================================
// CUSTOMER 360: DEPENDENTS / TRAVELERS
// ============================================================

export interface CreateDependentInput {
  name: string;
  relationshipType: string;
  birthDate?: string | undefined;
  cpf?: string | undefined;
  nationality?: string | undefined;
  notes?: string | undefined;
}

export type UpdateDependentInput = Partial<CreateDependentInput>;

export async function listCustomerDependents(customerId: string): Promise<CustomerDependent[]> {
  const data = await request<{ dependents: CustomerDependent[] }>(
    `/api/customers/${encodeURIComponent(customerId)}/dependents`,
  );
  return data.dependents;
}

export async function createCustomerDependent(
  customerId: string,
  input: CreateDependentInput,
): Promise<CustomerDependent> {
  const data = await request<{ dependent: CustomerDependent }>(
    `/api/customers/${encodeURIComponent(customerId)}/dependents`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data.dependent;
}

export async function updateCustomerDependent(
  customerId: string,
  dependentId: string,
  input: UpdateDependentInput,
): Promise<CustomerDependent> {
  const data = await request<{ dependent: CustomerDependent }>(
    `/api/customers/${encodeURIComponent(customerId)}/dependents/${encodeURIComponent(dependentId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
  return data.dependent;
}

export async function deleteCustomerDependent(customerId: string, dependentId: string): Promise<void> {
  await request<{ dependent: CustomerDependent }>(
    `/api/customers/${encodeURIComponent(customerId)}/dependents/${encodeURIComponent(dependentId)}`,
    { method: 'DELETE' },
  );
}

// ============================================================
// CUSTOMER 360: DOCUMENTS
// ============================================================

export interface CreateDocumentInput {
  documentType: string;
  documentNumber: string;
  holderName?: string | undefined;
  holderBirthDate?: string | undefined;
  holderNationality?: string | undefined;
  issuingCountry?: string | undefined;
  issuingAuthority?: string | undefined;
  issuedDate?: string | undefined;
  expiryDate?: string | undefined;
  notes?: string | undefined;
}

export type UpdateDocumentInput = Partial<CreateDocumentInput> & { verificationStatus?: string };

export async function listCustomerDocuments(customerId: string): Promise<CustomerDocument[]> {
  const data = await request<{ documents: CustomerDocument[] }>(
    `/api/customers/${encodeURIComponent(customerId)}/documents`,
  );
  return data.documents;
}

export async function createCustomerDocument(
  customerId: string,
  input: CreateDocumentInput,
): Promise<CustomerDocument> {
  const data = await request<{ document: CustomerDocument }>(
    `/api/customers/${encodeURIComponent(customerId)}/documents`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data.document;
}

export async function updateCustomerDocument(
  customerId: string,
  documentId: string,
  input: UpdateDocumentInput,
): Promise<CustomerDocument> {
  const data = await request<{ document: CustomerDocument }>(
    `/api/customers/${encodeURIComponent(customerId)}/documents/${encodeURIComponent(documentId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
  return data.document;
}

export async function deleteCustomerDocument(customerId: string, documentId: string): Promise<void> {
  await request<{ document: CustomerDocument }>(
    `/api/customers/${encodeURIComponent(customerId)}/documents/${encodeURIComponent(documentId)}`,
    { method: 'DELETE' },
  );
}

// ============================================================
// WISHES
// ============================================================

export interface CreateWishInput {
  customerId: string;
  destination?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  budget?: number | undefined;
  travelersCount?: number | undefined;
  notes?: string | undefined;
}

export interface UpdateWishInput {
  destination?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  budget?: number | undefined;
  travelersCount?: number | undefined;
  notes?: string | undefined;
}

export async function listWishes(): Promise<Wish[]> {
  const data = await request<{ wishes: Wish[] }>('/api/wishes');
  return data.wishes;
}

export async function getWish(id: string): Promise<Wish> {
  const data = await request<{ wish: Wish }>(`/api/wishes/${encodeURIComponent(id)}`);
  return data.wish;
}

export async function listWishesByCustomer(customerId: string): Promise<Wish[]> {
  const data = await request<{ wishes: Wish[] }>(
    `/api/customers/${encodeURIComponent(customerId)}/wishes`,
  );
  return data.wishes;
}

export async function createWish(input: CreateWishInput): Promise<Wish> {
  const data = await request<{ wish: Wish }>('/api/wishes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.wish;
}

export async function updateWish(id: string, input: UpdateWishInput): Promise<Wish> {
  const data = await request<{ wish: Wish }>(`/api/wishes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.wish;
}

// ============================================================
// TRIPS
// ============================================================

export interface CreateTripInput {
  customerId: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  description?: string | undefined;
  notes?: string | undefined;
}

export interface UpdateTripInput {
  name?: string | undefined;
  destination?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  description?: string | undefined;
  notes?: string | undefined;
}

export async function listTrips(): Promise<Trip[]> {
  const data = await request<{ trips: Trip[] }>('/api/trips');
  return data.trips;
}

export async function getTrip(id: string): Promise<Trip> {
  const data = await request<{ trip: Trip }>(`/api/trips/${encodeURIComponent(id)}`);
  return data.trip;
}

export async function listTripsByCustomer(customerId: string): Promise<Trip[]> {
  const data = await request<{ trips: Trip[] }>(
    `/api/customers/${encodeURIComponent(customerId)}/trips`,
  );
  return data.trips;
}

export async function createTrip(input: CreateTripInput): Promise<Trip> {
  const data = await request<{ trip: Trip }>('/api/trips', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.trip;
}

export async function updateTrip(id: string, input: UpdateTripInput): Promise<Trip> {
  const data = await request<{ trip: Trip }>(`/api/trips/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.trip;
}

// ============================================================
// PROPOSALS
// ============================================================

export async function listProposals(): Promise<Proposal[]> {
  const data = await request<{ proposals: Proposal[] }>('/api/proposals');
  return data.proposals;
}

export async function getProposal(id: string): Promise<Proposal> {
  const data = await request<{ proposal: Proposal }>(`/api/proposals/${encodeURIComponent(id)}`);
  return data.proposal;
}

export interface CreateProposalInput {
  customerId: string;
  offerId?: string;
  wishId?: string;
  proposedPrice: number;
  discount?: number;
  validUntil?: string;
  conditions?: string;
  notes?: string;
}

export async function createProposal(input: CreateProposalInput): Promise<Proposal> {
  const data = await request<{ proposal: Proposal }>('/api/proposals', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.proposal;
}

export interface UpdateProposalInput {
  proposedPrice?: number;
  discount?: number;
  validUntil?: string;
  conditions?: string;
  notes?: string;
}

export async function updateProposal(id: string, input: UpdateProposalInput): Promise<Proposal> {
  const data = await request<{ proposal: Proposal }>(`/api/proposals/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.proposal;
}

export async function sendProposal(id: string): Promise<Proposal> {
  const data = await request<{ proposal: Proposal }>(`/api/proposals/${encodeURIComponent(id)}/send`, {
    method: 'POST',
  });
  return data.proposal;
}

// ============================================================
// BOOKINGS
// ============================================================

export async function listBookings(): Promise<Booking[]> {
  const data = await request<{ bookings: Booking[] }>('/api/bookings');
  return data.bookings;
}

export async function getBooking(id: string): Promise<Booking> {
  const data = await request<{ booking: Booking }>(`/api/bookings/${encodeURIComponent(id)}`);
  return data.booking;
}

export interface CreateBookingInput {
  bookerCustomerId: string;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  outboundDepartureId: string;
  returnDepartureId?: string;
  notes?: string;
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const data = await request<{ booking: Booking }>('/api/bookings', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.booking;
}

// ============================================================
// SALES
// ============================================================

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

export async function listSales(): Promise<Sale[]> {
  const data = await request<{ sales: Sale[] }>('/api/sales');
  return data.sales;
}

export async function getSale(id: string): Promise<Sale> {
  const data = await request<{ sale: Sale }>(`/api/sales/${encodeURIComponent(id)}`);
  return data.sale;
}

export async function createSale(input: CreateSaleInput): Promise<Sale> {
  const data = await request<{ sale: Sale }>('/api/sales', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.sale;
}

export async function updateSale(id: string, input: UpdateSaleInput): Promise<Sale> {
  const data = await request<{ sale: Sale }>(`/api/sales/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.sale;
}

// ============================================================
// PESCADOR (URL Capture for Offers)
// ============================================================

export interface Capture {
  id: string;
  agencyId: string;
  sourceUrl: string;
  sourceName: string;
  capturedAt: string;
  rawContent: string;
  normalizedTitle?: string;
  normalizedDescription?: string;
  foundPrice?: number;
  currency?: string;
  validUntil?: string;
  status: 'CAPTURED' | 'NORMALIZED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'PUBLISHED';
  reviewedAt?: string;
  reviewedByUserId?: string;
  publishedOfferId?: string;
  createdAt: string;
  updatedAt: string;
}

export async function listCaptures(): Promise<Capture[]> {
  const data = await request<{ captures: Capture[] }>('/api/pescador/captures');
  return data.captures;
}

export interface ExtractedOfferDraft {
  sourceUrl: string;
  sourceName: string;
  rawContent: string;
  normalizedTitle?: string;
  normalizedDescription?: string;
  foundPrice?: number;
  currency?: string;
  fetchError?: string;
}

export async function extractOfferFromUrl(url: string): Promise<ExtractedOfferDraft> {
  const data = await request<{ draft: ExtractedOfferDraft }>('/api/pescador/extract', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
  return data.draft;
}

export async function captureUrl(url: string): Promise<Capture> {
  // Perform a real server-side fetch + extraction of the URL. When the
  // fetch fails (unreachable host, non-2xx, timeout) we still persist a
  // capture record so the failure is visible and reviewable -- we never
  // fabricate success data the way the previous client-only stub did.
  const draft = await extractOfferFromUrl(url);
  const { fetchError, ...payload } = draft;
  const body = fetchError
    ? {
        ...payload,
        normalizedTitle: payload.normalizedTitle ?? 'Falha ao capturar',
        normalizedDescription: `Não foi possível extrair os dados automaticamente: ${fetchError}. Edite manualmente antes de revisar.`,
      }
    : payload;
  const data = await request<{ capture: Capture }>('/api/pescador/captures', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data.capture;
}

export async function deleteCapture(id: string): Promise<void> {
  await request<void>(`/api/pescador/captures/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function reviewCapture(id: string): Promise<Capture> {
  const data = await request<{ capture: Capture }>(
    `/api/pescador/captures/${encodeURIComponent(id)}/review`,
    { method: 'POST' },
  );
  return data.capture;
}

export async function approveCapture(id: string): Promise<Capture> {
  const data = await request<{ capture: Capture }>(
    `/api/pescador/captures/${encodeURIComponent(id)}/approve`,
    { method: 'POST' },
  );
  return data.capture;
}

export interface PublishCaptureResult {
  capture: Capture;
  offer: Offer;
}

export async function publishCapture(id: string): Promise<PublishCaptureResult> {
  return request<PublishCaptureResult>(`/api/pescador/captures/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
  });
}


export type { CustomerStatus, WishStatus, TripStatus, ProposalStatus, Proposal, Sale, SaleStatus };

// ============================================================
// REVENUES (GET /financial/revenues)
// ============================================================

export type RevenueStatus = 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface Revenue {
  id: string;
  agencyId: string;
  description: string;
  amount: number;
  currency: string;
  competencyDate?: string;
  dueDate: string;
  receiptDate?: string;
  paymentMethod?: string;
  status: RevenueStatus;
  categoryId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RevenueCategory {
  id: string;
  agencyId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRevenueInput {
  description: string;
  category_id?: string;
  amount: number;
  currency?: string;
  competency_date?: string;
  due_date: string;
  receipt_date?: string;
  payment_method?: string;
  status?: RevenueStatus;
}

export async function listRevenues(): Promise<Revenue[]> {
  const data = await request<{ revenues: Revenue[] }>('/api/financial/revenues');
  return data.revenues;
}

export async function getRevenue(id: string): Promise<Revenue> {
  const data = await request<{ revenue: Revenue }>(`/api/financial/revenues/${encodeURIComponent(id)}`);
  return data.revenue;
}

export async function createRevenue(input: CreateRevenueInput): Promise<Revenue> {
  const data = await request<{ revenue: Revenue }>('/api/financial/revenues', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.revenue;
}

export async function deleteRevenue(id: string): Promise<void> {
  await request<void>(`/api/financial/revenues/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function listRevenueCategories(): Promise<RevenueCategory[]> {
  const data = await request<{ categories: RevenueCategory[] }>('/api/financial/categories');
  return data.categories;
}

// ============================================================
// RECEIVABLES (GET /financial/receivables)
// ============================================================

export type ReceivableStatus = 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';

export interface Receivable {
  id: string;
  agencyId: string;
  saleId?: string;
  customerId: string;
  description: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  dueAt: string;
  status: ReceivableStatus;
  createdAt: string;
  updatedAt: string;
}

export async function listReceivables(): Promise<Receivable[]> {
  const data = await request<{ receivables: Receivable[] }>('/api/financial/receivables');
  return data.receivables;
}

export async function getReceivable(id: string): Promise<Receivable> {
  const data = await request<{ receivable: Receivable }>(`/api/financial/receivables/${encodeURIComponent(id)}`);
  return data.receivable;
}

// ============================================================
// PAYABLES (GET /financial/payables)
// ============================================================

export type PayableStatus = 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
export type PaymentDirection = 'IN' | 'OUT';

export interface Payable {
  id: string;
  agencyId: string;
  saleId?: string;
  supplierId?: string;
  commissionId?: string;
  transportOperationId?: string;
  operationalCostId?: string;
  description: string;
  amount: number;
  dueAt: string;
  status: PayableStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePayableInput {
  saleId?: string | undefined;
  supplierId?: string | undefined;
  commissionId?: string | undefined;
  transportOperationId?: string | undefined;
  operationalCostId?: string | undefined;
  description: string;
  amount: number;
  dueAt: string;
}

export async function listPayables(): Promise<Payable[]> {
  const data = await request<{ payables: Payable[] }>('/api/financial/payables');
  return data.payables;
}

export async function createPayable(input: CreatePayableInput): Promise<Payable> {
  const data = await request<{ payable: Payable }>('/api/financial/payables', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.payable;
}

export interface RecordPaymentInput {
  direction: PaymentDirection;
  amount: number;
  occurredAt: string;
  method?: string;
  reference?: string;
  notes?: string;
}

export interface FinancialPayment {
  id: string;
  agencyId: string;
  direction: PaymentDirection;
  amount: number;
  occurredAt: string;
  method?: string;
  reference?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface PaymentAllocation {
  id: string;
  agencyId: string;
  paymentId: string;
  receivableId?: string;
  payableId?: string;
  amount: number;
  createdAt: string;
}

export interface AllocationResult {
  allocations: PaymentAllocation[];
  targets: Array<Receivable | Payable>;
}

export async function recordPayment(input: RecordPaymentInput): Promise<FinancialPayment> {
  const data = await request<{ payment: FinancialPayment }>('/api/financial/payments', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.payment;
}

export async function allocatePayment(
  paymentId: string,
  allocations: Array<{ receivableId?: string; payableId?: string; amount: number }>,
): Promise<AllocationResult> {
  return request<AllocationResult>(`/api/financial/payments/${encodeURIComponent(paymentId)}/allocations`, {
    method: 'POST',
    body: JSON.stringify({ allocations }),
  });
}

// ============================================================
// FINANCIAL CATEGORIES (GET /financial/categories)
// ============================================================

export type CategoryType = 'REVENUE' | 'EXPENSE';

export interface FinancialCategory {
  id: string;
  agencyId: string;
  name: string;
  type: CategoryType;
  description?: string;
  is_active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryInput {
  name: string;
  type: CategoryType;
  description?: string;
  is_active?: boolean;
}

export interface UpdateCategoryInput {
  name?: string;
  type?: CategoryType;
  description?: string;
  is_active?: boolean;
}

export async function listCategories(): Promise<FinancialCategory[]> {
  const data = await request<{ categories: FinancialCategory[] }>('/api/financial/categories');
  return data.categories;
}

export async function getCategory(id: string): Promise<FinancialCategory> {
  const data = await request<{ category: FinancialCategory }>(`/api/financial/categories/${encodeURIComponent(id)}`);
  return data.category;
}

export async function createCategory(input: CreateCategoryInput): Promise<FinancialCategory> {
  const data = await request<{ category: FinancialCategory }>('/api/financial/categories', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.category;
}

export async function updateCategory(id: string, input: UpdateCategoryInput): Promise<FinancialCategory> {
  const data = await request<{ category: FinancialCategory }>(`/api/financial/categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.category;
}

export async function deleteCategory(id: string): Promise<void> {
  await request<void>(`/api/financial/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// ============================================================
// EXPENSES (GET /financial/expenses)
// ============================================================

export type ExpenseStatus = 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';

export interface Expense {
  id: string;
  agencyId: string;
  supplierId?: string;
  supplierName?: string;
  categoryId: string;
  categoryName?: string;
  description: string;
  amount: number;
  currency: string;
  incurredAt: string;
  dueDate: string;
  paymentDate?: string;
  paymentMethod?: string;
  recurrence?: string;
  status: ExpenseStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseInput {
  supplierId?: string | undefined;
  categoryId: string;
  description: string;
  amount: number;
  currency?: string | undefined;
  incurredAt: string;
  dueDate: string;
  paymentMethod?: string | undefined;
  recurrence?: string | undefined;
  notes?: string | undefined;
}

export interface UpdateExpenseInput {
  supplierId?: string;
  categoryId?: string;
  description?: string;
  dueDate?: string;
  paymentMethod?: string;
  recurrence?: string;
  notes?: string;
}

export async function listExpenses(): Promise<Expense[]> {
  const data = await request<{ expenses: Expense[] }>('/api/financial/expenses');
  return data.expenses;
}

export async function getExpense(id: string): Promise<Expense> {
  const data = await request<{ expense: Expense }>(`/api/financial/expenses/${encodeURIComponent(id)}`);
  return data.expense;
}

export async function createExpense(input: CreateExpenseInput): Promise<Expense> {
  const data = await request<{ expense: Expense }>('/api/financial/expenses', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.expense;
}

export async function updateExpense(id: string, input: UpdateExpenseInput): Promise<Expense> {
  const data = await request<{ expense: Expense }>(`/api/financial/expenses/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.expense;
}

export async function cancelExpense(id: string): Promise<Expense> {
  const data = await request<{ expense: Expense }>(`/api/financial/expenses/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  });
  return data.expense;
}

// ============================================================
// SUPPLIERS (GET/POST/PATCH/DELETE /suppliers)
// ============================================================

export type SupplierType = 'TRAVEL' | 'OPERATIONAL' | 'BOTH';

export type SupplierCategory =
  | 'AIRLINE' | 'CONSOLIDATOR' | 'HOTEL' | 'RESORT' | 'TOUR_OPERATOR' | 'TRANSFER'
  | 'CAR_RENTAL' | 'TRAVEL_INSURANCE' | 'TOUR' | 'GUIDE' | 'CRUISE' | 'TRAIN' | 'BUS'
  | 'TICKET_PROVIDER' | 'RECEPTIVE_OPERATOR'
  | 'RENT' | 'ELECTRICITY' | 'WATER' | 'INTERNET' | 'PHONE' | 'SOFTWARE' | 'ACCOUNTING'
  | 'LEGAL' | 'MARKETING' | 'OFFICE' | 'CLEANING' | 'MAINTENANCE' | 'EQUIPMENT'
  | 'BANKING' | 'INSURANCE' | 'OTHER';

export const SUPPLIER_CATEGORY_OPTIONS: SupplierCategory[] = [
  'AIRLINE', 'CONSOLIDATOR', 'HOTEL', 'RESORT', 'TOUR_OPERATOR', 'TRANSFER',
  'CAR_RENTAL', 'TRAVEL_INSURANCE', 'TOUR', 'GUIDE', 'CRUISE', 'TRAIN', 'BUS',
  'TICKET_PROVIDER', 'RECEPTIVE_OPERATOR',
  'RENT', 'ELECTRICITY', 'WATER', 'INTERNET', 'PHONE', 'SOFTWARE', 'ACCOUNTING',
  'LEGAL', 'MARKETING', 'OFFICE', 'CLEANING', 'MAINTENANCE', 'EQUIPMENT',
  'BANKING', 'INSURANCE', 'OTHER',
];

export interface Supplier {
  id: string;
  agencyId: string;
  name: string;
  tradeName?: string;
  document?: string;
  contact?: string;
  supplierType: SupplierType;
  email?: string;
  phone?: string;
  website?: string;
  addressLine?: string;
  addressCity?: string;
  addressState?: string;
  addressZip?: string;
  addressCountry?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccount?: string;
  bankPix?: string;
  paymentTerms?: string;
  notes?: string;
  active: boolean;
  categories: SupplierCategory[];
  createdAt: string;
  updatedAt: string;
}

export interface SupplierInput {
  name: string;
  tradeName?: string;
  document?: string;
  contact?: string;
  supplierType?: SupplierType;
  email?: string;
  phone?: string;
  website?: string;
  addressLine?: string;
  addressCity?: string;
  addressState?: string;
  addressZip?: string;
  addressCountry?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccount?: string;
  bankPix?: string;
  paymentTerms?: string;
  notes?: string;
  active?: boolean;
  categories?: SupplierCategory[];
}

export async function listSuppliers(): Promise<Supplier[]> {
  const data = await request<{ suppliers: Supplier[] }>('/api/suppliers');
  return data.suppliers;
}

export async function getSupplier(id: string): Promise<Supplier> {
  const data = await request<{ supplier: Supplier }>(`/api/suppliers/${encodeURIComponent(id)}`);
  return data.supplier;
}

export async function createSupplier(input: SupplierInput): Promise<Supplier> {
  const data = await request<{ supplier: Supplier }>('/api/suppliers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.supplier;
}

export async function updateSupplier(id: string, input: Partial<SupplierInput>): Promise<Supplier> {
  const data = await request<{ supplier: Supplier }>(`/api/suppliers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.supplier;
}

export async function deactivateSupplier(id: string): Promise<Supplier> {
  const data = await request<{ supplier: Supplier }>(`/api/suppliers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return data.supplier;
}

// ============================================================
// AIR SERVICES (GET/POST/PATCH/DELETE /air-services)
// ============================================================

export type AirCabinClass = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
export type AirServiceStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';
export type AirSegmentDirection = 'OUTBOUND' | 'RETURN' | 'INTERNAL';
export type AirSupplierPaymentStatus = 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';

export interface AirService {
  id: string;
  agencyId: string;
  tripId: string;
  bookingId?: string;
  supplierId?: string;
  customerId: string;
  dependentId?: string;
  airline: string;
  consolidator?: string;
  direction: AirSegmentDirection;
  sequence: number;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime?: string;
  arrivalDate: string;
  arrivalTime?: string;
  flightNumber?: string;
  cabinClass: AirCabinClass;
  bookingLocator?: string;
  ticketNumber?: string;
  baggage?: string;
  seat?: string;
  fare: number;
  taxes: number;
  fees: number;
  commission?: number;
  cost: number;
  saleValue: number;
  currency: string;
  supplierDueDate?: string;
  supplierPaymentStatus: AirSupplierPaymentStatus;
  status: AirServiceStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AirServiceInput {
  tripId: string;
  bookingId?: string;
  supplierId?: string;
  customerId: string;
  dependentId?: string;
  airline: string;
  consolidator?: string;
  direction?: AirSegmentDirection;
  sequence?: number;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime?: string;
  arrivalDate: string;
  arrivalTime?: string;
  flightNumber?: string;
  cabinClass?: AirCabinClass;
  bookingLocator?: string;
  ticketNumber?: string;
  baggage?: string;
  seat?: string;
  fare?: number;
  taxes?: number;
  fees?: number;
  commission?: number | undefined;
  cost?: number;
  saleValue?: number;
  currency?: string;
  supplierDueDate?: string;
  supplierPaymentStatus?: AirSupplierPaymentStatus;
  status?: AirServiceStatus;
  notes?: string;
}

export async function listAirServices(filters?: { tripId?: string; customerId?: string }): Promise<AirService[]> {
  const params = new URLSearchParams();
  if (filters?.tripId) params.set('tripId', filters.tripId);
  if (filters?.customerId) params.set('customerId', filters.customerId);
  const qs = params.toString();
  const data = await request<{ airServices: AirService[] }>(`/api/air-services${qs ? `?${qs}` : ''}`);
  return data.airServices;
}

export async function listAirServicesByTrip(tripId: string): Promise<AirService[]> {
  const data = await request<{ airServices: AirService[] }>(
    `/api/trips/${encodeURIComponent(tripId)}/air-services`,
  );
  return data.airServices;
}

export async function getAirService(id: string): Promise<AirService> {
  const data = await request<{ airService: AirService }>(`/api/air-services/${encodeURIComponent(id)}`);
  return data.airService;
}

export async function createAirService(input: AirServiceInput): Promise<AirService> {
  const data = await request<{ airService: AirService }>('/api/air-services', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.airService;
}

export async function updateAirService(id: string, input: Partial<AirServiceInput>): Promise<AirService> {
  const data = await request<{ airService: AirService }>(`/api/air-services/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.airService;
}

export async function deleteAirService(id: string): Promise<void> {
  await request<{ success: boolean }>(`/api/air-services/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// ============================================================
// RECONCILIATIONS (GET /financial/reconciliations)
// ============================================================

export type ReconciliationStatus = 'RECONCILED' | 'NOT_RECONCILED';

export interface Reconciliation {
  id: string;
  agencyId: string;
  reconciliationDate: string;
  expectedAmount: number;
  actualAmount: number;
  paymentId?: string;
  notes?: string;
  status: ReconciliationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  agencyId: string;
  description: string;
  amount: number;
  paymentDate: string;
  paymentMethod?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReconciliationInput {
  reconciliation_date: string;
  expected_amount: number;
  actual_amount: number;
  payment_id?: string | undefined;
  notes?: string | undefined;
}

export interface UpdateReconciliationInput {
  status?: ReconciliationStatus;
  notes?: string;
}

export async function listReconciliations(): Promise<Reconciliation[]> {
  const data = await request<{ reconciliations: Reconciliation[] }>('/api/financial/reconciliations');
  return data.reconciliations;
}

export async function getReconciliation(id: string): Promise<Reconciliation> {
  const data = await request<{ reconciliation: Reconciliation }>(`/api/financial/reconciliations/${encodeURIComponent(id)}`);
  return data.reconciliation;
}

export async function createReconciliation(input: CreateReconciliationInput): Promise<Reconciliation> {
  const data = await request<{ reconciliation: Reconciliation }>('/api/financial/reconciliations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.reconciliation;
}

export async function updateReconciliation(id: string, input: UpdateReconciliationInput): Promise<Reconciliation> {
  const data = await request<{ reconciliation: Reconciliation }>(`/api/financial/reconciliations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.reconciliation;
}

export async function listPayments(): Promise<Payment[]> {
  const data = await request<{ payments: Payment[] }>('/api/financial/payments');
  return data.payments;
}

// ============================================================
// FINANCIAL REPORTS (GET /financial/reports/*)
// Detailed financial reports for the agency
// ============================================================

export interface DREReport {
  receitas_totais: number;
  despesas_totais: number;
  resultado_liquido: number;
  periodo: string;
}

export interface OverdueReport {
  count: number;
  total_amount: number;
  aging_breakdown: Array<{
    days_overdue_start: number;
    days_overdue_end: number;
    count: number;
    amount: number;
  }>;
}

export interface MarginReport {
  margin_percentage: number;
  margin_amount: number;
  receitas: number;
  custos: number;
}

export interface CashFlowReport {
  current_balance: number;
  projection_30_days: number;
  projection_60_days: number;
  projection_90_days: number;
  projected_balance: number;
}

export async function getDREReport(startDate?: string, endDate?: string): Promise<DREReport> {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  const queryString = params.toString();
  const path = `/api/financial/reports/dre${queryString ? `?${queryString}` : ''}`;
  const data = await request<{ report: DREReport }>(path);
  return data.report;
}

export async function getOverdueReport(startDate?: string, endDate?: string): Promise<OverdueReport> {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  const queryString = params.toString();
  const path = `/api/financial/reports/overdue${queryString ? `?${queryString}` : ''}`;
  const data = await request<{ report: OverdueReport }>(path);
  return data.report;
}

export async function getMarginReport(startDate?: string, endDate?: string): Promise<MarginReport> {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  const queryString = params.toString();
  const path = `/api/financial/reports/margin${queryString ? `?${queryString}` : ''}`;
  const data = await request<{ report: MarginReport }>(path);
  return data.report;
}

export async function getCashFlowReport(startDate?: string, endDate?: string): Promise<CashFlowReport> {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  const queryString = params.toString();
  const path = `/api/financial/reports/cash-flow${queryString ? `?${queryString}` : ''}`;
  const data = await request<{ report: CashFlowReport }>(path);
  return data.report;
}

// ============================================================
// GENERIC API CLIENT
// For use by pages that need flexible API access beyond
// the specific functions above. Provides get, post, etc.
// ============================================================

export const api = {
  get: async <T>(path: string): Promise<{ data: T }> => {
    const response = await fetch(`${API_BASE_URL}/api${path}`);
    if (!response.ok) {
      const body = (await safeJson(response)) as Partial<ApiErrorBody> | null;
      throw new ApiError(
        body?.error ?? 'Request failed.',
        body?.code ?? 'UNKNOWN_ERROR',
        response.status,
      );
    }
    const data = (await response.json()) as T;
    return { data };
  },

  post: async <T>(path: string, body?: Record<string, unknown>): Promise<{ data: T }> => {
    const response = await fetch(`${API_BASE_URL}/api${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const respBody = (await safeJson(response)) as Partial<ApiErrorBody> | null;
      throw new ApiError(
        respBody?.error ?? 'Request failed.',
        respBody?.code ?? 'UNKNOWN_ERROR',
        response.status,
      );
    }
    const data = (await response.json()) as T;
    return { data };
  },

  patch: async <T>(path: string, body?: Record<string, unknown>): Promise<{ data: T }> => {
    const response = await fetch(`${API_BASE_URL}/api${path}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const respBody = (await safeJson(response)) as Partial<ApiErrorBody> | null;
      throw new ApiError(
        respBody?.error ?? 'Request failed.',
        respBody?.code ?? 'UNKNOWN_ERROR',
        response.status,
      );
    }
    const data = (await response.json()) as T;
    return { data };
  },
};
