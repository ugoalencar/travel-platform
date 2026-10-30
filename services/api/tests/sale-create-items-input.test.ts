import { describe, expect, it } from 'vitest';
import { parseCreateSaleInput } from '../src/commercial-input-parsing';

describe('parseCreateSaleInput with atomic line items', () => {
  it('accepts multiple validated item payloads and preserves the legacy sale fields', () => {
    const parsed = parseCreateSaleInput({
      customerId: 'customer-1',
      amount: 1_250,
      discount: 50,
      notes: 'Venda com aéreo e hotel',
      items: [
        { description: 'Aéreo', supplierId: 'supplier-1', qty: 1, unitPrice: 1_000, taxes: 100 },
        { description: 'Hotel', supplierId: 'supplier-2', qty: 2, unitPrice: 75 },
      ],
    });

    expect(parsed.items).toEqual([
      { saleId: '', description: 'Aéreo', supplierId: 'supplier-1', qty: 1, unitPrice: 1_000, taxes: 100 },
      { saleId: '', description: 'Hotel', supplierId: 'supplier-2', qty: 2, unitPrice: 75 },
    ]);
    expect(parsed).toMatchObject({ customerId: 'customer-1', amount: 1_250, discount: 50 });
  });

  it('rejects an empty item list and invalid item fields before creating a sale', () => {
    expect(() => parseCreateSaleInput({ customerId: 'customer-1', amount: 0, items: [] })).toThrow(/at least one/i);
    expect(() => parseCreateSaleInput({
      customerId: 'customer-1',
      amount: 100,
      items: [{ description: 'Aéreo', unitPrice: 100, agencyId: 'spoofed' }],
    })).toThrow(/not allowed|unknown/i);
  });
});
