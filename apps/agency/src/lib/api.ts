import type { Customer, CustomerStatus } from '../types/customer';
import type { Wish, WishStatus } from '../types/wish';
import type { Trip, TripStatus } from '../types/trip';

// Single seam for a future production API base URL. In local dev this stays
// empty so requests go to relative paths (e.g. `/api/customers`) and are
// handled by the Vite dev-server proxy configured in vite.config.ts, which
// forwards to the real Fastify API and injects the dev-auth headers. The
// frontend never sets agencyId/tenant/role itself -- it only calls the API
// and renders what comes back. Pattern mirrors apps/customer/src/lib/api.ts.
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
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
      'NETWORK_ERROR',
      0,
    );
  }

  if (!response.ok) {
    const body = (await safeJson(response)) as Partial<ApiErrorBody> | null;
    throw new ApiError(
      body?.error ?? 'Não foi possível concluir a solicitação.',
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

export type { CustomerStatus, WishStatus, TripStatus };
