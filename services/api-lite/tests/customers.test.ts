import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

const VALID_CPF_1 = '529.982.247-25';
const VALID_CPF_2 = '111.444.777-35';
const VALID_CPF_3 = '123.456.789-09';
const INVALID_CPF = '111.111.111-11';

describe('Travel Lite customers CRUD', () => {
  let lite: LiteFixture;
  let adminToken: string;
  let operatorToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    lite = await createLiteFixture();
    adminToken = await lite.login('tenant-a', 'admin@a.test');
    operatorToken = await lite.login('tenant-a', 'operator@a.test');
    viewerToken = await lite.login('tenant-a', 'viewer@a.test');
  });

  afterAll(async () => {
    await lite?.close();
  });

  function post(token: string, payload: Record<string, unknown>) {
    return lite.app.inject({ method: 'POST', url: '/customers', headers: lite.headers(token), payload });
  }

  it('creates a customer and audits it', async () => {
    const response = await post(operatorToken, { name: 'Maria Silva', cpf: VALID_CPF_1, email: 'maria@teste.com' });

    expect(response.statusCode).toBe(201);
    const { customer } = response.json<{ customer: { id: string; name: string; cpf: string; status: string } }>();
    expect(customer.name).toBe('Maria Silva');
    expect(customer.cpf).toBe('52998224725');
    expect(customer.status).toBe('ACTIVE');

    const audit = await lite.adminPool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = $1 AND event_type = 'CUSTOMER_CREATED'`,
      [lite.tenantA],
    );
    expect(audit.rows[0]?.n).toBeGreaterThanOrEqual(1);

    const outbox = await lite.adminPool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM integration_outbox WHERE tenant_id = $1 AND event_type = 'CUSTOMER_CREATED'`,
      [lite.tenantA],
    );
    expect(outbox.rows[0]?.n).toBeGreaterThanOrEqual(1);
  });

  it('rejects an invalid CPF with 400', async () => {
    const response = await post(operatorToken, { name: 'Invalid CPF', cpf: INVALID_CPF });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toMatch(/valid CPF/);
  });

  it('rejects a duplicate CPF inside the same tenant with 409', async () => {
    const response = await post(operatorToken, { name: 'Duplicate', cpf: VALID_CPF_1 });

    expect(response.statusCode).toBe(409);
  });

  it('allows the same CPF in another tenant', async () => {
    const token = await lite.login('tenant-b', 'operator@b.test');
    const response = await post(token, { name: 'Other Tenant', cpf: VALID_CPF_1 });

    expect(response.statusCode).toBe(201);
  });

  it('lists customers with search and pagination', async () => {
    await post(operatorToken, { name: 'Ana Souza', cpf: VALID_CPF_2, email: 'ana@teste.com' });
    await post(operatorToken, { name: 'Bruno Costa', email: 'bruno@teste.com' });

    const all = await lite.app.inject({
      method: 'GET',
      url: '/customers?pageSize=2',
      headers: lite.headers(adminToken),
    });
    expect(all.statusCode).toBe(200);
    const list = all.json<{ items: unknown[]; total: number; page: number; pageSize: number }>();
    expect(list.total).toBeGreaterThanOrEqual(3);
    expect(list.items).toHaveLength(2);
    expect(list.page).toBe(1);
    expect(list.pageSize).toBe(2);

    const search = await lite.app.inject({
      method: 'GET',
      url: '/customers?search=ana%40teste.com',
      headers: lite.headers(adminToken),
    });
    const found = search.json<{ items: Array<{ name: string }> }>();
    expect(found.items).toHaveLength(1);
    expect(found.items[0]?.name).toBe('Ana Souza');
  });

  it('fetches a customer by id and hides it from another tenant', async () => {
    const created = await post(operatorToken, { name: 'Visible' });
    const { customer } = created.json<{ customer: { id: string } }>();

    const own = await lite.app.inject({
      method: 'GET',
      url: `/customers/${customer.id}`,
      headers: lite.headers(adminToken),
    });
    expect(own.statusCode).toBe(200);

    const tokenB = await lite.login('tenant-b', 'operator@b.test');
    const foreign = await lite.app.inject({
      method: 'GET',
      url: `/customers/${customer.id}`,
      headers: lite.headers(tokenB),
    });
    expect(foreign.statusCode).toBe(404);
  });

  it('updates fields and rejects bad input', async () => {
    const created = await post(operatorToken, { name: 'To Update', cpf: VALID_CPF_3 });
    const { customer } = created.json<{ customer: { id: string } }>();

    const updated = await lite.app.inject({
      method: 'PATCH',
      url: `/customers/${customer.id}`,
      headers: lite.headers(operatorToken),
      payload: { name: 'Updated Name', city: 'Curitiba' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<{ customer: { name: string; city: string } }>()).toMatchObject({
      customer: { name: 'Updated Name', city: 'Curitiba' },
    });

    const badCpf = await lite.app.inject({
      method: 'PATCH',
      url: `/customers/${customer.id}`,
      headers: lite.headers(operatorToken),
      payload: { cpf: INVALID_CPF },
    });
    expect(badCpf.statusCode).toBe(400);

    const empty = await lite.app.inject({
      method: 'PATCH',
      url: `/customers/${customer.id}`,
      headers: lite.headers(operatorToken),
      payload: {},
    });
    expect(empty.statusCode).toBe(400);
  });

  it('deactivates a customer on delete (soft delete)', async () => {
    const created = await post(operatorToken, { name: 'To Deactivate' });
    const { customer } = created.json<{ customer: { id: string } }>();

    const removed = await lite.app.inject({
      method: 'DELETE',
      url: `/customers/${customer.id}`,
      headers: lite.headers(operatorToken),
    });
    expect(removed.statusCode).toBe(200);

    const fetched = await lite.app.inject({
      method: 'GET',
      url: `/customers/${customer.id}`,
      headers: lite.headers(adminToken),
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json<{ customer: { status: string } }>().customer.status).toBe('INACTIVE');

    const again = await lite.app.inject({
      method: 'DELETE',
      url: `/customers/${customer.id}`,
      headers: lite.headers(operatorToken),
    });
    expect(again.statusCode).toBe(404);
  });

  it('enforces authorization: viewer cannot write, anonymous cannot read', async () => {
    const viewerWrite = await post(viewerToken, { name: 'Nope' });
    expect(viewerWrite.statusCode).toBe(403);

    const anonymous = await lite.app.inject({ method: 'GET', url: '/customers' });
    expect(anonymous.statusCode).toBe(401);
  });

  it('supports the /api prefix for every route', async () => {
    const response = await lite.app.inject({
      method: 'GET',
      url: '/api/customers',
      headers: lite.headers(adminToken),
    });
    expect(response.statusCode).toBe(200);
  });
});
