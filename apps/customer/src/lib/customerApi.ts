// Client for the customer-portal API surface (/customer-api/*). Kept
// separate from api.ts (the staff /api/* client): different base path,
// different auth scheme (dev-customer header injected by the Vite proxy
// in local dev, see vite.config.ts), and this file never calls, imports
// from, or is called by api.ts.
import type { Trip } from '../types/trip';
import type { Offer } from '../types/offer';
import type { Booking, BookingPassenger } from '../types/booking';
import type { CustomerProfile, CustomerProposalView } from '../types/customer-portal';
import { ApiError } from './api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

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

export async function listMyBookings(): Promise<Booking[]> {
  const data = await request<{ bookings: Booking[] }>('/customer-api/bookings');
  return data.bookings;
}

export async function getMyBooking(
  id: string,
): Promise<{ booking: Booking; passengers: BookingPassenger[] }> {
  return request<{ booking: Booking; passengers: BookingPassenger[] }>(
    `/customer-api/bookings/${encodeURIComponent(id)}`,
  );
}

export { ApiError };
