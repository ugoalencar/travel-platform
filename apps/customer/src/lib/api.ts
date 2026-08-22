import type {
  Customer,
  CreateCustomerInput,
  UpdateCustomerInput,
} from '../types/customer';
import type { Wish, CreateWishInput, UpdateWishInput } from '../types/wish';
import type { Trip, CreateTripInput, UpdateTripInput } from '../types/trip';
import type { Offer, CreateOfferInput, UpdateOfferInput } from '../types/offer';
import type { Proposal, CreateProposalInput, UpdateProposalInput } from '../types/proposal';
import type {
  Route,
  CreateRouteInput,
  UpdateRouteInput,
  Supplier,
  CreateSupplierInput,
  UpdateSupplierInput,
  TransportProduct,
  CreateTransportProductInput,
  UpdateTransportProductInput,
  ScheduledDeparture,
  CreateScheduledDepartureInput,
  UpdateScheduledDepartureInput,
  AgendaEntry,
  RoutePoint,
  CreateRoutePointInput,
  UpdateRoutePointInput,
} from '../types/transport';

// Single seam for a future production API base URL. In local dev this stays
// empty so requests go to relative paths (e.g. `/api/customers`) and are
// handled by the Vite dev-server proxy configured in vite.config.ts, which
// forwards to the real Fastify API and injects the dev-auth headers. The
// frontend never sets agencyId/tenant/role itself — it only calls the API
// and renders what comes back.
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

export async function listCustomers(): Promise<Customer[]> {
  const data = await request<{ customers: Customer[] }>('/api/customers');
  return data.customers;
}

export async function getCustomer(id: string): Promise<Customer> {
  const data = await request<{ customer: Customer }>(
    `/api/customers/${encodeURIComponent(id)}`,
  );
  return data.customer;
}

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const data = await request<{ customer: Customer }>('/api/customers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.customer;
}

