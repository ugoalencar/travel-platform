import type {
  CommercialOpportunity,
  CommercialTask,
  CreateInteractionInput,
  CreateOpportunityInput,
  CreateTaskInput,
  CustomerInteraction,
  CustomerSearchResult,
  DashboardSummary,
  OpportunityFilters,
  TaskFilters,
  TravelSearchResult,
  UpdateOpportunityInput,
  UpdateTaskInput,
} from '../types/commercial';
import { ApiError } from './api';

// Same seam/proxy convention as lib/api.ts: empty base in local dev, Vite
// proxy strips the /api prefix and forwards to the Fastify API.
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

function toQueryString(params: Record<string, string | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query.length > 0 ? `?${query}` : '';
}

export async function listOpportunities(
  filters: OpportunityFilters = {},
): Promise<{ opportunities: CommercialOpportunity[]; total: number }> {
  const query = toQueryString({ ...filters });
  return request(`/api/commercial/opportunities${query}`);
}

export async function getOpportunity(id: string): Promise<CommercialOpportunity> {
  const data = await request<{ opportunity: CommercialOpportunity }>(
    `/api/commercial/opportunities/${encodeURIComponent(id)}`,
  );
  return data.opportunity;
}

export async function createOpportunity(
  input: CreateOpportunityInput,
): Promise<CommercialOpportunity> {
  const data = await request<{ opportunity: CommercialOpportunity }>(
    '/api/commercial/opportunities',
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data.opportunity;
}

export async function updateOpportunity(
  id: string,
  input: UpdateOpportunityInput,
): Promise<CommercialOpportunity> {
  const data = await request<{ opportunity: CommercialOpportunity }>(
    `/api/commercial/opportunities/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
  return data.opportunity;
}

export async function listTasks(
  filters: TaskFilters = {},
): Promise<{ tasks: CommercialTask[]; total: number }> {
  const query = toQueryString({ ...filters });
  return request(`/api/commercial/tasks${query}`);
}

export async function createTask(input: CreateTaskInput): Promise<CommercialTask> {
  const data = await request<{ task: CommercialTask }>('/api/commercial/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.task;
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<CommercialTask> {
  const data = await request<{ task: CommercialTask }>(
    `/api/commercial/tasks/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
  return data.task;
}

export async function listInteractions(
  customerId?: string,
): Promise<{ interactions: CustomerInteraction[]; total: number }> {
  const query = toQueryString({ customerId });
  return request(`/api/commercial/interactions${query}`);
}

export async function createInteraction(
  input: CreateInteractionInput,
): Promise<CustomerInteraction> {
  const data = await request<{ interaction: CustomerInteraction }>(
    '/api/commercial/interactions',
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data.interaction;
}

export async function searchCustomers(query: string): Promise<CustomerSearchResult[]> {
  const data = await request<{ customers: CustomerSearchResult[] }>(
    `/api/commercial/customers/search${toQueryString({ q: query })}`,
  );
  return data.customers;
}

export async function travelSearch(
  range: 'today' | 'week' | '30d',
  destination?: string,
): Promise<TravelSearchResult> {
  return request(`/api/commercial/travel-search${toQueryString({ range, destination })}`);
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return request('/api/commercial/dashboard');
}

export interface ProposalWaiting {
  id: string;
  customerId: string;
  total: string;
  validUntil: string | null;
  createdAt: string;
}

export async function getProposalsWaiting(): Promise<ProposalWaiting[]> {
  const data = await request<{ proposals: ProposalWaiting[] }>('/api/commercial/proposals-waiting');
  return data.proposals;
}

export interface PostSaleCandidate {
  tripId: string;
  customerId: string;
  destination: string;
  endDate: string;
}

export async function getPostSaleCandidates(): Promise<PostSaleCandidate[]> {
  const data = await request<{ candidates: PostSaleCandidate[] }>(
    '/api/commercial/post-sale-candidates',
  );
  return data.candidates;
}
