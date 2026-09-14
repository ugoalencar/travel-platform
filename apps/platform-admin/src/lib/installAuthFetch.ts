import { clearSession, getSessionToken } from './platformSession';

// Every existing platform-admin page calls the browser's global fetch()
// directly with a relative /api/* path (no shared API client exists in
// this app -- see DashboardPage.tsx, SubscribersPage.tsx, etc.). Rather
// than rewrite all nine call sites for the Frontend Auth & Session track,
// this installs a single wrapper, once, at app bootstrap: it attaches the
// real Bearer session token to same-origin /api and /platform-auth
// requests, and clears the session on any 401 so RequirePlatformAuth picks
// it up on the next navigation. No page code changes.
let installed = false;

export function installAuthFetch(): void {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const isRelativeApiCall = url.startsWith('/api') || url.startsWith('/platform-auth');

    if (!isRelativeApiCall) {
      return originalFetch(input, init);
    }

    const token = getSessionToken();
    const headers = new Headers(init?.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : undefined));
    if (token && !headers.has('authorization')) {
      headers.set('authorization', `Bearer ${token}`);
    }

    const response = await originalFetch(input, { ...init, headers });
    if (response.status === 401) {
      clearSession();
    }
    return response;
  };
}
