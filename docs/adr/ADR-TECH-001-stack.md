# ADR-TECH-001: Stack tecnológica oficial

## Status

Aceito

## Context

The Travel Platform needs a clear baseline before feature implementation
starts. The repository already contains documentation, domain sketches,
security guardrails, and early TypeScript files, but several documents still
refer to mixed tooling.

## Decision

Adopt the following official stack:

- Runtime: Node.js
- Language: TypeScript
- Monorepo: npm workspaces
- Build orchestration: Turborepo
- Backend framework: Fastify
- Database: PostgreSQL
- ORM: Prisma
- Test framework: Vitest
- Frontend: React + TypeScript
- Initial client: Web/PWA
- Tenant isolation: application-level checks plus PostgreSQL Row-Level Security
- Infrastructure as Code: Terraform deferred

Wish is part of the product domain and should be represented consistently in
future schema, API, documentation, and tests.

## Consequences

- New project configuration should use npm workspaces and Turborepo.
- Backend examples and implementation should use Fastify conventions.
- Tests should use Vitest conventions and configuration.
- Existing test and backend examples should be aligned with Vitest and Fastify.
- Prisma remains the ORM, with PostgreSQL RLS as an additional safety layer.
- Terraform files should not be required for the initial MVP foundation.

## References

- `docs/01-architecture/technology-stack.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
