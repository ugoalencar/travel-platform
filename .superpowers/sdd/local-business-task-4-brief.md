### Task 4: Add Sale Financial Story API

**Files:**
- Modify: `services/api/src/financial.ts`
- Modify: `services/api/src/app.ts`
- Modify: `services/api/tests/financial-http.test.ts`

**Interfaces:**
- Produces: `getSaleFinancialStory(database: DatabaseRuntime, saleId: string): Promise<SaleFinancialStory>`.
- API: `GET /financial/sales/:id/story`.

- [ ] **Step 1: Add type in `financial.ts`**

```typescript
export interface SaleFinancialStory {
  saleId: string;
  customerName: string;
  tripName: string | null;
  grossSale: number;
  received: number;
  remainingReceivable: number;
  supplierPayables: Array<{ description: string; amount: number; dueAt: Date; status: FinancialObligationStatus }>;
  totalSupplierPayable: number;
  installmentSchedule: Array<{ description: string; amount: number; dueDate: Date; status: RevenueStatus }>;
  margin: {
    grossSale: number;
    supplierCosts: number;
    commissionAndFees: number;
    grossMargin: number;
    netMargin: number;
  };
}
```

- [ ] **Step 2: Add implementation**

```typescript
export async function getSaleFinancialStory(
  database: DatabaseRuntime,
  saleId: string,
): Promise<SaleFinancialStory> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const saleResult = await client.query<{
      sale_id: string;
      customer_name: string;
      trip_name: string | null;
      total: string;
    }>(
      `SELECT s.id AS sale_id, c.name AS customer_name, t.name AS trip_name, s.total::text AS total
       FROM sales s
       JOIN customers c ON c.agency_id = s.agency_id AND c.id = s.customer_id
       LEFT JOIN trips t ON t.agency_id = s.agency_id AND t.sale_id = s.id
       WHERE s.agency_id = $1 AND s.id = $2`,
      [agencyId, saleId],
    );
    const sale = saleResult.rows[0];
    if (!sale) throw new NotFoundError('Sale not found');

    const payablesResult = await client.query<{
      description: string;
      amount: string;
      due_at: string;
      status: FinancialObligationStatus;
    }>(
      `SELECT description, amount::text, due_at, status
       FROM payables
       WHERE agency_id = $1 AND sale_id = $2
       ORDER BY due_at ASC`,
      [agencyId, saleId],
    );

    const installmentsResult = await client.query<{
      description: string;
      amount: string;
      due_date: string;
      status: RevenueStatus;
    }>(
      `SELECT description, amount::text, due_date, status
       FROM revenues
       WHERE agency_id = $1 AND sale_id = $2
       ORDER BY due_date ASC`,
      [agencyId, saleId],
    );

    const receivedResult = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(pa.amount), 0)::text AS total
       FROM payment_allocations pa
       JOIN receivables r ON r.agency_id = pa.agency_id AND r.id = pa.receivable_id
       WHERE pa.agency_id = $1 AND r.sale_id = $2`,
      [agencyId, saleId],
    );

    const grossSale = roundMoney(Number(sale.total));
    const received = roundMoney(Number(receivedResult.rows[0]?.total ?? 0));
    const supplierPayables = payablesResult.rows.map((row) => ({
      description: row.description,
      amount: roundMoney(Number(row.amount)),
      dueAt: new Date(row.due_at),
      status: row.status,
    }));
    const totalSupplierPayable = roundMoney(
      supplierPayables.reduce((sum, payable) => sum + payable.amount, 0),
    );
    const commissionAndFees = roundMoney(
      supplierPayables
        .filter((payable) => /comissao|comissão|taxa|fee/i.test(payable.description))
        .reduce((sum, payable) => sum + payable.amount, 0),
    );
    const supplierCosts = roundMoney(totalSupplierPayable - commissionAndFees);

    return {
      saleId,
      customerName: sale.customer_name,
      tripName: sale.trip_name,
      grossSale,
      received,
      remainingReceivable: roundMoney(grossSale - received),
      supplierPayables,
      totalSupplierPayable,
      installmentSchedule: installmentsResult.rows.map((row) => ({
        description: row.description,
        amount: roundMoney(Number(row.amount)),
        dueDate: new Date(row.due_date),
        status: row.status,
      })),
      margin: {
        grossSale,
        supplierCosts,
        commissionAndFees,
        grossMargin: roundMoney(grossSale - supplierCosts),
        netMargin: roundMoney(grossSale - supplierCosts - commissionAndFees),
      },
    };
  });
}
```

- [ ] **Step 3: Register route in `app.ts`**

Import `getSaleFinancialStory`, then add near the existing financial sale margin route:

```typescript
app.get<{ Params: { id: string } }>(
  '/financial/sales/:id/story',
  { preHandler: protectedHooks },
  async (request) => {
    const story = await getSaleFinancialStory(options.database, request.params.id);
    return { story };
  },
);
```

- [ ] **Step 4: Add HTTP test**

In `services/api/tests/financial-http.test.ts`, add an ADMIN/MANAGER read test that creates a sale, receivable, payment allocation, revenues, and payables, then asserts:

```typescript
expect(response.statusCode).toBe(200);
expect(response.json().story).toMatchObject({
  grossSale: 18000,
  received: 6000,
  remainingReceivable: 12000,
  totalSupplierPayable: 14000,
});
```

- [ ] **Step 5: Run targeted tests**

```powershell
npm run test -- --run services/api/tests/financial-http.test.ts services/api/tests/financial.test.ts
```

Expected: pass.

---

