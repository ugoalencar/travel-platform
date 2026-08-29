import type { Customer, CustomerStatus } from '../types/customer';
import type { Wish, WishStatus } from '../types/wish';
import type { Trip, TripStatus } from '../types/trip';
import type { Proposal, ProposalStatus } from '../types/proposal';
import type { Booking } from '../types/booking';

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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
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

export async function getFinancialSummary(): Promise<FinancialSummary> {
  const data = await request<{ summary: FinancialSummary }>('/api/financial/summary');
  return data.summary;
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

export type { CustomerStatus, WishStatus, TripStatus, ProposalStatus, Proposal };

// ============================================================
// GENERIC API CLIENT
// For use by pages that need flexible API access beyond
// the specific functions above. Provides get, post, etc.
// ============================================================

export const api = {
  get: async <T>(path: string): Promise<{ data: T }> => {
    const response = await fetch(`${API_BASE_URL}${path}`);
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
    const response = await fetch(`${API_BASE_URL}${path}`, {
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
    const response = await fetch(`${API_BASE_URL}${path}`, {
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
