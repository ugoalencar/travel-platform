import { describe, it, expect } from 'vitest';
import {
  isCreativeBlock,
  isCreativeBlockGeometry,
  isCreativeLayout,
  isRenderTarget,
  type CreativeBlock,
  type CreativeLayout,
} from './types';

describe('isCreativeBlockGeometry', () => {
  it('accepts a minimal valid geometry', () => {
    expect(isCreativeBlockGeometry({ x: 0, y: 0, width: 10, height: 10 })).toBe(true);
  });

  it('accepts optional rotationDeg and zIndex', () => {
    expect(
      isCreativeBlockGeometry({ x: 0, y: 0, width: 10, height: 10, rotationDeg: 45, zIndex: 2 }),
    ).toBe(true);
  });

  it('rejects missing required fields', () => {
    expect(isCreativeBlockGeometry({ x: 0, y: 0, width: 10 })).toBe(false);
  });

  it('rejects wrong-typed optional fields', () => {
    expect(isCreativeBlockGeometry({ x: 0, y: 0, width: 10, height: 10, rotationDeg: '45' })).toBe(
      false,
    );
  });

  it('rejects non-objects', () => {
    expect(isCreativeBlockGeometry(null)).toBe(false);
    expect(isCreativeBlockGeometry('nope')).toBe(false);
  });
});

describe('isCreativeBlock', () => {
  const geometry = { x: 0, y: 0, width: 10, height: 10 };

  it('accepts a minimal text block', () => {
    const block: CreativeBlock = { id: 'b1', kind: 'text', geometry };
    expect(isCreativeBlock(block)).toBe(true);
  });

  it('accepts every declared block kind', () => {
    for (const kind of ['text', 'image', 'shape', 'group'] as const) {
      expect(isCreativeBlock({ id: 'b1', kind, geometry })).toBe(true);
    }
  });

  it('rejects an unknown kind', () => {
    expect(isCreativeBlock({ id: 'b1', kind: 'video', geometry })).toBe(false);
  });

  it('rejects an empty id', () => {
    expect(isCreativeBlock({ id: '', kind: 'text', geometry })).toBe(false);
  });

  it('accepts nested children recursively', () => {
    const nested: CreativeBlock = {
      id: 'group1',
      kind: 'group',
      geometry,
      children: [{ id: 'child1', kind: 'text', geometry }],
    };
    expect(isCreativeBlock(nested)).toBe(true);
  });

  it('rejects a group with an invalid child', () => {
    const nested = {
      id: 'group1',
      kind: 'group',
      geometry,
      children: [{ id: 'child1', kind: 'text' }], // missing geometry
    };
    expect(isCreativeBlock(nested)).toBe(false);
  });
});

describe('isCreativeLayout', () => {
  it('accepts an empty-blocks layout', () => {
    const layout: CreativeLayout = {
      id: 'l1',
      name: 'Empty layout',
      canvasWidth: 1080,
      canvasHeight: 1080,
      blocks: [],
    };
    expect(isCreativeLayout(layout)).toBe(true);
  });

  it('accepts a layout with valid blocks', () => {
    const layout: CreativeLayout = {
      id: 'l1',
      name: 'One block',
      canvasWidth: 1080,
      canvasHeight: 1080,
      blocks: [{ id: 'b1', kind: 'text', geometry: { x: 0, y: 0, width: 10, height: 10 } }],
    };
    expect(isCreativeLayout(layout)).toBe(true);
  });

  it('rejects zero or negative canvas dimensions', () => {
    expect(
      isCreativeLayout({ id: 'l1', name: 'Bad', canvasWidth: 0, canvasHeight: 100, blocks: [] }),
    ).toBe(false);
  });

  it('rejects a layout containing an invalid block', () => {
    expect(
      isCreativeLayout({
        id: 'l1',
        name: 'Bad block',
        canvasWidth: 100,
        canvasHeight: 100,
        blocks: [{ id: 'b1', kind: 'not-a-kind', geometry: { x: 0, y: 0, width: 1, height: 1 } }],
      }),
    ).toBe(false);
  });
});

describe('isRenderTarget', () => {
  it('accepts a valid target', () => {
    expect(isRenderTarget({ id: 't1', label: 'Instagram Feed Post', width: 1080, height: 1080 })).toBe(
      true,
    );
  });

  it('rejects zero-size targets', () => {
    expect(isRenderTarget({ id: 't1', label: 'Bad', width: 0, height: 100 })).toBe(false);
  });

  it('rejects a missing label', () => {
    expect(isRenderTarget({ id: 't1', width: 100, height: 100 })).toBe(false);
  });
});
