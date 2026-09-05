### Task 2: Add Deterministic Business Story Seed Data

**Files:**
- Create: `scripts/demo-business-stories.cjs`
- Modify: `scripts/seed-tenant-demo-data.cjs`

**Interfaces:**
- Consumes: an existing local `pg` pool, `agencyId`, primary staff `userId`, and existing tenant data.
- Produces: `seedBusinessStories(pool, { agencyId, userId })`.

- [ ] **Step 1: Create the seed module**

Create `scripts/demo-business-stories.cjs`:

```javascript
const STORY_IDS = {
  marianaCancun: {
    customer: 'd0d50001-0000-4000-8000-000000000001',
    dependent: 'd0d50001-0000-4000-8000-000000000002',
    address: 'd0d50001-0000-4000-8000-000000000003',
    document: 'd0d50001-0000-4000-8000-000000000004',
    wish: 'd0d50001-0000-4000-8000-000000000005',
    capture: 'd0d50001-0000-4000-8000-000000000006',
    offer: 'd0d50001-0000-4000-8000-000000000007',
    proposal: 'd0d50001-0000-4000-8000-000000000008',
    sale: 'd0d50001-0000-4000-8000-000000000009',
    receivable: 'd0d50001-0000-4000-8000-000000000010',
    payment: 'd0d50001-0000-4000-8000-000000000011',
    allocation: 'd0d50001-0000-4000-8000-000000000012',
    trip: 'd0d50001-0000-4000-8000-000000000013',
  },
  disney: {
    proposal: 'd0d50002-0000-4000-8000-000000000001',
    sale: 'd0d50002-0000-4000-8000-000000000002',
    trip: 'd0d50002-0000-4000-8000-000000000003',
  },
  honeymoon: {
    proposal: 'd0d50003-0000-4000-8000-000000000001',
    sale: 'd0d50003-0000-4000-8000-000000000002',
    trip: 'd0d50003-0000-4000-8000-000000000003',
  },
  domestic: {
    proposal: 'd0d50004-0000-4000-8000-000000000001',
    sale: 'd0d50004-0000-4000-8000-000000000002',
    trip: 'd0d50004-0000-4000-8000-000000000003',
  },
  europe: {
    proposal: 'd0d50005-0000-4000-8000-000000000001',
    sale: 'd0d50005-0000-4000-8000-000000000002',
    trip: 'd0d50005-0000-4000-8000-000000000003',
  },
};

async function seedBusinessStories(pool, { agencyId, userId }) {
  await seedMarianaCancun(pool, { agencyId, userId });
  await seedSupportingStory(pool, { agencyId, userId, key: 'disney', customerName: 'Fernando Costa Gomes', destination: 'Orlando / Disney', total: 24800 });
  await seedSupportingStory(pool, { agencyId, userId, key: 'honeymoon', customerName: 'Roberto Fernandes', destination: 'Paris', total: 17800 });
  await seedSupportingStory(pool, { agencyId, userId, key: 'domestic', customerName: 'Carla Mendes', destination: 'Gramado', total: 7200 });
  await seedSupportingStory(pool, { agencyId, userId, key: 'europe', customerName: 'Juliana Santos Ribeiro', destination: 'Portugal', total: 28600 });
}

async function seedMarianaCancun(pool, { agencyId, userId }) {
  const ids = STORY_IDS.marianaCancun;

  await pool.query(
    `INSERT INTO customers (id, agency_id, name, email, phone, cpf, rg, status, created_at, updated_at)
     VALUES ($1, $2, 'Mariana Alves Silva', 'mariana.cancun.demo@example.test', '11987654321', '12345678901', '123456789', 'ACTIVE', now(), now())
     ON CONFLICT (agency_id, email) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone
     RETURNING id`,
    [ids.customer, agencyId],
  );

  await pool.query(
    `INSERT INTO customer_addresses (id, agency_id, customer_id, street, number, district, city, state, cep, country, type, is_primary, created_at, updated_at)
     VALUES ($1, $2, $3, 'Rua das Palmeiras', '100', 'Centro', 'Joinville', 'SC', '89200000', 'Brasil', 'RESIDENTIAL', true, now(), now())
     ON CONFLICT DO NOTHING`,
    [ids.address, agencyId, ids.customer],
  );

  await pool.query(
    `INSERT INTO customer_dependents (id, agency_id, customer_id, name, relationship_type, birth_date, created_at, updated_at)
     VALUES ($1, $2, $3, 'Lucas Alves Silva', 'CHILD', '2015-05-10', now(), now())
     ON CONFLICT DO NOTHING`,
    [ids.dependent, agencyId, ids.customer],
  );

  await pool.query(
    `INSERT INTO customer_documents
       (id, agency_id, customer_id, document_type, document_number, holder_name, issuing_country, issued_date, expiry_date, verification_status, created_at, updated_at)
     VALUES ($1, $2, $3, 'PASSPORT', 'DEMO-CANCUN-001', 'Mariana Alves Silva', 'BR', '2024-01-01', '2034-01-01', 'VERIFIED', now(), now())
     ON CONFLICT DO NOTHING`,
    [ids.document, agencyId, ids.customer],
  );

  await pool.query(
    `INSERT INTO wishes (id, agency_id, customer_id, destination, start_date, end_date, travelers_count, notes, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'Cancun', '2027-05-01', '2027-05-10', 3, 'Familia quer resort all-inclusive com entrada e duas parcelas.', 'ACTIVE', now(), now())
     ON CONFLICT DO NOTHING`,
    [ids.wish, agencyId, ids.customer],
  );

  await pool.query(
    `INSERT INTO external_offer_captures
       (id, agency_id, source_url, source_name, raw_content, normalized_title, normalized_description, found_price, currency, valid_until, status, created_at, updated_at)
     VALUES ($1, $2, 'https://supplier.example/demo-mariana-cancun', 'Supplier Demo', $3, 'Cancun All-Inclusive Familia', 'Hotel, aereo, transfer e seguro para familia', 18000, 'BRL', '2027-01-31', 'APPROVED', now(), now())
     ON CONFLICT DO NOTHING`,
    [ids.capture, agencyId, JSON.stringify({ demoOnly: true, story: 'Mariana / Cancun' })],
  );

  await pool.query(
    `INSERT INTO offers (id, agency_id, name, description, price, valid_from, valid_until, status, created_at, updated_at)
     VALUES ($1, $2, 'Mariana / Cancun - pacote familia', 'Cancun all-inclusive com hotel, aereo, transfer e seguro.', 18000, '2026-09-01', '2027-01-31', 'ACTIVE', now(), now())
     ON CONFLICT DO NOTHING`,
    [ids.offer, agencyId],
  );

  await pool.query(
    `INSERT INTO proposals (id, agency_id, customer_id, offer_id, wish_id, user_id, proposed_price, discount, total, valid_until, notes, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 18000, 0, 18000, '2027-01-31', 'Mariana / Cancun - entrada de 6000 e duas parcelas futuras.', 'ACCEPTED', now(), now())
     ON CONFLICT DO NOTHING`,
    [ids.proposal, agencyId, ids.customer, ids.offer, ids.wish, userId],
  );

  await pool.query(
    `INSERT INTO sales (id, agency_id, customer_id, proposal_id, user_id, amount, discount, total, status, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 18000, 0, 18000, 'CONFIRMED', 'Demo principal: Mariana / Cancun', now(), now())
     ON CONFLICT DO NOTHING`,
    [ids.sale, agencyId, ids.customer, ids.proposal, userId],
  );

  await pool.query(
    `INSERT INTO receivables (id, agency_id, sale_id, customer_id, description, amount, due_at, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'Mariana / Cancun - saldo total da venda', 18000, '2027-03-10', 'PARTIALLY_PAID', now(), now())
     ON CONFLICT (agency_id, sale_id) DO UPDATE SET amount = EXCLUDED.amount, status = EXCLUDED.status, updated_at = now()`,
    [ids.receivable, agencyId, ids.sale, ids.customer],
  );

  await seedInstallmentRevenues(pool, { agencyId, saleId: ids.sale, customerId: ids.customer });
  await seedSupplierPayables(pool, { agencyId, saleId: ids.sale });

  await pool.query(
    `INSERT INTO payments (id, agency_id, direction, amount, occurred_at, method, reference, notes, created_by, created_at)
     VALUES ($1, $2, 'IN', 6000, '2026-09-03', 'PIX', 'DEMO-MARIANA-ENTRADA', 'Entrada Mariana / Cancun', $3, now())
     ON CONFLICT DO NOTHING`,
    [ids.payment, agencyId, userId],
  );

  await pool.query(
    `INSERT INTO payment_allocations (id, agency_id, payment_id, receivable_id, amount, created_at)
     VALUES ($1, $2, $3, $4, 6000, now())
     ON CONFLICT DO NOTHING`,
    [ids.allocation, agencyId, ids.payment, ids.receivable],
  );

  await pool.query(
    `INSERT INTO trips (id, agency_id, customer_id, sale_id, name, destination, start_date, end_date, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'Mariana / Cancun', 'Cancun', '2027-05-01', '2027-05-10', 'CONFIRMED', now(), now())
     ON CONFLICT DO NOTHING`,
    [ids.trip, agencyId, ids.customer, ids.sale],
  );
}

async function seedInstallmentRevenues(pool, { agencyId, saleId, customerId }) {
  const categoryId = await getCategory(pool, agencyId, 'Pacotes de viagem', 'REVENUE');
  const rows = [
    ['Entrada Mariana / Cancun', 6000, '2026-09-03', 'PAID'],
    ['Parcela 2 Mariana / Cancun', 6000, '2026-10-03', 'OPEN'],
    ['Parcela 3 Mariana / Cancun', 6000, '2026-11-03', 'OPEN'],
  ];
  for (const [description, amount, dueDate, status] of rows) {
    await pool.query(
      `INSERT INTO revenues (id, agency_id, sale_id, customer_id, category_id, description, amount, currency, competency_date, due_date, receipt_date, payment_method, status, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, 'BRL', $7, $7, CASE WHEN $8 = 'PAID' THEN $7::date ELSE NULL END, 'PIX', $8, now(), now())
       ON CONFLICT DO NOTHING`,
      [agencyId, saleId, customerId, categoryId, description, amount, dueDate, status],
    );
  }
}

async function seedSupplierPayables(pool, { agencyId, saleId }) {
  const rows = [
    ['Hotel - Grand Palladium Cancun', 7000, '2026-09-20'],
    ['Aereo - Sao Paulo / Cancun', 5000, '2026-09-25'],
    ['Transfer - Aeroporto / Resort', 800, '2026-10-01'],
    ['Seguro viagem familia', 500, '2026-10-05'],
    ['Comissao agencia / vendedor', 700, '2026-10-10'],
  ];
  for (const [description, amount, dueDate] of rows) {
    await pool.query(
      `INSERT INTO payables (id, agency_id, sale_id, description, amount, due_at, status, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'OPEN', now(), now())
       ON CONFLICT DO NOTHING`,
      [agencyId, saleId, description, amount, dueDate],
    );
  }
}

async function seedSupportingStory(pool, { agencyId, userId, key, customerName, destination, total }) {
  const ids = STORY_IDS[key];
  const customer = await pool.query(
    `SELECT id FROM customers WHERE agency_id = $1 AND name = $2 LIMIT 1`,
    [agencyId, customerName],
  );
  const customerId = customer.rows[0]?.id;
  if (!customerId) return;

  const proposal = await pool.query(
    `INSERT INTO proposals (id, agency_id, customer_id, user_id, proposed_price, discount, total, valid_until, notes, status)
     VALUES ($1, $2, $3, $4, $5, 0, $5, '2027-01-31', $6, 'ACCEPTED')
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [ids.proposal, agencyId, customerId, userId, total, `Demo ${key}: ${destination}`],
  );
  const proposalId = proposal.rows[0]?.id ?? ids.proposal;
  const sale = await pool.query(
    `INSERT INTO sales (id, agency_id, customer_id, proposal_id, user_id, amount, discount, total, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, 0, $6, 'CONFIRMED', $7)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [ids.sale, agencyId, customerId, proposalId, userId, total, `Demo ${key}: ${destination}`],
  );
  const saleId = sale.rows[0]?.id ?? ids.sale;
  await pool.query(
    `INSERT INTO trips (id, agency_id, customer_id, sale_id, name, destination, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, $5, $6, '2027-06-01', '2027-06-10', 'CONFIRMED')
     ON CONFLICT DO NOTHING`,
    [ids.trip, agencyId, customerId, saleId, `Demo ${key}: ${destination}`, destination],
  );
}

async function getCategory(pool, agencyId, name, type) {
  const result = await pool.query(
    `INSERT INTO financial_categories (id, agency_id, name, type, description, is_active, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, true, now(), now())
     ON CONFLICT (agency_id, type, name) DO UPDATE SET is_active = true
     RETURNING id`,
    [agencyId, name, type, `${name} demo`],
  );
  return result.rows[0].id;
}

module.exports = { STORY_IDS, seedBusinessStories };
```

- [ ] **Step 2: Wire the module into tenant seed**

At the top of `scripts/seed-tenant-demo-data.cjs`, add:

```javascript
const { seedBusinessStories } = require('./demo-business-stories.cjs');
```

After users are seeded and a primary `userId` is available, call:

```javascript
await seedBusinessStories(pool, { agencyId, userId: users[0].id });
```

- [ ] **Step 3: Run targeted seed stability test**

Run:

```powershell
npm run test -- --run services/api/tests/demo-seed-stability.test.ts
```

Expected initially: fail until Task 3 updates test expectations.


