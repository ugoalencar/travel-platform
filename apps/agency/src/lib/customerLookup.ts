// Customer search for pickers (GET /api/customers/lookup). Kept beside
// api.ts instead of inside it so the lookup stays a single self-contained
// call; it sends the same Bearer session header and error mapping as the
// shared request helper in api.ts.

import { ApiError } from './api';
import { translateApiErrorMessage } from './errorTranslation';
import { clearSession, getSessionToken } from './session';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export interface CustomerLookupItem {
  id: string;
  name: string;
  cpf_masked: string | null;
  birth_date: string | null;
  status: string;
}

export async function lookupCustomers(term: string, options: { limit?: number } = {}): Promise<CustomerLookupItem[]> {
  const params = new URLSearchParams({ q: term });
  if (options.limit !== undefined) params.set('limit', String(options.limit));

  const headers = new Headers();
  const token = getSessionToken();
  if (token) headers.set('authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}/api/customers/lookup?${params.toString()}`, { headers });

  if (response.status === 401) clearSession();

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
    throw new ApiError(
      translateApiErrorMessage(body?.error ?? 'Request failed.'),
      body?.code ?? 'UNKNOWN_ERROR',
      response.status,
    );
  }

  const data = (await response.json()) as { items: CustomerLookupItem[] };
  return data.items;
}
