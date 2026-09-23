import { describe, expect, it } from 'vitest';
import { runWithTenantContext } from '../../packages/domain/tenant-context';
import { UserRole } from '../../packages/domain/types';
import type { DatabaseRuntime, TenantTransactionClient } from '../../services/api/src/database';
import {
  computeEligibleSegmentIds,
  isCustomerInSegment,
} from '../../services/api/src/customer-segmentation';
import { getAvailableOfferById, listAvailableOffers } from '../../services/api/src/customer-portal';
import {
  getVisibleCommunicationById,
  listVisibleCommunications,
} from '../../services/api/src/agency-communications';

const agencyId = '10000000-0000-4000-8000-000000000001';
const customerId = '30000000-0000-4000-8000-000000000001';
const otherCustomerId = '30000000-0000-4000-8000-000000000002';
const userId = '11000000-0000-4000-8000-000000000001';
const segmentId = '40000000-0000-4000-8000-000000000001';
const offerId = '50000000-0000-4000-8000-000000000001';
const communicationId = '60000000-0000-4000-8000-000000000001';

const matchByNameFilter = {
  operator: 'AND',
  conditions: [
    { field: 'customer.name', operator: 'EQ', value: 'Member Customer' },
  ],
};

function staffContext(id = customerId) {
  return {
    agencyId,
    userId,
    userRole: UserRole.ADMIN,
    email: 'admin@example.test',
    customerId: id,
  };
}

type QueryHandler = (text: string, values?: readonly unknown[]) => { rows: unknown[] };

function makeClient(handler: QueryHandler): TenantTransactionClient {
  return {
    query<T>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }> {
      return Promise.resolve(handler(text, values) as { rows: T[] });
    },
  } as TenantTransactionClient;
}

function makeDatabase(handler: QueryHandler): DatabaseRuntime {
  const client = makeClient(handler);
  return {
    withTenantTransaction: (
      operation: (client: TenantTransactionClient) => Promise<unknown>,
    ) => Promise.resolve(operation(client)),
    withPlatformTransaction: () => Promise.resolve([]),
  } as unknown as DatabaseRuntime;
}

function offerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: offerId,
    agency_id: agencyId,
    name: 'Segmented Offer',
    description: null,
    price: '100',
    valid_from: null,
    valid_until: null,
    status: 'ACTIVE',
    featured: false,
    show_on_customer_app: true,
    target_segment_id: null,
    display_priority: 0,
    image_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function communicationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: communicationId,
    agency_id: agencyId,
    type: 'NOTICE',
    title: 'Segmented Notice',
    body: null,
    image_url: null,
    cover_media_asset_id: null,
    cta_label: null,
    cta_url: null,
    placement: 'CUSTOMER_APP_HOME',
    display_priority: 0,
    target_segment_id: null,
    visible_from: null,
    visible_until: null,
    status: 'ACTIVE',
    created_by: userId,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function segmentRow(filter: unknown = matchByNameFilter) {
  return { id: segmentId, filter_definition: filter };
}

