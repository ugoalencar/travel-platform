# P0-2 — PRODUCTION RATE LIMIT STORE

Target: exact blocked `release/final-rc-02` HEAD.

Branch:
`fix/rc02-rate-limit-store`

Mission:
Implement a production-capable external/distributed RateLimitStore without weakening SEC-B semantics.

First inspect:
- existing RateLimitStore abstraction
- memory implementation
- production startup validation
- env/config architecture
- deployment docs
- existing Redis/ioredis/node-redis dependencies

Requirements:
- preserve existing SEC-B states: allow, throttle, captcha_required, temporary_block
- preserve trusted proxy semantics
- no arbitrary XFF trust
- memory store allowed only for dev/test/single-instance where explicitly configured
- production multi-instance must require distributed store
- implement Redis-backed store only through existing abstraction
- use atomic operations / TTL semantics appropriate for counters and temporary blocks
- no silent fallback to memory in production
- connection failure behavior must fail safely and be documented
- secrets/connection string not logged
- config validation fail-closed

If no Redis client dependency exists, add the smallest production-appropriate client dependency; no vendor-specific managed Redis assumption.

Tests:
- counter increments
- expiry/TTL
- temporary block
- concurrent increments
- store unavailable
- production requires external store
- dev/test memory store still works
- XFF/trusted proxy behavior unchanged

Run:
lint
typecheck
security tests
rate-limit tests
production startup smoke
build

Return:
BRANCH
HEAD
STORE IMPLEMENTATION
CONFIG
FAILURE POLICY
CONCURRENCY TEST
SECURITY TESTS
STARTUP SMOKE
P0
P1
READY FOR P0 INTEGRATION / BLOCKED

DO NOT PUSH/PR/MERGE.
