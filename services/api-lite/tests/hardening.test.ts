import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

interface PageJson<T> {
  items: T[];
  total: number;
}

interface SellerReportItem {
  seller_id: string;
  seller_name: string;
  sales_count: number;
  gross_amount: number;
  cost_amount: number;
  margin_amount: number;
  received_amount: number;
  pending_amount: number;
  commission_amount: number;
  commission_paid_amount: number;
  commission_pending_amount: number;
}

interface SalesReportJson {
  items: Array<{ sale_id: string; seller_id: string; status: string }>;
  totals: {
    count: number;
    gross_amount: number;
    cost_amount: number;
    margin_amount: number;
    received_amount: number;
    pending_amount: number;
    commission_amount: number;
    commission_paid_amount: number;
    commission_pending_amount: number;
  };
}

interface PaymentItem {
  id: string;
  direction: string;
  amount: number;
  reversal_of_payment_id: string | null;
  reversal_reason: string | null;
  reversed_by_payment_id: string | null;
}

const EFFECTIVE = 'CONFIRMED,PARTIALLY_PAID,PAID';

describe('Travel Lite pre-homologation hardening', () => {
  let lite: LiteFixture;
  let staffToken: string;
  let sellerToken: string;
  let managerToken: string;
  let foreignManagerToken: string;
  let accountId: string;
  let categoryId: string;
  let customerId: string;
  let sellerOneId: string;
  let sellerTwoId: string;
  let saleOneId: string;
  let commissionPayableId: string;
  let commissionId: string;

  async function post(token: string, url: string, payload?: Record<string, unknown>) {
    return lite.app.inject({ method: 'POST', url, headers: lite.headers(token), payload: payload ?? {} });
  }

  async function get<T>(token: string, url: string): Promise<T> {
    const response = await lite.app.inject({ method: 'GET', url, headers: lite.headers(token) });
    expect(response.statusCode).toBe(200);
    return response.json<T>();
  }

  async function createConfirmedSale(sellerId: string, gross: number, cost: number, installments: number) {
    const created = await post(staffToken, '/sales', {
      customer_id: customerId,
      seller_id: sellerId,
      category_id: categoryId,
      gross_amount: gross,
      cost_amount: cost,
      sale_date: '2026-09-10',
      due_date: '2026-10-10',
      installment_count: installments,
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ sale: { id: string } }>().sale.id;
    expect((await post(staffToken, `/sales/${id}/confirm`)).statusCode).toBe(200);
    return id;
  }

  async function saleDetail(id: string) {
    return get<{
      sale: { status: string };
      receivables: Array<{ id: string; paid_amount: number; status: string }>;
      commission: { id: string; status: string; commission_amount: number | null } | null;
    }>(staffToken, `/sales/${id}`);
  }

  async function accountBalance(): Promise<number> {
    const accounts = await get<{ items: Array<{ id: string; balance: number }> }>(
      staffToken,
      '/financial-accounts',
    );
    return accounts.items.find((a) => a.id === accountId)!.balance;
  }

  beforeAll(async () => {
    lite = await createLiteFixture();
    staffToken = await lite.login('tenant-a', 'staff@a.test');
    sellerToken = await lite.login('tenant-a', 'seller1@a.test');
    managerToken = await lite.login('tenant-a', 'admin@a.test');
    foreignManagerToken = await lite.login('tenant-b', 'admin@b.test');

    const account = await post(staffToken, '/financial-accounts', {
      name: 'Banco Hardening',
      type: 'BANK',
      initial_balance: 1000,
    });
    accountId = account.json<{ account: { id: string } }>().account.id;

    const category = await post(staffToken, '/categories', { name: 'AÉREO' });
    categoryId = category.json<{ category: { id: string } }>().category.id;

    const customer = await post(staffToken, '/customers', { name: 'Cliente Hardening' });
    customerId = customer.json<{ customer: { id: string } }>().customer.id;

    const sellerOne = await post(staffToken, '/sellers', {
      name: 'Vendedora Um',
      commission_rule_type: 'PERCENTAGE_ON_GROSS',
      commission_rate: 10,
    });
    sellerOneId = sellerOne.json<{ seller: { id: string } }>().seller.id;
    const sellerTwo = await post(staffToken, '/sellers', {
      name: 'Vendedora Dois',
      commission_rule_type: 'FIXED',
      commission_fixed_amount: 50,
    });
    sellerTwoId = sellerTwo.json<{ seller: { id: string } }>().seller.id;

    // Seller one: 1000/700 in 2 installments (commission 100) + 300/250
    // (commission 30, approved and paid). Seller two: 800/500 (fixed 50).
    saleOneId = await createConfirmedSale(sellerOneId, 1000, 700, 2);
    const saleTwoId = await createConfirmedSale(sellerOneId, 300, 250, 1);
    await createConfirmedSale(sellerTwoId, 800, 500, 1);

    // A draft never counts as sold.
    await post(staffToken, '/sales', {
      customer_id: customerId,
      seller_id: sellerOneId,
      category_id: categoryId,
      gross_amount: 9999,
      sale_date: '2026-09-10',
      due_date: '2026-10-10',
    });

    const firstInstallment = (await saleDetail(saleOneId)).receivables[0]!;
    const receive = await post(staffToken, `/receivables/${firstInstallment.id}/receive`, {
      account_id: accountId,
      amount: 500,
    });
    expect(receive.statusCode).toBe(200);

    commissionId = (await saleDetail(saleTwoId)).commission!.id;
    const approve = await post(managerToken, `/commissions/${commissionId}/approve`, {
      due_at: '2026-10-30',
    });
    expect(approve.statusCode).toBe(200);
    const payables = await get<PageJson<{ id: string; commission_id: string | null }>>(
      staffToken,
      '/payables?status=OPEN',
    );
    commissionPayableId = payables.items.find((p) => p.commission_id === commissionId)!.id;
  });

  afterAll(async () => {
    await lite?.close();
  });

  it('persists every customer field on create and lets an edit clear them', async () => {
    const full = {
      name: 'Maria Completa',
      cpf: '529.982.247-25',
      birth_date: '1985-03-22',
      phone: '(47) 3333-4444',
      whatsapp: '(47) 99999-8888',
      email: 'maria@cliente.test',
      zip_code: '89201-000',
      street: 'Rua das Palmeiras',
      number: '123',
      complement: 'Sala 4',
      neighborhood: 'Centro',
      city: 'Joinville',
      state: 'SC',
      notes: 'Prefere contato pelo WhatsApp.',
    };
    const created = await post(staffToken, '/customers', full);
    expect(created.statusCode).toBe(201);
    const id = created.json<{ customer: { id: string } }>().customer.id;

    const stored = await get<{ customer: Record<string, unknown> }>(staffToken, `/customers/${id}`);
    expect(stored.customer).toMatchObject({ ...full, cpf: '52998224725', status: 'ACTIVE' });

    const cleared = await lite.app.inject({
      method: 'PATCH',
      url: `/customers/${id}`,
      headers: lite.headers(staffToken),
      payload: { complement: null, notes: null, birth_date: null, status: 'INACTIVE' },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json<{ customer: Record<string, unknown> }>().customer).toMatchObject({
      complement: null,
      notes: null,
      birth_date: null,
      status: 'INACTIVE',
      city: 'Joinville',
    });
  });

  it('blocks SELLER from paying a commission payable and lets ADMIN pay it', async () => {
    const operatorPay = await post(sellerToken, `/payables/${commissionPayableId}/pay`, {
      account_id: accountId,
    });
    expect(operatorPay.statusCode).toBe(403);
    const stillApproved = await get<PageJson<{ id: string; status: string }>>(
      staffToken,
      '/commissions?status=APPROVED',
    );
    expect(stillApproved.items.some((c) => c.id === commissionId)).toBe(true);

    const managerPay = await post(managerToken, `/payables/${commissionPayableId}/pay`, {
      account_id: accountId,
    });
    expect(managerPay.statusCode).toBe(200);
    const paid = await get<PageJson<{ id: string }>>(staffToken, '/commissions?status=PAID');
    expect(paid.items.some((c) => c.id === commissionId)).toBe(true);
  });

  it('blocks SELLER from paying an ordinary payable', async () => {
    const created = await post(staffToken, '/payables', {
      description: 'Aluguel',
      amount: 120,
      due_at: '2026-10-05',
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ payable: { id: string } }>().payable.id;
    const pay = await post(sellerToken, `/payables/${id}/pay`, { account_id: accountId });
    expect(pay.statusCode).toBe(403);
  });

  it('totals the seller report per seller and the drill-down matches each total', async () => {
    const report = await get<{ items: SellerReportItem[]; totals: SalesReportJson['totals'] & { sales_count: number } }>(
      staffToken,
      '/reports/sellers?from=2026-09-01&to=2026-09-30',
    );
    const one = report.items.find((i) => i.seller_id === sellerOneId)!;
    const two = report.items.find((i) => i.seller_id === sellerTwoId)!;

    expect(one).toMatchObject({
      sales_count: 2,
      gross_amount: 1300,
      cost_amount: 950,
      margin_amount: 350,
      received_amount: 500,
      pending_amount: 800,
      commission_amount: 130,
      commission_paid_amount: 30,
      commission_pending_amount: 100,
    });
    expect(two).toMatchObject({
      sales_count: 1,
      gross_amount: 800,
      margin_amount: 300,
      received_amount: 0,
      pending_amount: 800,
      commission_amount: 50,
      commission_paid_amount: 0,
      commission_pending_amount: 50,
    });
    expect(report.totals.sales_count).toBe(3);
    expect(report.totals.gross_amount).toBe(2100);

    for (const item of [one, two]) {
      const drill = await get<SalesReportJson>(
        staffToken,
        `/reports/sales?from=2026-09-01&to=2026-09-30&seller_id=${item.seller_id}&status=${EFFECTIVE}`,
      );
      expect(drill.items.every((row) => row.seller_id === item.seller_id)).toBe(true);
      expect(drill.totals).toEqual({
        count: item.sales_count,
        gross_amount: item.gross_amount,
        cost_amount: item.cost_amount,
        margin_amount: item.margin_amount,
        received_amount: item.received_amount,
        pending_amount: item.pending_amount,
        commission_amount: item.commission_amount,
        commission_paid_amount: item.commission_paid_amount,
        commission_pending_amount: item.commission_pending_amount,
      });
    }

    const filtered = await get<{ items: SellerReportItem[] }>(
      staffToken,
      `/reports/sellers?seller_id=${sellerTwoId}&category_id=${categoryId}&status=PAID`,
    );
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]!.sales_count).toBe(0);

    const badStatus = await lite.app.inject({
      method: 'GET',
      url: '/reports/sellers?status=CONFIRMED,BOGUS',
      headers: lite.headers(staffToken),
    });
    expect(badStatus.statusCode).toBe(400);
  });

  it('reverses a receipt: inverse movement, receivable and sale reopen, balance restored', async () => {
    const balanceBefore = await accountBalance();
    const payments = await get<PageJson<PaymentItem>>(staffToken, '/payments?direction=IN');
    const receipt = payments.items.find((p) => p.amount === 500 && !p.reversal_of_payment_id)!;

    const operatorReverse = await post(sellerToken, `/payments/${receipt.id}/reverse`, {
      reason: 'Recebimento lançado em duplicidade',
    });
    expect(operatorReverse.statusCode).toBe(403);

    const noReason = await post(managerToken, `/payments/${receipt.id}/reverse`, {});
    expect(noReason.statusCode).toBe(400);

    const reverse = await post(managerToken, `/payments/${receipt.id}/reverse`, {
      reason: 'Recebimento lançado em duplicidade',
    });
    expect(reverse.statusCode).toBe(201);
    const reversalId = reverse.json<{ reversal: { id: string } }>().reversal.id;

    const detail = await saleDetail(saleOneId);
    expect(detail.receivables[0]).toMatchObject({ paid_amount: 0, status: 'OPEN' });
    expect(detail.sale.status).toBe('CONFIRMED');
    expect(await accountBalance()).toBe(balanceBefore - 500);

    const after = await get<PageJson<PaymentItem>>(staffToken, '/payments');
    const original = after.items.find((p) => p.id === receipt.id)!;
    const mirror = after.items.find((p) => p.id === reversalId)!;
    expect(original.amount).toBe(500);
    expect(original.direction).toBe('IN');
    expect(original.reversed_by_payment_id).toBe(reversalId);
    expect(mirror).toMatchObject({
      direction: 'OUT',
      amount: 500,
      reversal_of_payment_id: receipt.id,
      reversal_reason: 'Recebimento lançado em duplicidade',
    });

    const ledger = await lite.adminPool.query<{
      type: string;
      amount: string;
      reversal_of_transaction_id: string | null;
      original_payment_id: string | null;
    }>(
      `SELECT t.type, t.amount, t.reversal_of_transaction_id, o.payment_id AS original_payment_id
         FROM financial_transactions t
         LEFT JOIN financial_transactions o ON o.id = t.reversal_of_transaction_id
        WHERE t.payment_id = $1`,
      [reversalId],
    );
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]).toMatchObject({ type: 'OUT', amount: '500.00', original_payment_id: receipt.id });

    const audit = await lite.adminPool.query<{ user_id: string; metadata: Record<string, unknown> }>(
      `SELECT user_id, metadata FROM audit_logs WHERE event_type = 'PAYMENT_REVERSED' AND entity_id = $1`,
      [receipt.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]!.user_id).toBe(lite.adminA);
    expect(audit.rows[0]!.metadata).toMatchObject({
      reversal_payment_id: reversalId,
      reason: 'Recebimento lançado em duplicidade',
    });

    const outbox = await lite.adminPool.query(
      `SELECT 1 FROM integration_outbox WHERE event_type = 'PAYMENT_REVERSED' AND entity_id = $1`,
      [receipt.id],
    );
    expect(outbox.rowCount).toBe(1);

    const again = await post(managerToken, `/payments/${receipt.id}/reverse`, { reason: 'De novo' });
    expect(again.statusCode).toBe(409);
    const reverseTheReversal = await post(managerToken, `/payments/${reversalId}/reverse`, {
      reason: 'Estorno do estorno',
    });
    expect(reverseTheReversal.statusCode).toBe(409);

    // The installment can be received again after the reversal.
    const receiveAgain = await post(staffToken, `/receivables/${detail.receivables[0]!.id}/receive`, {
      account_id: accountId,
      amount: 500,
    });
    expect(receiveAgain.statusCode).toBe(200);
  });

  it('reverses a commission payment: payable reopens and the commission returns to APPROVED', async () => {
    const balanceBefore = await accountBalance();
    const payments = await get<PageJson<PaymentItem>>(staffToken, '/payments?direction=OUT');
    const commissionPayment = payments.items.find((p) => p.amount === 30 && !p.reversal_of_payment_id)!;

    const reverse = await post(managerToken, `/payments/${commissionPayment.id}/reverse`, {
      reason: 'Pago na conta errada',
      reversed_at: '2026-10-02',
    });
    expect(reverse.statusCode).toBe(201);

    const payable = await get<PageJson<{ id: string; paid_amount: number; status: string }>>(
      staffToken,
      '/payables?status=OPEN',
    );
    expect(payable.items.find((p) => p.id === commissionPayableId)).toMatchObject({
      paid_amount: 0,
      status: 'OPEN',
    });
    const approved = await get<PageJson<{ id: string; paid_at: string | null }>>(
      staffToken,
      '/commissions?status=APPROVED',
    );
    expect(approved.items.find((c) => c.id === commissionId)?.paid_at).toBeNull();
    expect(await accountBalance()).toBe(balanceBefore + 30);

    const second = await post(managerToken, `/payments/${commissionPayment.id}/reverse`, {
      reason: 'Segunda tentativa',
    });
    expect(second.statusCode).toBe(409);

    const repay = await post(managerToken, `/payables/${commissionPayableId}/pay`, { account_id: accountId });
    expect(repay.statusCode).toBe(200);
  });

  it('keeps reversals and the seller report tenant-isolated', async () => {
    const payments = await get<PageJson<PaymentItem>>(staffToken, '/payments?direction=IN');
    const target = payments.items.find((p) => !p.reversal_of_payment_id && !p.reversed_by_payment_id)!;

    const foreignReverse = await post(foreignManagerToken, `/payments/${target.id}/reverse`, {
      reason: 'Tentativa de outro tenant',
    });
    expect(foreignReverse.statusCode).toBe(404);
    const untouched = await get<PageJson<PaymentItem>>(staffToken, '/payments?direction=IN');
    expect(untouched.items.find((p) => p.id === target.id)?.reversed_by_payment_id).toBeNull();

    const foreignReport = await get<{ items: SellerReportItem[] }>(foreignManagerToken, '/reports/sellers');
    expect(foreignReport.items.some((i) => i.seller_id === sellerOneId)).toBe(false);
    const foreignDrill = await get<SalesReportJson>(
      foreignManagerToken,
      `/reports/sales?seller_id=${sellerOneId}`,
    );
    expect(foreignDrill.items).toHaveLength(0);

    const malformed = await post(managerToken, '/payments/not-a-uuid/reverse', { reason: 'xxx' });
    expect(malformed.statusCode).toBe(400);
  });
});