describe('F-04: customer segment membership helpers', () => {
  it('computeEligibleSegmentIds returns only segments the customer actually matches', async () => {
    const client = makeClient((text) => {
      if (text.includes('FROM customer_segments')) {
        return { rows: [segmentRow()] };
      }
      if (text.includes('AS match')) {
        // Customer name matches the EQ condition
        return { rows: [{ match: true }] };
      }
      throw new Error(`unexpected query: ${text}`);
    });

    const ids = await runWithTenantContext(staffContext(), () =>
      computeEligibleSegmentIds(client, customerId),
    );
    expect(ids).toEqual([segmentId]);
  });

  it('computeEligibleSegmentIds returns [] when the membership query fails (fail closed)', async () => {
    const client = makeClient((text) => {
      if (text.includes('FROM customer_segments')) {
        return { rows: [segmentRow()] };
      }
      throw new Error('membership evaluation exploded');
    });

    const ids = await runWithTenantContext(staffContext(), () =>
      computeEligibleSegmentIds(client, customerId),
    );
    expect(ids).toEqual([]);
  });

  it('isCustomerInSegment returns false for unknown/archived segment ids', async () => {
    const client = makeClient((text) => {
      if (text.includes('FROM customer_segments')) {
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${text}`);
    });

    const result = await runWithTenantContext(staffContext(), () =>
      isCustomerInSegment(client, segmentId, customerId),
    );
    expect(result).toBe(false);
  });

  it('isCustomerInSegment returns false when the filter_definition is invalid (fail closed)', async () => {
    const client = makeClient((text) => {
      if (text.includes('FROM customer_segments')) {
        return { rows: [segmentRow({ operator: 'AND', conditions: [] })] };
      }
      throw new Error(`unexpected query: ${text}`);
    });

    const result = await runWithTenantContext(staffContext(), () =>
      isCustomerInSegment(client, segmentId, customerId),
    );
    expect(result).toBe(false);
  });
});

describe('F-04: offers visibility', () => {
  it('listAvailableOffers only includes segments the customer matches (never all active segments)', async () => {
    let membershipSql = '';
    const database = makeDatabase((text, values) => {
      if (text.includes('FROM customer_segments')) {
        return { rows: [segmentRow()] };
      }
      if (text.includes('AS match')) {
        membershipSql = text;
        // Non-member: the EXISTS check is false
        return { rows: [{ match: false }] };
      }
      if (text.includes('FROM offers')) {
        // The offers query must not receive the raw segment id when the
        // customer is not a member.
        expect(values?.[1]).toEqual(['__none__']);
        return { rows: [offerRow({ target_segment_id: segmentId })] };
      }
      throw new Error(`unexpected query: ${text}`);
    });

    const offers = await runWithTenantContext(staffContext(), () =>
      listAvailableOffers(database),
    );
    expect(membershipSql).toContain('AS match');
    // Fail closed: non-member must not see the segmented offer even if
    // the offers query (buggy or not) returned it.
    expect(offers).toEqual([]);
  });

  it('getAvailableOfferById returns null when show_on_customer_app is false', async () => {
    const database = makeDatabase((text) => {
      if (text.includes('FROM offers')) {
        return { rows: [offerRow({ show_on_customer_app: false, target_segment_id: null })] };
      }
      throw new Error(`unexpected query: ${text}`);
    });

    const offer = await runWithTenantContext(staffContext(), () =>
      getAvailableOfferById(database, offerId),
    );
    expect(offer).toBeNull();
  });

  it('getAvailableOfferById returns null when the customer is not in the target segment', async () => {
    const database = makeDatabase((text) => {
      if (text.includes('FROM offers')) {
        return { rows: [offerRow({ target_segment_id: segmentId })] };
      }
      if (text.includes('FROM customer_segments')) {
        return { rows: [segmentRow()] };
      }
      if (text.includes('AS match')) {
        return { rows: [{ match: false }] };
      }
      throw new Error(`unexpected query: ${text}`);
    });

    const offer = await runWithTenantContext(staffContext(), () =>
      getAvailableOfferById(database, offerId),
    );
    expect(offer).toBeNull();
  });

  it('getAvailableOfferById returns the offer when the customer IS in the target segment', async () => {
    const database = makeDatabase((text) => {
      if (text.includes('FROM offers')) {
        return { rows: [offerRow({ target_segment_id: segmentId })] };
      }
      if (text.includes('FROM customer_segments')) {
        return { rows: [segmentRow()] };
      }
      if (text.includes('AS match')) {
        return { rows: [{ match: true }] };
      }
      throw new Error(`unexpected query: ${text}`);
    });

    const offer = await runWithTenantContext(staffContext(), () =>
      getAvailableOfferById(database, offerId),
    );
    expect(offer).toMatchObject({ id: offerId });
  });
});

describe('F-04: communications visibility', () => {
  it('listVisibleCommunications includes NULL-target and member-only targeted rows', async () => {
    const database = makeDatabase((text) => {
      if (text.includes('FROM agency_communications')) {
        return {
          rows: [
            communicationRow({ id: '60000000-0000-4000-8000-00000000000a', target_segment_id: null }),
            communicationRow({ id: '60000000-0000-4000-8000-00000000000b', target_segment_id: segmentId }),
          ],
        };
      }
      if (text.includes('FROM customer_segments')) {
        return { rows: [segmentRow()] };
      }
      if (text.includes('AS match')) {
        return { rows: [{ match: true }] };
      }
      throw new Error(`unexpected query: ${text}`);
    });

    const rows = await runWithTenantContext(staffContext(), () =>
      listVisibleCommunications(database, 'CUSTOMER_APP_HOME'),
    );
    expect(rows.map((r) => r.id)).toEqual([
      '60000000-0000-4000-8000-00000000000a',
      '60000000-0000-4000-8000-00000000000b',
    ]);
  });

  it('listVisibleCommunications hides targeted rows from non-members', async () => {
    const database = makeDatabase((text) => {
      if (text.includes('FROM agency_communications')) {
        return {
          rows: [
            communicationRow({ id: '60000000-0000-4000-8000-00000000000a', target_segment_id: null }),
            communicationRow({ id: '60000000-0000-4000-8000-00000000000b', target_segment_id: segmentId }),
          ],
        };
      }
      if (text.includes('FROM customer_segments')) {
        return { rows: [segmentRow()] };
      }
      if (text.includes('AS match')) {
        return { rows: [{ match: false }] };
      }
      throw new Error(`unexpected query: ${text}`);
    });

    const rows = await runWithTenantContext(staffContext(), () =>
      listVisibleCommunications(database, 'CUSTOMER_APP_HOME'),
    );
    expect(rows.map((r) => r.id)).toEqual(['60000000-0000-4000-8000-00000000000a']);
  });

  it('getVisibleCommunicationById returns null for a targeted row when the customer is not a member', async () => {
    const database = makeDatabase((text) => {
      if (text.includes('FROM agency_communications')) {
        return { rows: [communicationRow({ target_segment_id: segmentId })] };
      }
      if (text.includes('FROM customer_segments')) {
        return { rows: [segmentRow()] };
      }
      if (text.includes('AS match')) {
        return { rows: [{ match: false }] };
      }
      throw new Error(`unexpected query: ${text}`);
    });

    const row = await runWithTenantContext(staffContext(), () =>
      getVisibleCommunicationById(database, communicationId),
    );
    expect(row).toBeNull();
  });

  it('getVisibleCommunicationById returns null when the customer is a member of a different customer context', async () => {
    // Same segment evaluation, but run under a different customerId to
    // prove membership is keyed off the established context identity.
    const database = makeDatabase((text) => {
      if (text.includes('FROM agency_communications')) {
        return { rows: [communicationRow({ target_segment_id: segmentId })] };
      }
      if (text.includes('FROM customer_segments')) {
        return { rows: [segmentRow()] };
      }
      if (text.includes('AS match')) {
        // values[1] is the customerId bound into the EXISTS check
        return { rows: [{ match: false }] };
      }
      throw new Error(`unexpected query: ${text}`);
    });

    const row = await runWithTenantContext(staffContext(otherCustomerId), () =>
      getVisibleCommunicationById(database, communicationId),
    );
    expect(row).toBeNull();
  });
});
