// Client for the customer-portal API surface (/customer-api/*). Kept
// separate from api.ts (the staff /api/* client): different base path,
// different auth scheme (dev-customer header injected by the Vite proxy
// in local dev, see vite.config.ts), and this file never calls, imports
// from, or is called by api.ts.
import type { Trip } from '../types/trip';
import type { Offer } from '../types/offer';
import type { BookingPassenger } from '../types/booking';
import type {
  CustomerAgencyContact,
  CustomerAirSegmentView,
  CustomerBookingView,
  CustomerDocumentView,
  CustomerLandServiceView,
  CustomerPaymentScheduleItem,
  CustomerProfile,
  CustomerProposalView,
} from '../types/customer-portal';
import { ApiError } from './api';
import { clearSession, getSessionToken } from './customerSession';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

interface ApiErrorBody {
  error: string;
  code: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 401) {
    // Expired/revoked/invalid session -- RequireCustomerAuth/CustomerPortalShell
    // pick up the cleared session on next render and redirect to login.
    clearSession();
  }

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

export async function getMyProfile(): Promise<CustomerProfile> {
  const data = await request<{ profile: CustomerProfile }>('/customer-api/me');
  return data.profile;
}

export async function listMyTrips(): Promise<Trip[]> {
  const data = await request<{ trips: Trip[] }>('/customer-api/trips');
  return data.trips;
}

export async function getMyTrip(id: string): Promise<Trip> {
  const data = await request<{ trip: Trip }>(`/customer-api/trips/${encodeURIComponent(id)}`);
  return data.trip;
}

export async function listAvailableOffers(): Promise<Offer[]> {
  const data = await request<{ offers: Offer[] }>('/customer-api/offers');
  return data.offers;
}

export async function getAvailableOffer(id: string): Promise<Offer> {
  const data = await request<{ offer: Offer }>(`/customer-api/offers/${encodeURIComponent(id)}`);
  return data.offer;
}

export async function listMyProposals(): Promise<CustomerProposalView[]> {
  const data = await request<{ proposals: CustomerProposalView[] }>('/customer-api/proposals');
  return data.proposals;
}

export async function getMyProposal(id: string): Promise<CustomerProposalView> {
  const data = await request<{ proposal: CustomerProposalView }>(
    `/customer-api/proposals/${encodeURIComponent(id)}`,
  );
  return data.proposal;
}

export async function listMyBookings(): Promise<CustomerBookingView[]> {
  const data = await request<{ bookings: CustomerBookingView[] }>('/customer-api/bookings');
  return data.bookings;
}

export async function getMyBooking(
  id: string,
): Promise<{ booking: CustomerBookingView; passengers: BookingPassenger[] }> {
  return request<{ booking: CustomerBookingView; passengers: BookingPassenger[] }>(
    `/customer-api/bookings/${encodeURIComponent(id)}`,
  );
}

export async function getMyAgencyContact(): Promise<CustomerAgencyContact> {
  const data = await request<{ agency: CustomerAgencyContact }>('/customer-api/agency-contact');
  return data.agency;
}

export async function listMyTripAirSegments(tripId: string): Promise<CustomerAirSegmentView[]> {
  const data = await request<{ segments: CustomerAirSegmentView[] }>(
    `/customer-api/trips/${encodeURIComponent(tripId)}/air-segments`,
  );
  return data.segments;
}

export async function listMyTripLandServices(tripId: string): Promise<CustomerLandServiceView[]> {
  const data = await request<{ services: CustomerLandServiceView[] }>(
    `/customer-api/trips/${encodeURIComponent(tripId)}/land-services`,
  );
  return data.services;
}

export async function listMyDocuments(): Promise<CustomerDocumentView[]> {
  const data = await request<{ documents: CustomerDocumentView[] }>('/customer-api/documents');
  return data.documents;
}

export async function listMyPaymentSchedule(): Promise<CustomerPaymentScheduleItem[]> {
  const data = await request<{ items: CustomerPaymentScheduleItem[] }>(
    '/customer-api/payment-schedule',
  );
  return data.items;
}

export { ApiError };
