import type { Offer } from '../types/offer';
import type {
  AgencyEntitlement,
  Asset,
  Automation,
  Campaign,
  Coupon,
  CreateAssetInput,
  CreateAutomationInput,
  CreateCampaignInput,
  CreateCouponInput,
  CreatePublicationInput,
  Publication,
  SimulateInternalCommentInput,
  SimulatedEngagementResult,
} from '../types/offerGrowth';
import { ApiError, listOffers as listCoreOffers } from './api';

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

export function listOffers(): Promise<Offer[]> {
  return listCoreOffers();
}

export async function listAssets(): Promise<Asset[]> {
  const data = await request<{ assets: Asset[] }>('/api/assets');
  return data.assets;
}

export async function createAsset(input: CreateAssetInput): Promise<Asset> {
  const data = await request<{ asset: Asset }>('/api/assets', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.asset;
}

export async function listCampaigns(): Promise<Campaign[]> {
  const data = await request<{ campaigns: Campaign[] }>('/api/campaigns');
  return data.campaigns;
}

export async function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  const data = await request<{ campaign: Campaign }>('/api/campaigns', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.campaign;
}

export async function transitionCampaignStatus(id: string, status: Campaign['status']): Promise<Campaign> {
  const data = await request<{ campaign: Campaign }>(
    `/api/campaigns/${encodeURIComponent(id)}/status`,
    { method: 'POST', body: JSON.stringify({ status }) },
  );
  return data.campaign;
}

export async function getCampaignById(id: string): Promise<Campaign> {
  const data = await request<{ campaign: Campaign }>(`/api/campaigns/${encodeURIComponent(id)}`);
  return data.campaign;
}

export async function linkOfferToCampaign(campaignId: string, offerId: string): Promise<void> {
  await request<void>(`/api/campaigns/${encodeURIComponent(campaignId)}/offers`, {
    method: 'POST',
    body: JSON.stringify({ offerId }),
  });
}

export async function listPublications(): Promise<Publication[]> {
  const data = await request<{ publications: Publication[] }>('/api/publications');
  return data.publications;
}

export async function getPublicationById(id: string): Promise<Publication> {
  const data = await request<{ publication: Publication }>(`/api/publications/${encodeURIComponent(id)}`);
  return data.publication;
}

export async function transitionPublicationStatus(
  id: string,
  status: Publication['status'],
): Promise<Publication> {
  const data = await request<{ publication: Publication }>(
    `/api/publications/${encodeURIComponent(id)}/status`,
    { method: 'POST', body: JSON.stringify({ status }) },
  );
  return data.publication;
}

export async function createPublication(input: CreatePublicationInput): Promise<Publication> {
  const data = await request<{ publication: Publication }>('/api/publications', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.publication;
}

export async function generatePublicationSnapshot(
  id: string,
  snapshot: Record<string, unknown>,
): Promise<Publication> {
  const data = await request<{ publication: Publication }>(
    `/api/publications/${encodeURIComponent(id)}/snapshot`,
    { method: 'POST', body: JSON.stringify({ snapshot }) },
  );
  return data.publication;
}

export async function publishPublication(id: string): Promise<Publication> {
  const data = await request<{ publication: Publication }>(
    `/api/publications/${encodeURIComponent(id)}/publish`,
    { method: 'POST' },
  );
  return data.publication;
}

export async function listAutomations(): Promise<Automation[]> {
  const data = await request<{ automations: Automation[] }>('/api/automations');
  return data.automations;
}

export async function createAutomation(input: CreateAutomationInput): Promise<Automation> {
  const data = await request<{ automation: Automation }>('/api/automations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.automation;
}

export async function activateAutomation(id: string): Promise<Automation> {
  const data = await request<{ automation: Automation }>(
    `/api/automations/${encodeURIComponent(id)}/activate`,
    { method: 'POST' },
  );
  return data.automation;
}

export async function pauseAutomation(id: string): Promise<Automation> {
  const data = await request<{ automation: Automation }>(
    `/api/automations/${encodeURIComponent(id)}/pause`,
    { method: 'POST' },
  );
  return data.automation;
}

export async function getAutomationById(id: string): Promise<Automation> {
  const data = await request<{ automation: Automation }>(`/api/automations/${encodeURIComponent(id)}`);
  return data.automation;
}

export async function listCoupons(): Promise<Coupon[]> {
  const data = await request<{ coupons: Coupon[] }>('/api/coupons');
  return data.coupons;
}

export async function createCoupon(input: CreateCouponInput): Promise<Coupon> {
  const data = await request<{ coupon: Coupon }>('/api/coupons', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.coupon;
}

export async function listEntitlements(): Promise<AgencyEntitlement[]> {
  const data = await request<{ entitlements: AgencyEntitlement[] }>('/api/entitlements');
  return data.entitlements;
}

export async function simulateInternalComment(
  input: SimulateInternalCommentInput,
): Promise<SimulatedEngagementResult> {
  const data = await request<SimulatedEngagementResult | { result: SimulatedEngagementResult }>(
    '/api/connectors/internal-mock/simulate',
    {
      method: 'POST',
      body: JSON.stringify({
        kind: 'comment',
        externalUserId: input.externalUserId,
        content: input.content,
        campaignId: input.campaignId,
        publicationId: input.publicationId,
        offerId: input.offerId,
      }),
    },
  );

  return 'result' in data ? data.result : data;
}
