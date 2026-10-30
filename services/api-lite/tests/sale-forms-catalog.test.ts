/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- HTTP/JSON fixtures in this integration test are intentionally untyped */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

type Json = Record<string, unknown>;

describe('Travel Lite — configurable sale form, catalog products and sale items (Onda B)', () => {
  let lite: LiteFixture;
  let staff: string; // MANAGER of tenant A (settings.manage + sales.create)
  let viewer: string;
  let staffB: string;
  let admin: string; // ADMIN of tenant A: only administrators configure categories/forms
  let adminB: string;
  let customerId: string;
  let sellerId: string;
  let supplierId: string;
  let supplierBId: string;

  beforeAll(async () => {
    lite = await createLiteFixture();
    staff = await lite.login('tenant-a', 'staff@a.test');
    viewer = await lite.login('tenant-a', 'viewer@a.test');
    staffB = await lite.login('tenant-b', 'staff@b.test');
    admin = await lite.login('tenant-a', 'admin@a.test');
    adminB = await lite.login('tenant-b', 'admin@b.test');

    customerId = (await post(staff, '/customers', { name: 'Cliente Onda B' })).body.customer.id as string;
    sellerId = (
      await post(staff, '/sellers', { name: 'Vendedor', commission_rule_type: 'PERCENTAGE_ON_GROSS', commission_rate: 10 })
    ).body.seller.id as string;
    supplierId = (await post(staff, '/financial-parties', { type: 'SUPPLIER', name: 'Fornecedor A' })).body.financialParty?.id as string;
    supplierBId = (await post(staffB, '/financial-parties', { type: 'SUPPLIER', name: 'Fornecedor B' })).body.financialParty?.id as string;
  });

  afterAll(async () => {
    await lite?.close();
  });

  async function call(token: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: unknown) {
    const res = await lite.app.inject({
      method,
      url,
      headers: lite.headers(token),
      ...(payload !== undefined ? { payload: payload as Json } : {}),
    });
    return { status: res.statusCode, body: res.json<Json & Record<string, any>>() as Record<string, any> };
  }
  const post = (t: string, u: string, p?: unknown) => call(t, 'POST', u, p ?? {});

  let categorySeq = 0;
  async function newCategory(token = admin, name?: string): Promise<string> {
    categorySeq += 1;
    const res = await post(token, '/categories', { name: name ?? `Categoria ${categorySeq}` });
    expect(res.status).toBe(201);
    return res.body.category.id as string;
  }

  async function setForm(categoryId: string, fields: Array<Record<string, unknown>>, token = admin) {
    return call(token, 'PUT', `/categories/${categoryId}/form`, { fields });
  }

  function saleBody(categoryId: string, extra: Json = {}): Json {
    return {
      customer_id: customerId,
      seller_id: sellerId,
      category_id: categoryId,
      gross_amount: 1000,
      due_date: '2026-12-01',
      ...extra,
    };
  }

  describe('only administrators configure categories and forms', () => {
    it('MANAGER (settings.manage) gets 403 on every configuration write; reading the form still works', async () => {
      const id = await newCategory();
      expect((await post(staff, '/categories', { name: 'Gerente tenta' })).status).toBe(403);
      expect((await call(staff, 'PATCH', `/categories/${id}`, { active: false })).status).toBe(403);
      expect((await call(staff, 'DELETE', `/categories/${id}`)).status).toBe(403);
      expect((await setForm(id, [{ field_key: 'origin_text', enabled: true, required: false }], staff)).status).toBe(403);
      expect((await call(staff, 'GET', `/categories/${id}/form`)).status).toBe(200);
      expect((await call(staff, 'GET', '/categories')).status).toBe(200);
    });

    it('ADMIN configures', async () => {
      const id = await newCategory();
      expect((await setForm(id, [{ field_key: 'origin_text', enabled: true, required: false }], admin)).status).toBe(200);
      expect((await call(admin, 'PATCH', `/categories/${id}`, { active: true })).status).toBe(200);
    });
  });

  describe('form profile', () => {
    it('GET /sale-form-fields exposes the registry (Lite subset)', async () => {
      const res = await call(viewer, 'GET', '/sale-form-fields');
      expect(res.status).toBe(200);
      const keys = (res.body.fields as Array<{ key: string }>).map((f) => f.key);
      expect(keys).toContain('origin_text');
      expect(keys).toContain('sale_date');
    });

    it('PUT replaces the profile and bumps the revision; GET merges registry + config; audit is recorded', async () => {
      const id = await newCategory();
      const first = await setForm(id, [
        { field_key: 'origin_text', enabled: true, required: true },
        { field_key: 'destination_text', enabled: true, required: false },
      ]);
      expect(first.status).toBe(200);
      expect(first.body.form.form_revision).toBe(1);
      const second = await setForm(id, [{ field_key: 'origin_text', enabled: true, required: false }]);
      expect(second.body.form.form_revision).toBe(2);

      const form = await call(viewer, 'GET', `/categories/${id}/form`);
      const byKey = Object.fromEntries((form.body.form.fields as Array<{ field_key: string }>).map((f) => [f.field_key, f]));
      expect(byKey.origin_text).toMatchObject({ enabled: true, required: false });
      expect(byKey.destination_text).toMatchObject({ enabled: false, required: false });
      expect(byKey.sale_date).toMatchObject({ enabled: true, locked: true });

      const events = await lite.adminPool.query(
        `SELECT count(*)::int AS n FROM audit_logs WHERE event_type = 'SALE_CATEGORY_FORM_UPDATED' AND entity_id = $1`,
        [id],
      );
      expect(events.rows[0].n).toBe(2);
    });

    it('rejects unknown keys, required-but-disabled, locked disable; viewer cannot configure; nothing is persisted on failure', async () => {
      const id = await newCategory();
      expect((await setForm(id, [{ field_key: 'nope', enabled: true, required: false }])).status).toBe(400);
      expect((await setForm(id, [{ field_key: 'origin_text', enabled: false, required: true }])).status).toBe(400);
      expect((await setForm(id, [{ field_key: 'sale_date', enabled: false, required: false }])).status).toBe(400);
      expect((await setForm(id, [{ field_key: 'origin_text', enabled: true, required: false }], viewer)).status).toBe(403);
      const n = await lite.adminPool.query(`SELECT count(*)::int AS n FROM sale_category_fields WHERE category_id = $1`, [id]);
      expect(n.rows[0].n).toBe(0);
    });

    it('tenant isolation: another tenant cannot read or configure the form', async () => {
      const id = await newCategory();
      expect((await call(staffB, 'GET', `/categories/${id}/form`)).status).toBe(404);
      expect((await setForm(id, [], adminB)).status).toBe(404);
    });
  });

  describe('sale with a category form', () => {
    async function aereo(): Promise<string> {
      const id = await newCategory(admin, `Aéreo ${Math.random().toString(36).slice(2, 7)}`);
      await setForm(id, [
        { field_key: 'origin_text', enabled: true, required: true },
        { field_key: 'destination_text', enabled: true, required: true },
        { field_key: 'travel_start_date', enabled: true, required: false },
        { field_key: 'passenger_count', enabled: true, required: false },
        { field_key: 'locator', enabled: true, required: false },
      ]);
      return id;
    }

    it('characterization: a category without any profile keeps accepting the legacy body; sale_date works as before', async () => {
      const id = await newCategory();
      const res = await post(staff, '/sales', saleBody(id, { sale_date: '2026-09-10' }));
      expect(res.status).toBe(201);
      expect(res.body.sale.sale_date).toBe('2026-09-10');
      const row = await lite.adminPool.query(`SELECT form_snapshot, modality_data FROM sales WHERE id = $1`, [res.body.sale.id]);
      expect(row.rows[0].modality_data).toEqual({});
      expect(row.rows[0].form_snapshot).toMatchObject({ formRevision: 0, fields: [] });
    });

    it('missing required -> 422 FIELD_REQUIRED; disabled field -> 422 FIELD_DISABLED; nothing persisted', async () => {
      const category = await aereo();
      const before = (await lite.adminPool.query(`SELECT count(*)::int AS n FROM sales`)).rows[0].n;
      const missing = await post(staff, '/sales', saleBody(category, { origin_text: 'POA' }));
      expect(missing.status).toBe(422);
      expect(missing.body).toMatchObject({ code: 'FIELD_REQUIRED', field: 'destination_text' });
      const disabled = await post(staff, '/sales', saleBody(category, { origin_text: 'POA', destination_text: 'LIS', travel_end_date: '2026-12-30' }));
      expect(disabled.status).toBe(422);
      expect(disabled.body).toMatchObject({ code: 'FIELD_DISABLED', field: 'travel_end_date' });
      expect((await lite.adminPool.query(`SELECT count(*)::int AS n FROM sales`)).rows[0].n).toBe(before);
    });

    it('persists first-class columns, modality data and a self-contained snapshot', async () => {
      const category = await aereo();
      const res = await post(
        staff,
        '/sales',
        saleBody(category, {
          origin_text: 'POA', destination_text: 'LIS', travel_start_date: '2026-12-20', passenger_count: 2,
          modality_data: { locator: 'ABC123' },
        }),
      );
      expect(res.status).toBe(201);
      expect(res.body.sale).toMatchObject({
        origin_text: 'POA', destination_text: 'LIS', travel_start_date: '2026-12-20', passenger_count: 2,
        modality_data: { locator: 'ABC123' },
      });
      const row = await lite.adminPool.query(`SELECT form_snapshot FROM sales WHERE id = $1`, [res.body.sale.id]);
      expect(row.rows[0].form_snapshot).toMatchObject({
        categoryId: category, formRevision: 1,
        fields: expect.arrayContaining([expect.objectContaining({ fieldKey: 'origin_text', required: true })]),
      });
    });

    it('profile changes do not alter existing sales; a DRAFT keeps being edited under its snapshot', async () => {
      const category = await aereo();
      const created = await post(staff, '/sales', saleBody(category, { origin_text: 'POA', destination_text: 'LIS' }));
      const saleId = created.body.sale.id as string;
      await setForm(category, [
        { field_key: 'origin_text', enabled: true, required: true },
        { field_key: 'destination_text', enabled: false, required: false },
        { field_key: 'travel_end_date', enabled: true, required: true },
      ]);
      const snap = await lite.adminPool.query(`SELECT form_snapshot FROM sales WHERE id = $1`, [saleId]);
      expect(snap.rows[0].form_snapshot.formRevision).toBe(1);

      const ok = await call(staff, 'PATCH', `/sales/${saleId}`, { destination_text: 'OPO' });
      expect(ok.status).toBe(200);
      expect(ok.body.sale.destination_text).toBe('OPO');
      const refused = await call(staff, 'PATCH', `/sales/${saleId}`, { travel_end_date: '2026-12-30' });
      expect(refused.status).toBe(422);
      expect(refused.body.code).toBe('FIELD_DISABLED');
      const cleared = await call(staff, 'PATCH', `/sales/${saleId}`, { origin_text: '' });
      expect(cleared.status).toBe(422);
      expect(cleared.body.code).toBe('FIELD_REQUIRED');

      const fresh = await post(staff, '/sales', saleBody(category, { origin_text: 'POA' }));
      expect(fresh.status).toBe(422);
      expect(fresh.body.field).toBe('travel_end_date');
    });

    it('changing the category of a DRAFT re-validates against the new profile and re-snapshots', async () => {
      const first = await aereo();
      const second = await newCategory(admin, `Terrestre ${Math.random().toString(36).slice(2, 7)}`);
      await setForm(second, [{ field_key: 'passenger_count', enabled: true, required: true }]);
      const created = await post(staff, '/sales', saleBody(first, { origin_text: 'A', destination_text: 'B' }));
      const saleId = created.body.sale.id as string;
      // the new profile requires passenger_count and disables origin/destination
      const incompatible = await call(staff, 'PATCH', `/sales/${saleId}`, { category_id: second });
      expect(incompatible.status).toBe(422);
      const moved = await call(staff, 'PATCH', `/sales/${saleId}`, {
        category_id: second, passenger_count: 4, origin_text: null, destination_text: null,
      });
      expect(moved.status).toBe(200);
      const row = await lite.adminPool.query(`SELECT form_snapshot, origin_text FROM sales WHERE id = $1`, [saleId]);
      expect(row.rows[0].form_snapshot.categoryId).toBe(second);
      expect(row.rows[0].origin_text).toBeNull();
    });

    it('rate/base/deadline/commission from the client -> 422 FIELD_NOT_ALLOWED', async () => {
      const category = await aereo();
      for (const key of ['rate', 'base', 'deadline', 'commission']) {
        const res = await post(staff, '/sales', saleBody(category, { origin_text: 'A', destination_text: 'B', [key]: 5 }));
        expect(res.status).toBe(422);
        expect(res.body).toMatchObject({ code: 'FIELD_NOT_ALLOWED', field: key });
      }
    });

    it('cross-tenant category on a sale is refused and the database FK also refuses it', async () => {
      const foreign = await newCategory(adminB, 'Categoria do B');
      const res = await post(staff, '/sales', saleBody(foreign));
      expect([400, 404, 422]).toContain(res.status);
      await expect(
        lite.adminPool.query(
          `INSERT INTO sales (tenant_id, customer_id, seller_id, category_id, sale_number, gross_amount, margin_amount, due_date)
           VALUES ($1, $2, $3, $4, 'X-1', 1, 1, '2026-12-01')`,
          [lite.tenantA, customerId, sellerId, foreign],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });

  describe('catalog products', () => {
    it('creates a product linked to a supplier of the same tenant; lists, patches, deactivates; viewer cannot write', async () => {
      const category = await newCategory();
      const created = await post(staff, '/catalog-products', { name: 'Pacote Lisboa', category_id: category, default_supplier_id: supplierId });
      expect(created.status).toBe(201);
      expect(created.body.product).toMatchObject({ name: 'Pacote Lisboa', category_id: category, default_supplier_id: supplierId, active: true });
      const id = created.body.product.id as string;

      expect((await post(viewer, '/catalog-products', { name: 'X' })).status).toBe(403);
      expect((await call(viewer, 'GET', '/catalog-products')).status).toBe(200);
      const patched = await call(staff, 'PATCH', `/catalog-products/${id}`, { active: false });
      expect(patched.body.product.active).toBe(false);
      const listActive = await call(staff, 'GET', '/catalog-products');
      expect((listActive.body.items as Array<{ id: string }>).some((p) => p.id === id)).toBe(false);
      const listAll = await call(staff, 'GET', '/catalog-products?include_inactive=true');
      expect((listAll.body.items as Array<{ id: string }>).some((p) => p.id === id)).toBe(true);
    });

    it('refuses a supplier or category from another tenant, a duplicate name and a non-supplier party', async () => {
      expect((await post(staff, '/catalog-products', { name: 'Cross', default_supplier_id: supplierBId })).status).toBe(404);
      const foreignCategory = await newCategory(adminB, 'Cat B 2');
      expect((await post(staff, '/catalog-products', { name: 'Cross2', category_id: foreignCategory })).status).toBe(404);
      await post(staff, '/catalog-products', { name: 'Duplicado' });
      expect((await post(staff, '/catalog-products', { name: 'duplicado' })).status).toBe(409);
      const other = (await post(staff, '/financial-parties', { type: 'OTHER', name: 'Outro' })).body.financialParty?.id as string;
      expect((await post(staff, '/catalog-products', { name: 'Nao fornecedor', default_supplier_id: other })).status).toBe(422);
    });

    it('tenant B never sees tenant A products', async () => {
      await post(staff, '/catalog-products', { name: 'Produto do A' });
      const list = await call(staffB, 'GET', '/catalog-products?include_inactive=true');
      expect((list.body.items as Array<{ name: string }>).some((p) => p.name === 'Produto do A')).toBe(false);
    });
  });

  describe('sale items', () => {
    async function draft(grossAmount = 500): Promise<string> {
      const category = await newCategory();
      const res = await post(staff, '/sales', saleBody(category, { gross_amount: grossAmount }));
      expect(res.status).toBe(201);
      return res.body.sale.id as string;
    }

    it('adds items; gross_amount becomes the sum of line totals (qty*price - discount + taxes + fees)', async () => {
      const saleId = await draft();
      const a = await post(staff, `/sales/${saleId}/items`, { description: 'Tarifa aérea', qty: 1, unit_price: 2000, taxes: 300 });
      expect(a.status).toBe(201);
      expect(a.body.item.line_total).toBe(2300);
      expect(a.body.sale.gross_amount).toBe(2300);
      const b = await post(staff, `/sales/${saleId}/items`, { description: 'Seguro', qty: 2, unit_price: 50.5, discount: 1 });
      expect(b.body.item.line_total).toBe(100);
      expect(b.body.sale.gross_amount).toBe(2400);
      const list = await call(viewer, 'GET', `/sales/${saleId}/items`);
      expect(list.body.items).toHaveLength(2);
    });

    it('with active items the client cannot set gross_amount (422); without items it still can', async () => {
      const saleId = await draft();
      expect((await call(staff, 'PATCH', `/sales/${saleId}`, { gross_amount: 700 })).status).toBe(200);
      await post(staff, `/sales/${saleId}/items`, { description: 'Item', unit_price: 100 });
      const refused = await call(staff, 'PATCH', `/sales/${saleId}`, { gross_amount: 9999 });
      expect(refused.status).toBe(422);
      expect(refused.body).toMatchObject({ code: 'FIELD_NOT_ALLOWED', field: 'gross_amount' });
    });

    it('cancelling an item recomputes the gross from the remaining active items', async () => {
      const saleId = await draft();
      const a = await post(staff, `/sales/${saleId}/items`, { description: 'A', unit_price: 100 });
      const b = await post(staff, `/sales/${saleId}/items`, { description: 'B', unit_price: 40 });
      expect(a.status).toBe(201);
      const cancelB = await post(staff, `/sale-items/${b.body.item.id}/cancel`);
      expect(cancelB.status).toBe(200);
      expect(cancelB.body.sale.gross_amount).toBe(100);
    });

    it('validates input; items only on DRAFT; confirmation uses the derived gross for the receivables', async () => {
      const saleId = await draft();
      expect((await post(staff, `/sales/${saleId}/items`, { description: '', unit_price: 10 })).status).toBe(400);
      expect((await post(staff, `/sales/${saleId}/items`, { description: 'x', unit_price: -1 })).status).toBe(400);
      expect((await post(staff, `/sales/${saleId}/items`, { description: 'x', unit_price: 10, qty: 0 })).status).toBe(400);
      expect((await post(staff, `/sales/${saleId}/items`, { description: 'x', unit_price: 10, line_total: 1 })).status).toBe(400);
      expect((await post(viewer, `/sales/${saleId}/items`, { description: 'x', unit_price: 10 })).status).toBe(403);
      await post(staff, `/sales/${saleId}/items`, { description: 'Pacote', qty: 1, unit_price: 1200 });
      const confirm = await post(staff, `/sales/${saleId}/confirm`);
      expect(confirm.status).toBe(200);
      const receivables = await lite.adminPool.query(`SELECT sum(amount)::float AS total FROM receivables WHERE sale_id = $1`, [saleId]);
      expect(receivables.rows[0].total).toBe(1200);
      const late = await post(staff, `/sales/${saleId}/items`, { description: 'tarde', unit_price: 10 });
      expect(late.status).toBe(409);
    });

    it('product and supplier must belong to the tenant; inactive product is not selectable', async () => {
      const saleId = await draft();
      const product = (await post(staff, '/catalog-products', { name: `Prod ${Math.random()}`, default_supplier_id: supplierId })).body.product;
      const ok = await post(staff, `/sales/${saleId}/items`, { description: 'Com produto', unit_price: 10, product_id: product.id, supplier_id: supplierId });
      expect(ok.status).toBe(201);
      expect(ok.body.item).toMatchObject({ product_id: product.id, supplier_id: supplierId });
      expect((await post(staff, `/sales/${saleId}/items`, { description: 'x', unit_price: 10, supplier_id: supplierBId })).status).toBe(404);
      await call(staff, 'PATCH', `/catalog-products/${product.id}`, { active: false });
      expect((await post(staff, `/sales/${saleId}/items`, { description: 'x', unit_price: 10, product_id: product.id })).status).toBe(422);
    });

    it('item precision: at most 2 decimals everywhere and within the Full column limits', async () => {
      const saleId = await draft();
      const bad = [
        { description: 'x', unit_price: 10, qty: 1.005 },
        { description: 'x', unit_price: 10, qty: 0.001 },
        { description: 'x', unit_price: 10, qty: 100000000 },
        { description: 'x', unit_price: 10.005 },
        { description: 'x', unit_price: 10_000_000_000 },
      ];
      for (const body of bad) expect((await post(staff, `/sales/${saleId}/items`, body)).status).toBe(400);
      expect((await post(staff, `/sales/${saleId}/items`, { description: 'ok', unit_price: 10.5, qty: 2.25 })).status).toBe(201);
      // binary floating point must not reject legitimate 2-decimal values
      for (const qty of [1.1, 2.3, 1.11]) {
        expect((await post(staff, `/sales/${saleId}/items`, { description: `q${qty}`, unit_price: 1.1, qty })).status).toBe(201);
      }
      const cols = await lite.adminPool.query(
        `SELECT column_name, numeric_precision::int AS p, numeric_scale::int AS s FROM information_schema.columns
          WHERE table_name = 'sale_items' AND column_name IN ('qty','unit_price','taxes','fees','discount','line_total')`,
      );
      const byName = Object.fromEntries(cols.rows.map((r) => [r.column_name, [r.p, r.s]]));
      expect(byName).toEqual({ qty: [10, 2], unit_price: [12, 2], taxes: [12, 2], fees: [12, 2], discount: [12, 2], line_total: [12, 2] });
    });

    it('tenant B cannot list, add to or cancel items of tenant A', async () => {
      const saleId = await draft();
      const item = await post(staff, `/sales/${saleId}/items`, { description: 'Privado', unit_price: 10 });
      expect((await call(staffB, 'GET', `/sales/${saleId}/items`)).status).toBe(404);
      expect((await post(staffB, `/sales/${saleId}/items`, { description: 'x', unit_price: 1 })).status).toBe(404);
      expect((await post(staffB, `/sale-items/${item.body.item.id}/cancel`)).status).toBe(404);
    });
  });
  describe('review follow-ups', () => {
    it('importing into a category with required fields still works (rows carry no form values)', async () => {
      const category = await newCategory(admin, 'Import com obrigatório');
      await setForm(category, [{ field_key: 'origin_text', enabled: true, required: true }]);
      await lite.adminPool.query(`INSERT INTO customers (tenant_id, name, cpf) VALUES ($1, 'Cliente Import', '93541134780')`, [lite.tenantA]);
      const upload = await post(staff, '/imports/upload', {
        type: 'SALES',
        filename: 'vendas.csv',
        mime_type: 'text/csv',
        content: ['Referencia,Cliente,CPF,Data,Valor,Vencimento', 'IMP-1,Cliente Import,93541134780,2026-11-01,1000,2026-11-20'].join('\n'),
      });
      expect(upload.status).toBe(201);
      const batchId = upload.body.batch.id as string;
      const dry = await post(staff, `/imports/${batchId}/dry-run`, {
        mapping: { external_reference: 'Referencia', customer_name: 'Cliente', customer_cpf: 'CPF', sale_date: 'Data', gross_amount: 'Valor', due_date: 'Vencimento' },
        defaults: { seller_id: sellerId, category_id: category },
      });
      expect(dry.status).toBe(200);
      const confirm = await post(staff, `/imports/${batchId}/confirm`, {});
      expect(confirm.status).toBe(200);
      expect(confirm.body.result).toMatchObject({ imported: 1, skipped: 0 });
      const row = await lite.adminPool.query(`SELECT origin_text, form_snapshot FROM sales WHERE category_id = $1`, [category]);
      expect(row.rows[0].origin_text).toBeNull();
      expect(row.rows[0].form_snapshot).toMatchObject({ categoryId: category });

      // the imported sale is identifiable as "to complete" (derived from the snapshot, no column)
      const incomplete = await call(staff, 'GET', '/sales?incomplete=true');
      const found = (incomplete.body.items as Array<{ category_id: string; missing_required_fields: string[] }>).filter(
        (s) => s.category_id === category,
      );
      expect(found).toHaveLength(1);
      expect(found[0]!.missing_required_fields).toEqual(['origin_text']);
      // a sale made through the form is complete and absent from the filter
      const complete = await post(staff, '/sales', saleBody(category, { origin_text: 'POA' }));
      expect(complete.body.sale.missing_required_fields).toEqual([]);
      const again = await call(staff, 'GET', '/sales?incomplete=true');
      expect((again.body.items as Array<{ id: string }>).some((s) => s.id === complete.body.sale.id)).toBe(false);
    });

    it('cancelling the last active item zeroes the gross (nothing billable survives) and typing it again works', async () => {
      const category = await newCategory();
      const saleId = (await post(staff, '/sales', saleBody(category, { gross_amount: 500 }))).body.sale.id as string;
      const item = await post(staff, `/sales/${saleId}/items`, { description: 'Único', unit_price: 100 });
      const cancelled = await post(staff, `/sale-items/${item.body.item.id}/cancel`);
      expect(cancelled.body.sale.gross_amount).toBe(0);
      expect((await call(staff, 'PATCH', `/sales/${saleId}`, { gross_amount: 250 })).status).toBe(200);
    });

    it('cancelling the last item is refused when the sale costs would exceed the new gross', async () => {
      const category = await newCategory();
      const saleId = (await post(staff, '/sales', saleBody(category, { gross_amount: 500, cost_amount: 50 }))).body.sale.id as string;
      const item = await post(staff, `/sales/${saleId}/items`, { description: 'Único', unit_price: 100 });
      const refused = await post(staff, `/sale-items/${item.body.item.id}/cancel`);
      expect(refused.status).toBe(400);
      const state = await lite.adminPool.query(`SELECT status FROM sale_items WHERE id = $1`, [item.body.item.id]);
      expect(state.rows[0].status).toBe('ACTIVE');
    });

    it('a product with a default supplier hands it to the item when none is sent', async () => {
      const category = await newCategory();
      const saleId = (await post(staff, '/sales', saleBody(category))).body.sale.id as string;
      const product = (await post(staff, '/catalog-products', { name: `Prod fornecedor ${Math.random()}`, default_supplier_id: supplierId })).body.product;
      const item = await post(staff, `/sales/${saleId}/items`, { description: 'Com produto', unit_price: 10, product_id: product.id });
      expect(item.body.item.supplier_id).toBe(supplierId);
    });

    it('with items the PATCH accepts the derived gross (so the cost can be edited) and refuses any other', async () => {
      const category = await newCategory();
      const saleId = (await post(staff, '/sales', saleBody(category))).body.sale.id as string;
      await post(staff, `/sales/${saleId}/items`, { description: 'Item', unit_price: 800 });
      expect((await call(staff, 'PATCH', `/sales/${saleId}`, { gross_amount: 800, cost_amount: 100 })).status).toBe(200);
      const refused = await call(staff, 'PATCH', `/sales/${saleId}`, { gross_amount: 900, cost_amount: 100 });
      expect(refused.status).toBe(422);
      const row = await lite.adminPool.query(`SELECT gross_amount::float AS gross, cost_amount::float AS cost FROM sales WHERE id = $1`, [saleId]);
      expect(row.rows[0]).toEqual({ gross: 800, cost: 100 });
    });

    it('PATCH with only gross_amount keeps the stored cost (no reset to 0)', async () => {
      const category = await newCategory();
      const saleId = (await post(staff, '/sales', saleBody(category, { gross_amount: 800, cost_amount: 100 }))).body.sale.id as string;
      const res = await call(staff, 'PATCH', `/sales/${saleId}`, { gross_amount: 900 });
      expect(res.status).toBe(200);
      const row = await lite.adminPool.query('SELECT gross_amount::float AS gross, cost_amount::float AS cost, margin_amount::float AS margin FROM sales WHERE id = $1', [saleId]);
      expect(row.rows[0]).toEqual({ gross: 900, cost: 100, margin: 800 });
    });

    it('two concurrent cancellations of the same item: one wins, the other gets 409, one audit row', async () => {
      const category = await newCategory();
      const saleId = (await post(staff, '/sales', saleBody(category))).body.sale.id as string;
      await post(staff, `/sales/${saleId}/items`, { description: 'Fica', unit_price: 50 });
      const item = await post(staff, `/sales/${saleId}/items`, { description: 'Cancelar', unit_price: 70 });
      const results = await Promise.all([post(staff, `/sale-items/${item.body.item.id}/cancel`), post(staff, `/sale-items/${item.body.item.id}/cancel`)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const audits = await lite.adminPool.query(`SELECT count(*)::int AS n FROM audit_logs WHERE event_type = 'SALE_ITEM_CANCELLED' AND entity_id = $1`, [item.body.item.id]);
      expect(audits.rows[0].n).toBe(1);
    });

    it('a profile change that only reorders fields is audited too', async () => {
      const category = await newCategory();
      await setForm(category, [{ field_key: 'origin_text', enabled: true, required: false, sort_order: 1 }, { field_key: 'destination_text', enabled: true, required: false, sort_order: 2 }]);
      await setForm(category, [{ field_key: 'origin_text', enabled: true, required: false, sort_order: 2 }, { field_key: 'destination_text', enabled: true, required: false, sort_order: 1 }]);
      const audit = await lite.adminPool.query(
        `SELECT metadata FROM audit_logs WHERE event_type = 'SALE_CATEGORY_FORM_UPDATED' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [category],
      );
      expect(String(audit.rows[0].metadata.changed)).toContain('origin_text:order 1>2');
    });
  });
});