export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
): Promise<Customer> {
  const data = await request<{ customer: Customer }>(
    `/api/customers/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
  return data.customer;
}

export async function listWishes(): Promise<Wish[]> {
  const data = await request<{ wishes: Wish[] }>('/api/wishes');
  return data.wishes;
}

export async function getWish(id: string): Promise<Wish> {
  const data = await request<{ wish: Wish }>(
    `/api/wishes/${encodeURIComponent(id)}`,
  );
  return data.wish;
}

export async function createWish(input: CreateWishInput): Promise<Wish> {
  const data = await request<{ wish: Wish }>('/api/wishes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.wish;
}

export async function updateWish(
  id: string,
  input: UpdateWishInput,
): Promise<Wish> {
  const data = await request<{ wish: Wish }>(
    `/api/wishes/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
  return data.wish;
}

export async function listTrips(): Promise<Trip[]> {
  const data = await request<{ trips: Trip[] }>('/api/trips');
  return data.trips;
}

export async function getTrip(id: string): Promise<Trip> {
  const data = await request<{ trip: Trip }>(
    `/api/trips/${encodeURIComponent(id)}`,
  );
  return data.trip;
}

export async function createTrip(input: CreateTripInput): Promise<Trip> {
  const data = await request<{ trip: Trip }>('/api/trips', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.trip;
}

export async function updateTrip(
  id: string,
  input: UpdateTripInput,
): Promise<Trip> {
  const data = await request<{ trip: Trip }>(
    `/api/trips/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
  return data.trip;
}

export async function listOffers(): Promise<Offer[]> {
  const data = await request<{ offers: Offer[] }>('/api/offers');
  return data.offers;
}

export async function getOffer(id: string): Promise<Offer> {
  const data = await request<{ offer: Offer }>(
    `/api/offers/${encodeURIComponent(id)}`,
  );
  return data.offer;
}

export async function createOffer(input: CreateOfferInput): Promise<Offer> {
  const data = await request<{ offer: Offer }>('/api/offers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.offer;
}

export async function updateOffer(
  id: string,
  input: UpdateOfferInput,
): Promise<Offer> {
  const data = await request<{ offer: Offer }>(
    `/api/offers/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
  return data.offer;
}

export async function listProposals(): Promise<Proposal[]> {
  const data = await request<{ proposals: Proposal[] }>('/api/proposals');
  return data.proposals;
}

export async function getProposal(id: string): Promise<Proposal> {
  const data = await request<{ proposal: Proposal }>(
    `/api/proposals/${encodeURIComponent(id)}`,
  );
  return data.proposal;
}

export async function createProposal(input: CreateProposalInput): Promise<Proposal> {
  const data = await request<{ proposal: Proposal }>('/api/proposals', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.proposal;
}

export async function updateProposal(
  id: string,
  input: UpdateProposalInput,
): Promise<Proposal> {
  const data = await request<{ proposal: Proposal }>(
    `/api/proposals/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
  return data.proposal;
}

export async function listRoutes(): Promise<Route[]> {
  const data = await request<{ routes: Route[] }>('/api/transport/routes');
  return data.routes;
}

export async function getRoute(id: string): Promise<Route> {
  const data = await request<{ route: Route }>(
    `/api/transport/routes/${encodeURIComponent(id)}`,
  );
  return data.route;
}

export async function createRoute(input: CreateRouteInput): Promise<Route> {
  const data = await request<{ route: Route }>('/api/transport/routes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.route;
}

export async function updateRoute(id: string, input: UpdateRouteInput): Promise<Route> {
  const data = await request<{ route: Route }>(
    `/api/transport/routes/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
  return data.route;
}

export async function listRoutePoints(routeId: string): Promise<RoutePoint[]> {
  const data = await request<{ points: RoutePoint[] }>(
    `/api/transport/routes/${encodeURIComponent(routeId)}/points`,
  );
  return data.points;
}

export async function createRoutePoint(
  routeId: string,
  input: CreateRoutePointInput,
): Promise<RoutePoint> {
  const data = await request<{ point: RoutePoint }>(
    `/api/transport/routes/${encodeURIComponent(routeId)}/points`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
  return data.point;
}

export async function updateRoutePoint(
  routeId: string,
  pointId: string,
  input: UpdateRoutePointInput,
): Promise<RoutePoint> {
  const data = await request<{ point: RoutePoint }>(
    `/api/transport/routes/${encodeURIComponent(routeId)}/points/${encodeURIComponent(pointId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
  return data.point;
}

export async function reorderRoutePoints(
  routeId: string,
  orderedPointIds: string[],
): Promise<RoutePoint[]> {
  const data = await request<{ points: RoutePoint[] }>(
    `/api/transport/routes/${encodeURIComponent(routeId)}/points/reorder`,
    {
      method: 'POST',
      body: JSON.stringify({ orderedPointIds }),
    },
  );
  return data.points;
}

export async function listSuppliers(): Promise<Supplier[]> {
  const data = await request<{ suppliers: Supplier[] }>('/api/transport/suppliers');
  return data.suppliers;
}

export async function getSupplier(id: string): Promise<Supplier> {
  const data = await request<{ supplier: Supplier }>(
    `/api/transport/suppliers/${encodeURIComponent(id)}`,
  );
  return data.supplier;
}

export async function createSupplier(input: CreateSupplierInput): Promise<Supplier> {
  const data = await request<{ supplier: Supplier }>('/api/transport/suppliers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.supplier;
}

export async function updateSupplier(
  id: string,
  input: UpdateSupplierInput,
): Promise<Supplier> {
  const data = await request<{ supplier: Supplier }>(
    `/api/transport/suppliers/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
  return data.supplier;
}

export async function listTransportProducts(): Promise<TransportProduct[]> {
  const data = await request<{ products: TransportProduct[] }>('/api/transport/products');
  return data.products;
}

export async function getTransportProduct(id: string): Promise<TransportProduct> {
  const data = await request<{ product: TransportProduct }>(
    `/api/transport/products/${encodeURIComponent(id)}`,
  );
  return data.product;
}

export async function createTransportProduct(
  input: CreateTransportProductInput,
): Promise<TransportProduct> {
  const data = await request<{ product: TransportProduct }>('/api/transport/products', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.product;
}

export async function updateTransportProduct(
  id: string,
  input: UpdateTransportProductInput,
): Promise<TransportProduct> {
  const data = await request<{ product: TransportProduct }>(
    `/api/transport/products/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
  return data.product;
}

export async function listDepartures(): Promise<ScheduledDeparture[]> {
  const data = await request<{ departures: ScheduledDeparture[] }>('/api/transport/departures');
  return data.departures;
}

export async function getDeparture(id: string): Promise<ScheduledDeparture> {
  const data = await request<{ departure: ScheduledDeparture }>(
    `/api/transport/departures/${encodeURIComponent(id)}`,
  );
  return data.departure;
}

export async function createDeparture(
  input: CreateScheduledDepartureInput,
): Promise<ScheduledDeparture> {
  const data = await request<{ departure: ScheduledDeparture }>('/api/transport/departures', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.departure;
}

export async function updateDeparture(
  id: string,
  input: UpdateScheduledDepartureInput,
): Promise<ScheduledDeparture> {
  const data = await request<{ departure: ScheduledDeparture }>(
    `/api/transport/departures/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
  return data.departure;
}

export async function getAgenda(): Promise<AgendaEntry[]> {
  const data = await request<{ agenda: AgendaEntry[] }>('/api/transport/agenda');
  return data.agenda;
}
