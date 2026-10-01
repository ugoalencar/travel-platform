import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

const SELLER_CPF = '529.982.247-25';

describe('Travel Lite sellers and categories', () => {
  let lite: LiteFixture;
  let staffToken: string;
  let masterToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    lite = await createLiteFixture();
    staffToken = await lite.login('tenant-a', 'staff@a.test');
    // Linking a login to a seller needs users.manage (MASTER by default).
    masterToken = await lite.login('tenant-a', 'master@a.test');
    viewerToken = await lite.login('tenant-a', 'viewer@a.test');
  });

  afterAll(async () => {
    await lite?.close();
  });

  function postSeller(token: string, payload: Record<string, unknown>) {
    return lite.app.inject({ method: 'POST', url: '/sellers', headers: lite.headers(token), payload });
  }

  function postCategory(token: string, payload: Record<string, unknown>) {
    return lite.app.inject({ method: 'POST', url: '/categories', headers: lite.headers(token), payload });
  }

  describe('sellers', () => {
    it('creates a seller with a percentage rule and links a tenant user', async () => {
      const response = await postSeller(masterToken, {
        name: 'Vendedora Paula',
        cpf: SELLER_CPF,
        email: 'paula@teste.com',
        commission_rule_type: 'PERCENTAGE_ON_GROSS',
        commission_rate: 5,
        user_id: lite.adminA,
      });

      expect(response.statusCode).toBe(201);
      const { seller } = response.json<{ seller: { id: string; user_id: string; commission_rate: string } }>();
      expect(seller.user_id).toBe(lite.adminA);
      expect(Number(seller.commission_rate)).toBe(5);
    });

    it('creates a seller with no rule (UNDEFINED) carrying no values', async () => {
      const response = await postSeller(staffToken, { name: 'Sem Regra' });

      expect(response.statusCode).toBe(201);
      const { seller } = response.json<{ seller: { commission_rule_type: string; commission_rate: null } }>();
      expect(seller.commission_rule_type).toBe('UNDEFINED');
      expect(seller.commission_rate).toBeNull();
    });

    it('rejects UNDEFINED with values, percentage without rate, FIXED without amount', async () => {
      const withValues = await postSeller(staffToken, {
        name: 'Bad 1',
        commission_rule_type: 'UNDEFINED',
        commission_rate: 5,
      });
      expect(withValues.statusCode).toBe(400);

      const noRate = await postSeller(staffToken, {
        name: 'Bad 2',
        commission_rule_type: 'PERCENTAGE_ON_MARGIN',
      });
      expect(noRate.statusCode).toBe(400);

      const noAmount = await postSeller(staffToken, { name: 'Bad 3', commission_rule_type: 'FIXED' });
      expect(noAmount.statusCode).toBe(400);
    });

    it('rejects a user_id from another tenant', async () => {
      const tokenB = await lite.login('tenant-b', 'staff@b.test');
      const createdB = await postSeller(tokenB, { name: 'Seller B' });
      const sellerB = createdB.json<{ seller: { id: string } }>().seller;

      const staffLink = await postSeller(staffToken, { name: 'No Link Permission', user_id: lite.viewerA });
      expect(staffLink.statusCode).toBe(403);

      const response = await postSeller(masterToken, { name: 'Cross Link', user_id: sellerB.id });
      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: string }>().error).toMatch(/user of this tenant/);
    });

    it('rejects a duplicate seller CPF and an invalid one', async () => {
      const duplicate = await postSeller(staffToken, { name: 'Dup', cpf: SELLER_CPF });
      expect(duplicate.statusCode).toBe(409);

      const invalid = await postSeller(staffToken, { name: 'Bad CPF', cpf: '111.111.111-11' });
      expect(invalid.statusCode).toBe(400);
    });

    it('updates the commission rule atomically (full rule required)', async () => {
      const created = await postSeller(staffToken, { name: 'To Update Rule' });
      const { seller } = created.json<{ seller: { id: string } }>();

      const partial = await lite.app.inject({
        method: 'PATCH',
        url: `/sellers/${seller.id}`,
        headers: lite.headers(staffToken),
        payload: { commission_rate: 3 },
      });
      expect(partial.statusCode).toBe(400);

      const full = await lite.app.inject({
        method: 'PATCH',
        url: `/sellers/${seller.id}`,
        headers: lite.headers(staffToken),
        payload: { commission_rule_type: 'FIXED', commission_fixed_amount: 150.5 },
      });
      expect(full.statusCode).toBe(200);
      const updated = full.json<{ seller: { commission_rule_type: string; commission_rate: string | null } }>();
      expect(updated.seller.commission_rule_type).toBe('FIXED');
      expect(updated.seller.commission_rate).toBeNull();
    });

    it('hides sellers from other tenants', async () => {
      const created = await postSeller(staffToken, { name: 'Private Seller' });
      const { seller } = created.json<{ seller: { id: string } }>();

      const tokenB = await lite.login('tenant-b', 'staff@b.test');
      const foreign = await lite.app.inject({
        method: 'GET',
        url: `/sellers/${seller.id}`,
        headers: lite.headers(tokenB),
      });
      expect(foreign.statusCode).toBe(404);
    });

    it('blocks viewer writes', async () => {
      const response = await postSeller(viewerToken, { name: 'Nope' });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('categories', () => {
    it('creates categories and rejects duplicates', async () => {
      const aereo = await postCategory(staffToken, { name: 'AÉREO', sort_order: 1 });
      expect(aereo.statusCode).toBe(201);
      const { category } = aereo.json<{ category: { id: string; active: boolean } }>();
      expect(category.active).toBe(true);

      await postCategory(staffToken, { name: 'TERRESTRE', sort_order: 2 });

      const duplicate = await postCategory(staffToken, { name: 'AÉREO' });
      expect(duplicate.statusCode).toBe(409);
    });

    it('lists categories ordered and isolated per tenant', async () => {
      const listA = await lite.app.inject({
        method: 'GET',
        url: '/categories',
        headers: lite.headers(staffToken),
      });
      expect(listA.statusCode).toBe(200);
      const itemsA = listA.json<{ items: Array<{ name: string }> }>().items;
      expect(itemsA.map((c) => c.name)).toEqual(['AÉREO', 'TERRESTRE']);

      const tokenB = await lite.login('tenant-b', 'staff@b.test');
      const listB = await lite.app.inject({
        method: 'GET',
        url: '/categories',
        headers: lite.headers(tokenB),
      });
      expect(listB.json<{ items: unknown[] }>().items).toHaveLength(0);
    });

    it('patches active flag and deletes unused categories', async () => {
      const created = await postCategory(staffToken, { name: 'EXCURSÃO' });
      const { category } = created.json<{ category: { id: string } }>();

      const deactivated = await lite.app.inject({
        method: 'PATCH',
        url: `/categories/${category.id}`,
        headers: lite.headers(staffToken),
        payload: { active: false },
      });
      expect(deactivated.statusCode).toBe(200);
      expect(deactivated.json<{ category: { active: boolean } }>().category.active).toBe(false);

      const removed = await lite.app.inject({
        method: 'DELETE',
        url: `/categories/${category.id}`,
        headers: lite.headers(staffToken),
      });
      expect(removed.statusCode).toBe(200);

      const again = await lite.app.inject({
        method: 'DELETE',
        url: `/categories/${category.id}`,
        headers: lite.headers(staffToken),
      });
      expect(again.statusCode).toBe(404);

      const outbox = await lite.adminPool.query<{ event_type: string; entity_id: string }>(
        `SELECT event_type, entity_id FROM integration_outbox
          WHERE entity_id = $1 ORDER BY created_at`,
        [category.id],
      );
      expect(outbox.rows.map((r) => r.event_type)).toEqual([
        'SALE_CATEGORY_CREATED',
        'SALE_CATEGORY_UPDATED',
        'SALE_CATEGORY_DELETED',
      ]);
    });

    it('blocks viewer writes and anonymous access', async () => {
      const viewerWrite = await postCategory(viewerToken, { name: 'NOPE' });
      expect(viewerWrite.statusCode).toBe(403);

      const anonymous = await lite.app.inject({ method: 'GET', url: '/categories' });
      expect(anonymous.statusCode).toBe(401);
    });
  });
});
