# AGENT 01 — AGGRESSIVE RELEASE COORDINATOR

## Mission

Coordenar o programa de release em paralelo. Não implementar features diretamente salvo reconciliações de integração.

## Start

1. `git fetch origin`
2. descobrir exact `origin/main`
3. listar branches/worktrees ativos
4. impedir duplicação de streams
5. preservar `release/production-candidate-01` quebrado apenas como referência forense

## Streams paralelos

- Product A: Customers / Wishes / Trips
- Product B: Proposals / Bookings / Sales
- Product C: Dashboard / Offers / Financial / Reporting / Settings
- Product D: Customer Portal / Transport
- Security: Production Auth / CAPTCHA / MFA
- Production: ProdOps / migrations / backup / restore / no-mocks / startup smoke

## Freeze

Não alterar estruturalmente:
AuthProvider, TenantContext, RBAC, hierarchy OWNER > ADMIN > MANAGER > AGENT > VIEWER, RLS/FORCE, customer self-scope, SEC-B rate limiting, SEC-E HTTP security, SEC-F audit, SEC-H fail-closed.

## Human stop only for

- destructive schema redesign
- structural Auth/Tenant/RLS redesign
- required external vendor choice
- undefined financial/legal rule
- P0/P1
- final staging approval
- final production approval

## Track

STREAM | BRANCH | HEAD | TYPECHECK | TESTS | BUILD | MIGRATIONS | P0 | P1 | READY

Do not let an integrator consume a stream unless READY FOR INTEGRATION.
