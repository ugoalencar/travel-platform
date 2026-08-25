// ============================================================
// Creative Engine -- abstract, domain-neutral primitives.
//
// Deliberately generic: nothing here is travel-specific, nothing here is
// persisted, and nothing here decides what a "creative" fundamentally IS in
// this product (single-purpose-per-offer vs. reusable template, etc.) --
// that is a Stream A product decision. See
// docs/offer-growth/IMPLEMENTATION-HANDOFF.md for what was deliberately
// left undecided and why.
//
// These types describe a layout of positioned, typed content blocks and a
// target to render them for -- the smallest abstraction that is useful
// regardless of what Stream A ultimately decides a "creative" is.
// ============================================================

/** The kind of content a block holds. Intentionally minimal -- add cases as
 *  real requirements emerge; do not pre-invent block types no one asked for. */
export type CreativeBlockKind = 'text' | 'image' | 'shape' | 'group';

/** A block's position and size within its layout, in abstract layout units
 *  (not pixels, not any specific canvas library's coordinate system -- the
 *  renderer that eventually consumes this decides the unit). */
export interface CreativeBlockGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Optional rotation in degrees, clockwise. */
  rotationDeg?: number;
  /** Stacking order within the layout; higher paints later (on top). */
  zIndex?: number;
}

/** One positioned unit of content. `content` is intentionally a loose,
 *  kind-tagged bag rather than a rigid per-kind interface -- the actual
 *  shape of text styling, image source, etc. is a rendering-layer decision
 *  not made here. */
export interface CreativeBlock {
  id: string;
  kind: CreativeBlockKind;
  geometry: CreativeBlockGeometry;
  /** Freeform, kind-dependent payload (e.g. text string + style hints, or an
   *  image reference). Left as `unknown` on purpose: this package does not
   *  decide what an image reference looks like (URL string? Asset id? --
   *  no Asset entity exists in this codebase yet, see
   *  docs/offer-growth/CURRENT-INTEGRATION-MAP.md). */
  content?: unknown;
  /** Nested blocks, only meaningful when kind === 'group'. */
  children?: CreativeBlock[];
}

/** A named collection of blocks plus the canvas size they're laid out
 *  against. Not persisted by this package -- whatever consumes this decides
 *  how (or whether) to store it. */
export interface CreativeLayout {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  blocks: CreativeBlock[];
}

/** What a layout is ultimately being rendered for. Deliberately abstract --
 *  no assumption about which social platforms, formats, or dimensions are
 *  real requirements; that's for whoever builds the renderer / connectors
 *  to define concretely. */
export interface RenderTarget {
  id: string;
  /** Human-readable label, e.g. "Instagram Feed Post", "A4 Flyer". Carries
   *  no behavior -- purely descriptive. */
  label: string;
  width: number;
  height: number;
}

/** The result of rendering a layout for a target. This package does not
 *  implement any renderer -- this is only the shape a future renderer
 *  (DOM, server-side image/PDF, etc.) would return. See
 *  docs/offer-growth/CURRENT-INTEGRATION-MAP.md "Rendering discovery". */
export type RenderResult =
  | { status: 'success'; targetId: string; output: unknown }
  | { status: 'error'; targetId: string; message: string };

// ---- Minimal runtime shape guards (no new validation library added; this
// repo has no existing zod/validation-library usage in any package to match
// conventions with -- see docs/offer-growth/CURRENT-INTEGRATION-MAP.md). ----

export function isCreativeBlockGeometry(value: unknown): value is CreativeBlockGeometry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.x === 'number' &&
    typeof v.y === 'number' &&
    typeof v.width === 'number' &&
    typeof v.height === 'number' &&
    (v.rotationDeg === undefined || typeof v.rotationDeg === 'number') &&
    (v.zIndex === undefined || typeof v.zIndex === 'number')
  );
}

const CREATIVE_BLOCK_KINDS: readonly CreativeBlockKind[] = ['text', 'image', 'shape', 'group'];

export function isCreativeBlock(value: unknown): value is CreativeBlock {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (typeof v.kind !== 'string' || !CREATIVE_BLOCK_KINDS.includes(v.kind as CreativeBlockKind)) {
    return false;
  }
  if (!isCreativeBlockGeometry(v.geometry)) return false;
  if (v.children !== undefined) {
    if (!Array.isArray(v.children)) return false;
    if (!v.children.every(isCreativeBlock)) return false;
  }
  return true;
}

export function isCreativeLayout(value: unknown): value is CreativeLayout {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.name === 'string' &&
    typeof v.canvasWidth === 'number' &&
    v.canvasWidth > 0 &&
    typeof v.canvasHeight === 'number' &&
    v.canvasHeight > 0 &&
    Array.isArray(v.blocks) &&
    v.blocks.every(isCreativeBlock)
  );
}

export function isRenderTarget(value: unknown): value is RenderTarget {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.label === 'string' &&
    typeof v.width === 'number' &&
    v.width > 0 &&
    typeof v.height === 'number' &&
    v.height > 0
  );
}
