import { describe, expect, it } from 'vitest';
import { TravelProductCategory } from '../../../packages/domain/types';
import { ValidationError } from '../src/errors';
import { parseCreateTravelProductInput, parseUpdateTravelProductInput } from '../src/travel-product-input-parsing';

describe('travel product categoryId parsing', () => {
  const categoryId = '10000000-0000-4000-8000-000000000001';
  const create = (fields: Record<string, unknown>) =>
    parseCreateTravelProductInput({ category: TravelProductCategory.OTHER, title: 'Produto', ...fields });

  for (const [name, parse] of [['create', create], ['update', parseUpdateTravelProductInput]] as const) {
    describe(name, () => {
      it('preserves null to clear the category link', () => {
        expect(parse({ categoryId: null }).categoryId).toBeNull();
      });

      it('accepts a UUID', () => {
        expect(parse({ categoryId }).categoryId).toBe(categoryId);
      });

      it.each(['invalid', '', 42, false, {}, []].map((value) => ({ value })))(
        'rejects invalid categoryId $value',
        ({ value }) => {
          expect(() => parse({ categoryId: value })).toThrow(ValidationError);
        },
      );
    });
  }

  it('keeps an omitted categoryId absent on update', () => {
    expect(parseUpdateTravelProductInput({ title: 'Novo titulo' })).not.toHaveProperty('categoryId');
  });
});
