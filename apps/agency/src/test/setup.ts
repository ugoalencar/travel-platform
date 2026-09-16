import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { setSession } from '../lib/session';

// RequireAuth (feat(auth): real session-based login, adbce98) gates every
// staff route behind hasSession() -- added after this suite was written, so
// no test file ever seeded a session and every renderRouted()-based test
// started redirecting to /login instead of rendering the page under test.
// Seeding a session here, once, for every test fixes that for the whole
// suite without touching each test file; a test that specifically wants the
// logged-out state can still call clearSession() itself.
//
// That alone isn't enough: AppShell has its own second gate on
// useCurrentUser(), which does a raw, unmocked `fetch('/api/me')` (it
// doesn't go through lib/api.ts, so vi.mock('../lib/api') in individual
// test files never covers it). In jsdom that fetch has nothing to talk to,
// rejects, and AppShell treats that exactly like "not logged in" and
// navigates back to /login -- so every authenticated-shell test needs a
// working stub for this one endpoint too.
const originalFetch = globalThis.fetch;

beforeEach(() => {
  setSession('test-session-token', new Date(Date.now() + 60 * 60 * 1000).toISOString());

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/me')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ userId: 'test-user-001', agencyId: 'agency-demo-001', role: 'ADMIN' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      // AppShell's onboarding-redirect check (ADMIN/OWNER only) reads this
      // to decide whether to bounce into /onboarding -- always answer
      // "already onboarded" here so page tests land on the page under test,
      // not the onboarding wizard.
      if (url.includes('/api/settings/agency')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ profile: { onboardingCompletedAt: '2024-01-01T00:00:00.000Z' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return originalFetch ? originalFetch(input, init) : Promise.reject(new Error(`Unmocked fetch: ${url}`));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
