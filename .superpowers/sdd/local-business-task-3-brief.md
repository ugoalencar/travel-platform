### Task 3: Prove Demo Story Stability

**Files:**
- Modify: `services/api/tests/demo-seed-stability.test.ts`

**Interfaces:**
- Consumes: `STORY_IDS.marianaCancun` from `scripts/demo-business-stories.cjs`.
- Produces: tests that prove the main story is stable and financially connected.

- [ ] **Step 1: Import stable story IDs**

Add:

```typescript
const { STORY_IDS } = require('../../scripts/demo-business-stories.cjs') as {
  STORY_IDS: {
    marianaCancun: {
      customer: string;
      sale: string;
      receivable: string;
      payment: string;
      allocation: string;
      trip: string;
    };
  };
};
```

- [ ] **Step 2: Add the main story test**

Add this test:

```typescript
it('seeds Mariana / Cancun as a deterministic connected financial story', async () => {
  const ids = STORY_IDS.marianaCancun;

  const result = await adminPool.query(
    `SELECT
       c.name AS customer_name,
       s.total::text AS sale_total,
       r.amount::text AS receivable_amount,
       r.status AS receivable_status,
       p.amount::text AS payment_amount,
       pa.amount::text AS allocated_amount,
       t.destination AS trip_destination
     FROM customers c
     JOIN sales s ON s.agency_id = c.agency_id AND s.customer_id = c.id
     JOIN receivables r ON r.agency_id = s.agency_id AND r.sale_id = s.id
     JOIN payments p ON p.agency_id = s.agency_id AND p.id = $4
     JOIN payment_allocations pa ON pa.agency_id = p.agency_id AND pa.payment_id = p.id AND pa.receivable_id = r.id
     JOIN trips t ON t.agency_id = s.agency_id AND t.sale_id = s.id
     WHERE c.id = $1 AND s.id = $2 AND r.id = $3`,
    [ids.customer, ids.sale, ids.receivable, ids.payment],
  );

  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]).toMatchObject({
    customer_name: 'Mariana Alves Silva',
    sale_total: '18000.00',
    receivable_amount: '18000.00',
    receivable_status: 'PARTIALLY_PAID',
    payment_amount: '6000.00',
    allocated_amount: '6000.00',
    trip_destination: 'Cancun',
  });
});
```

- [ ] **Step 3: Add installment proof**

Add:

```typescript
it('seeds Mariana / Cancun installment schedule through revenues', async () => {
  const rows = await adminPool.query(
    `SELECT description, amount::text, status
     FROM revenues
     WHERE sale_id = $1
     ORDER BY due_date ASC`,
    [STORY_IDS.marianaCancun.sale],
  );

  expect(rows.rows.map((row) => row.amount)).toEqual(['6000.00', '6000.00', '6000.00']);
  expect(rows.rows.map((row) => row.status)).toEqual(['PAID', 'OPEN', 'OPEN']);
});
```

- [ ] **Step 4: Run test**

Run:

```powershell
npm run test -- --run services/api/tests/demo-seed-stability.test.ts
```

Expected: pass.


