# Rate Limiting and Brute-Force Protection

## Current implementation

SEC-B replaces the previous process-local write-only limiter with explicit
request classes, per-IP request quotas, trusted-tenant quotas after the auth
pipeline, and a reusable login abuse policy. The implementation is in
`services/api/src/rate-limit.ts` and is installed by `services/api/src/app.ts`.

The request hook uses Fastify `request.ip`. `trustProxy` remains false, so
client-controlled `X-Forwarded-For` is never used as an abuse-control key.
Production proxy topology is an operational decision and must be configured
before enabling trusted proxy behavior; this stream does not guess a proxy
count or CIDR.

## Request classes

| Class                | Default policy                                     |
| -------------------- | -------------------------------------------------- |
| `AUTH_LOGIN`         | 10 requests per 15 minutes per IP and route        |
| `AUTH_RECOVERY`      | 5 requests per 15 minutes per IP and route         |
| `PUBLIC_ANONYMOUS`   | 120 requests per minute per IP and route           |
| `CUSTOMER_READ`      | 240 requests per minute per IP/tenant and route    |
| `CUSTOMER_WRITE`     | 60 requests per minute per IP/tenant and route     |
| `STAFF_READ`         | 600 requests per minute per IP/tenant and route    |
| `STAFF_WRITE`        | 300 requests per minute per IP/tenant and route    |
| `SENSITIVE_MUTATION` | 20 requests per 15 minutes per IP/tenant and route |
| `WEBHOOK_EXTERNAL`   | 120 requests per minute per IP and route           |
| `SYSTEM_INTERNAL`    | 300 requests per minute per IP and route           |

Sensitive mutation matching covers financial/payment writes, booking
cancellation, and sale/proposal lifecycle writes. The actual route remains
subject to its existing authentication, authorization, tenant, and RLS checks.
Tenant keys are used only after staff or customer authentication established
tenant context server-side. No query, body, or header tenant identifier is used
for the tenant quota.

## Login abuse contract

No credential-accepting login or recovery route exists in the current Fastify
application. Future staff and customer credential providers must create a
`LoginAbuseProtector` using the application RateLimitStore and follow this
contract:

1. Call `check({ accountId, ip })` before verifying credentials.
2. Call `recordFailure({ accountId, ip })` for every rejected credential pair,
   whether or not that account exists.
3. Call `recordSuccess({ accountId, ip })` only after credentials are verified.
4. Return the same credential failure response for known and unknown accounts.

The protector uses independent per-IP, hashed per-account, and account/IP-pair
keys. Its server-authoritative states are `allow`, `throttle`,
`captcha_required`, and `temporary_block`. Per-account pressure can reach
CAPTCHA but does not permanently block the account. A temporary block requires
the abusive account/IP pair threshold, reducing account-lockout denial of
service risk. All counters expire after their configured TTL.

SEC-C must use those states as input to CAPTCHA verification. It must not
replace or downgrade the server decision with a browser-only signal.

## Responses

Exceeded request quotas return HTTP 429 with:

```json
{
  "error": "Too many requests",
  "code": "RATE_LIMITED"
}
```

`Retry-After` is included when a counter has a known reset time. Responses do
not expose bucket keys, account identifiers, failure counts, or store details.

## Store and deployment

`RateLimitStore` is asynchronous so a distributed implementation can provide
atomic consume, get, and reset operations. `InMemoryRateLimitStore` is limited
to local development and tests. Production startup requires
`RATE_LIMIT_STORE=external` and an injected shared `RateLimitStore`; it fails
closed otherwise. No Redis, cache, or provider has been selected in this
repository.

The runtime configuration is:

```text
RATE_LIMIT_ENABLED=true
RATE_LIMIT_STORE=memory
RATE_LIMIT_MAX=300
RATE_LIMIT_WINDOW_MS=60000
```

`RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` configure the legacy-compatible
`STAFF_WRITE` default. Class-specific overrides are server configuration, not
client input. Invalid values fail startup rather than weakening the policy.

HUMAN INFRASTRUCTURE DECISION REQUIRED: choose the distributed store provider,
provisioning model, atomic-operation semantics, and production injection path.
