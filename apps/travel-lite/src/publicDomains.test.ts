import { describe, expect, it } from 'vitest';
import { slugFromHostname } from './branding';
describe('Travel Lite public domains', () => {
  it('routes the presentation domain to the existing demo tenant', () => {
    expect(slugFromHostname('travellite.travelplataforma.com.br')).toBe('demo');
  });
  it('preserves the customer domain and local development behavior', () => {
    expect(slugFromHostname('gadotti.travelplataforma.com.br')).toBe('gadotti');
    expect(slugFromHostname('localhost')).toBe('');
  });
});
