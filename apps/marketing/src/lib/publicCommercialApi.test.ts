import { describe, expect, it } from 'vitest';
import { isSafeHref } from './publicCommercialApi';

// Defense-in-depth client-side check before rendering any dynamic href
// from the public Landing CMS API (hero CTAs, banner CTAs, partner
// website links) -- the backend already validates at write time
// (assertSafeExternalUrl in platform-commercial.ts), but this renderer
// never trusts a stored value blindly.
describe('isSafeHref', () => {
  it('accepts a real absolute https URL', () => {
    expect(isSafeHref('https://parceiro.example.com')).toBe(true);
  });

  it('accepts a real absolute http URL', () => {
    expect(isSafeHref('http://parceiro.example.com')).toBe(true);
  });

  it('accepts a site-internal path', () => {
    expect(isSafeHref('/demo')).toBe(true);
  });

  it('rejects a protocol-relative URL (open-redirect shape)', () => {
    expect(isSafeHref('//evil.example.com/steal')).toBe(false);
  });

  it('rejects a javascript: URL', () => {
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
  });

  it('rejects a data: URL', () => {
    expect(isSafeHref('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects null/undefined/empty', () => {
    expect(isSafeHref(null)).toBe(false);
    expect(isSafeHref(undefined)).toBe(false);
    expect(isSafeHref('')).toBe(false);
  });

  it('rejects garbage that is not a valid URL or internal path', () => {
    expect(isSafeHref('not a url at all')).toBe(false);
  });
});
