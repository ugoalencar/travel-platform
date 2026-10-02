export const TRAVEL_LITE_VERSION = '0.1.0';
export const TRAVEL_LITE_RELEASE = 'Inicial';
export const TRAVEL_LITE_RELEASE_DATE = '2026-10-02';

export function buildVersionInfo() {
  return {
    service: 'api-lite',
    product: 'Travel Lite',
    version: TRAVEL_LITE_VERSION,
    release: TRAVEL_LITE_RELEASE,
    releaseDate: TRAVEL_LITE_RELEASE_DATE,
  };
}
