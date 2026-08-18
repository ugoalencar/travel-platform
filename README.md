# Travel Platform

Travel Platform is a SaaS platform for travel agencies to manage customers,
trips, offers, sales, brokers, commissions, and customer travel wishes.

## Current Status

This repository is in foundation setup. The initial work is focused on
architecture, documentation, security rules, and repository structure.
Feature implementation has not started yet.

## Official Stack

- Runtime: Node.js
- Language: TypeScript
- Monorepo: npm workspaces + Turborepo
- Backend: Fastify
- Database: PostgreSQL
- ORM: Prisma
- Tests: Vitest
- Frontend: React + TypeScript
- Initial client: Web/PWA
- Infrastructure as Code: Terraform is deferred
- Tenant isolation: application checks plus PostgreSQL RLS

See `docs/01-architecture/technology-stack.md` for the official technology
baseline.

## Repository Layout

- `apps/agency`: agency portal
- `apps/broker`: broker portal
- `apps/customer`: customer portal
- `services/api`: Fastify API service
- `packages/domain`: shared domain types and tenant helpers
- `packages/database`: Prisma schema and database package
- `packages/config`: shared configuration package
- `packages/shared`: shared utilities
- `packages/validation`: shared validation schemas
- `docs`: product, architecture, domain, security, database, API, frontend,
  testing, devops, ADRs, and decision records
- `infrastructure`: docker, migrations, and deferred Terraform area
- `tests`: integration, e2e, and security tests
- `.ai`: agent instructions, skills, checklists, guardrails, and policies

## Security Baseline

- Never trust `agency_id` or tenant identifiers from the frontend.
- Always derive tenant context from authenticated server-side context.
- Use PostgreSQL Row-Level Security as an additional defense layer.
- Never commit real `.env` files, credentials, private keys, or tokens.
- Keep secrets in environment variables or a managed secret store.
- Every sensitive operation must enforce authorization and be auditable.

## Development Rules

Do not install dependencies, run migrations, or implement features until the
repository foundation and tooling are confirmed. Follow `AGENTS.md` and
`QUALITY-GATES.md` before changing code.

## Documentation Entry Points

- Product: `docs/00-product/`
- Architecture: `docs/01-architecture/`
- Security: `docs/03-security/`
- Domain: `docs/02-domain/`
- Database: `docs/04-database/`
- Testing: `docs/07-testing/`
- ADRs: `docs/adr/`
- Decisions: `docs/decisions/`
- Quality gates: `QUALITY-GATES.md`
