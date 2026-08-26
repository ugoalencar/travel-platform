import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAsset,
  createAutomation,
  createCampaign,
  createCoupon,
  createPublication,
  generatePublicationSnapshot,
  listEntitlements,
  publishPublication,
  simulateInternalComment,
} from './offerGrowthApi';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonRequestBodyAt(index: number): Record<string, unknown> {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
  if (typeof init?.body !== 'string') {
    throw new Error('Expected JSON string request body');
  }
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe('offerGrowthApi', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('creates assets without tenant spoofing or provenance mutation fields', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        asset: {
          id: 'asset-1',
          agencyId: 'agency-a',
          type: 'IMAGE',
          source: 'PESCADOR',
          storageUrl: 'https://cdn.example.com/cancun.jpg',
          sourceCaptureId: 'capture-1',
          metaTags: ['cancun'],
          metaVariants: [],
          createdAt: '2026-08-25T00:00:00.000Z',
          updatedAt: '2026-08-25T00:00:00.000Z',
        },
      }),
    );

    await createAsset({
      type: 'IMAGE',
      source: 'PESCADOR',
      storageUrl: 'https://cdn.example.com/cancun.jpg',
      sourceCaptureId: 'capture-1',
      metaTags: ['cancun'],
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/assets');
    expect(init.method).toBe('POST');
    const payload = jsonRequestBodyAt(0);
    expect(payload).toEqual({
      type: 'IMAGE',
      source: 'PESCADOR',
      storageUrl: 'https://cdn.example.com/cancun.jpg',
      sourceCaptureId: 'capture-1',
      metaTags: ['cancun'],
    });
    expect(payload).not.toHaveProperty('agencyId');
    expect(payload).not.toHaveProperty('createdByUserId');
    expect(payload).not.toHaveProperty('id');
  });

  it('maps the Cancun publication lifecycle endpoints to the backend contract', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ campaign: { id: 'campaign-1', name: 'CANCUN SETEMBRO' } }))
      .mockResolvedValueOnce(jsonResponse({ publication: { id: 'pub-1', status: 'DRAFT' } }))
      .mockResolvedValueOnce(jsonResponse({ publication: { id: 'pub-1', status: 'DRAFT', snapshot: { slides: [] } } }))
      .mockResolvedValueOnce(jsonResponse({ publication: { id: 'pub-1', status: 'PUBLISHED' } }));

    await createCampaign({
      name: 'CANCUN SETEMBRO',
      timezone: 'America/Sao_Paulo',
      offerIds: ['offer-1'],
    });
    await createPublication({
      campaignId: 'campaign-1',
      offerId: 'offer-1',
      channel: 'INTERNAL_TEST_INSTAGRAM',
      creativeTemplateId: 'tpl-cancun-carousel',
    });
    await generatePublicationSnapshot('pub-1', {
      channelLabel: 'TEST / INTERNAL CHANNEL',
      slides: [],
    });
    await publishPublication('pub-1');

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      '/api/campaigns',
      '/api/publications',
      '/api/publications/pub-1/snapshot',
      '/api/publications/pub-1/publish',
    ]);
  });

  it('creates COMMENT_KEYWORD automation with backend action names and no unsafe fields', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ automation: { id: 'auto-1', status: 'DRAFT' } }));

    await createAutomation({
      name: 'COMMENT CANCUN',
      trigger: 'COMMENT_KEYWORD',
      channel: 'INTERNAL_TEST_INSTAGRAM',
      publicationId: 'pub-1',
      keyword: 'CANCUN',
      cooldownSeconds: 0,
      actions: [
        { type: 'PUBLIC_REPLY', message: 'Enviamos os detalhes no privado.' },
        { type: 'PRIVATE_MESSAGE', message: 'Use o cupom CANCUN300.' },
        {
          type: 'CREATE_COUPON',
          couponTemplate: {
            name: 'CANCUN300',
            type: 'FIXED_AMOUNT',
            value: 300,
            maxUses: 1,
          },
        },
        { type: 'SEND_COUPON', deliveryChannel: 'INTERNAL_TEST_INSTAGRAM' },
        { type: 'CREATE_OPPORTUNITY' },
      ],
    });

    const payload = jsonRequestBodyAt(0);
    expect(payload).toMatchObject({
      name: 'COMMENT CANCUN',
      trigger: 'COMMENT_KEYWORD',
      keyword: 'CANCUN',
    });
    expect(payload).not.toHaveProperty('agencyId');
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('createdByUserId');
  });

  it('surfaces entitlement failures from the real backend as 403 ApiError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'Feature not enabled', code: 'FORBIDDEN' }, 403),
    );

    await expect(listEntitlements()).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('simulates duplicate Cancun comments through the internal connector contract', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          result: {
            engagementId: 'eng-1',
            executions: [{ automationId: 'auto-1', deduped: false, executionId: 'exec-1' }],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          result: {
            engagementId: 'eng-2',
            executions: [{ automationId: 'auto-1', deduped: true }],
          },
        }),
      );

    const event = {
      channel: 'INTERNAL_TEST_INSTAGRAM',
      externalEventId: 'evt-cancun-1',
      externalUserId: 'ig-user-1',
      content: 'CANCUN',
      publicationId: 'pub-1',
      campaignId: 'campaign-1',
      offerId: 'offer-1',
    };

    const first = await simulateInternalComment(event);
    const replay = await simulateInternalComment(event);

    expect(first.executions[0]?.deduped).toBe(false);
    expect(replay.executions[0]?.deduped).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/connectors/internal-mock/simulate');
  });

  it('creates manual CANCUN300 coupon without grant/redemption mass assignment fields', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ coupon: { id: 'coupon-1', code: 'CANCUN300' } }));

    await createCoupon({
      code: 'CANCUN300',
      name: 'Desconto Cancun',
      type: 'FIXED_AMOUNT',
      value: 300,
      maxUses: 1,
      offerId: 'offer-1',
    });

    const payload = jsonRequestBodyAt(0);
    expect(payload).toEqual({
      code: 'CANCUN300',
      name: 'Desconto Cancun',
      type: 'FIXED_AMOUNT',
      value: 300,
      maxUses: 1,
      offerId: 'offer-1',
    });
    expect(payload).not.toHaveProperty('agencyId');
    expect(payload).not.toHaveProperty('active');
  });
});
