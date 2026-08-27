// SEC-E: CORS + security-header configuration, sourced from validated
// environment variables. Additive hardening only -- does not touch
// auth/tenant-context/RBAC (those are frozen for this stream).
//
// Credential-transport finding (see services/api/src/auth.ts,
// services/api/src/customer-auth.ts, services/api/src/dev-auth.ts,
// apps/customer/vite.config.ts, apps/customer/src/lib/api.ts):
//   - Staff auth: custom request headers (x-dev-user-id/x-dev-agency-id/
//     x-dev-role in the current dev-only provider; a production
//     AuthProvider would plausibly carry an Authorization: Bearer token
//     through the same `authenticate(request: { headers })` seam --
//     nothing in this repo sets or reads a session cookie).
//   - Customer portal auth: same shape, a distinct `x-dev-customer`
//     header via a separate CustomerAuthProvider.
//   - Frontend (apps/customer/src/lib/api.ts `request()`): calls
//     `fetch(...)` with a plain `Content-Type` header and NO
//     `credentials: 'include'` -- the browser will not attach cookies
//     to cross-origin requests here even if a cookie existed.
//   - No `@fastify/cookie` usage exists anywhere under services/api/src
//     despite the package being present as a root dependency; grep
//     confirms zero `setCookie`/`reply.cookie`/`request.cookies` calls.
// Conclusion: this API is bearer/header-token-shaped, not
// cookie/session-shaped. Classical CSRF (which relies on browsers
// auto-attaching ambient cookie credentials) is therefore not the
// primary threat model. See CSRF verdict in the stream report for the
// full reasoning and the residual risk this does NOT cover (token
// storage on the client, which is out of this stream's scope but noted
// as informational).

export interface SecurityEnvironment {
  NODE_ENV?: string;
  CORS_ALLOWED_ORIGINS?: string;
}

export interface CorsPolicy {
  /** true only in a genuine production NODE_ENV. */
  isProduction: boolean;
  /** Explicit allow-list of origins; never '*' in production. */
  allowedOrigins: string[];
  /** Whether the allow-list also accepts localhost:<any-port> (dev only). */
  allowLocalhostAnyPort: boolean;
}

export class SecurityConfigError extends Error {
  readonly code = 'SECURITY_CONFIG_ERROR';
}

const LOCALHOST_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Resolves the CORS origin allow-list from the environment.
 *
 * Fail-loud, not fail-open: in production, a missing or malformed
 * CORS_ALLOWED_ORIGINS throws rather than silently allowing every
 * origin or silently allowing none-but-pretending-it's-fine. In
 * non-production, an unset value falls back to a documented localhost
 * dev allow-list so `npm run dev` keeps working out of the box.
 */
export function resolveCorsPolicy(environment: SecurityEnvironment = process.env): CorsPolicy {
  const isProduction = environment.NODE_ENV === 'production';
  const raw = environment.CORS_ALLOWED_ORIGINS;

  if (!isProduction && (raw === undefined || raw.trim().length === 0)) {
    return {
      isProduction: false,
      allowedOrigins: [],
      allowLocalhostAnyPort: true,
    };
  }

  if (raw === undefined || raw.trim().length === 0) {
    throw new SecurityConfigError(
      'CORS_ALLOWED_ORIGINS must be set to a comma-separated list of explicit origins in production. Refusing to start with an implicit/open CORS policy.',
    );
  }

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new SecurityConfigError(
      'CORS_ALLOWED_ORIGINS is set but contains no usable origins after parsing.',
    );
  }

  for (const origin of origins) {
    if (origin === '*') {
      throw new SecurityConfigError(
        'CORS_ALLOWED_ORIGINS must not contain "*" in production (wildcard origin with credentialed requests is never allowed).',
      );
    }
    if (!isValidOrigin(origin)) {
      throw new SecurityConfigError(
        `CORS_ALLOWED_ORIGINS contains an invalid origin: "${origin}". Expected an absolute origin like "https://app.example.com" (no path).`,
      );
    }
    if (isProduction && origin.startsWith('http://') && !LOCALHOST_ORIGIN_PATTERN.test(origin)) {
      throw new SecurityConfigError(
        `CORS_ALLOWED_ORIGINS contains a non-HTTPS origin in production: "${origin}".`,
      );
    }
  }

  return {
    isProduction,
    allowedOrigins: origins,
    allowLocalhostAnyPort: false,
  };
}

function isValidOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && value === url.origin;
  } catch {
    return false;
  }
}

/**
 * Origin allow-check used by the @fastify/cors `origin` callback. Never
 * reflects an arbitrary Origin header back -- only ever returns true for
 * an origin that matches the resolved policy.
 */
export function isOriginAllowed(origin: string, policy: CorsPolicy): boolean {
  if (policy.allowedOrigins.includes(origin)) {
    return true;
  }
  if (policy.allowLocalhostAnyPort && LOCALHOST_ORIGIN_PATTERN.test(origin)) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------
// Request body size limits (Fastify `bodyLimit`, bytes).
//
// Fastify's own hard-coded default is 1 MiB. This app's JSON payloads
// (bookings, proposals, offers, creative-template/asset metadata in
// offer-growth) are ordinary JSON documents, not binary uploads --
// `assets.ts` stores metadata (mime type, size, duration, dimensions)
// about media that lives elsewhere, it does not accept raw file bytes
// through these routes. A single, slightly-above-default global limit
// comfortably covers the largest legitimate JSON bodies (e.g. a
// multi-stage creative template payload with many fields) without
// opening the door to multi-megabyte abusive bodies.
// ---------------------------------------------------------------------
export const DEFAULT_BODY_LIMIT_BYTES = 2 * 1024 * 1024; // 2 MiB
