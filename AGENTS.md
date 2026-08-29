# Travel Platform - Agent Instructions

This is the global source of truth for AI agents working in this repository.

## Mission

Build Travel Platform with secure, correct, tested, documented, and evolvable
changes. Security and tenant isolation take priority over speed.

## Project Baseline

- Runtime: Node.js
- Language: TypeScript
- Monorepo: npm workspaces + Turborepo
- Backend: Fastify, officially
- Database: PostgreSQL
- ORM: Prisma
- Test framework: Vitest, officially
- Frontend: React + TypeScript
- Initial client: Web/PWA
- Infrastructure as Code: Terraform is deferred
- Domain: Wish is part of the domain
- Security: PostgreSQL RLS is an additional tenant isolation layer

## Source Hierarchy

- Human entry point: `README.md`
- Global AI rules: `AGENTS.md`
- Specialized AI roles: `.ai/agents/`
- AI procedures: `.ai/skills/`
- AI policies and restrictions: `.ai/policies/`
- Operational AI checklists: `.ai/checklists/`
- Product scope: `docs/00-product/`
- Product vision and scope: `docs/PRODUCT-VISION-AND-SCOPE.md`
- Architecture: `docs/01-architecture/`
- Domain model: `docs/02-domain/`
- Security: `docs/03-security/`
- Database: `docs/04-database/`
- API: `docs/05-api/`
- Frontend: `docs/06-frontend/`
- Testing: `docs/07-testing/`
- DevOps: `docs/08-devops/`
- ADRs: `docs/adr/`
- Product/governance decisions: `docs/decisions/`
- Mandatory quality gates: `QUALITY-GATES.md`
- Script usage: `SCRIPTS.md`

Compatibility files such as `AI-RULES.MD` and `.rules.md` must point back to
this file instead of duplicating global rules.

## Before Changing Anything

1. Read the relevant official documents listed above.
2. Identify the affected product/domain area.
3. Check accepted ADRs and DECs before changing architecture or behavior.
4. Identify authorization and tenant isolation requirements.
5. Check existing tests and quality gates.
6. Ask for clarification when business rules are ambiguous.

## Never

- Invent business requirements.
- Implement functionality outside the authorized scope.
- Trust tenant identifiers from the frontend.
- Expose secrets, tokens, passwords, cookies, credentials, or personal data.
- Read real `.env` files unless explicitly authorized for a security task.
- Access production or staging systems without explicit authorization.
- Install dependencies without explicit authorization.
- Execute destructive commands without explicit authorization.
- Run migrations without explicit authorization.
- Create destructive migrations automatically.
- Run `prisma migrate`, `prisma db push`, or `prisma generate` unless explicitly authorized.
- Bypass tenant isolation or remove security controls to make a test pass.
- Introduce Express or Jest without a new accepted ADR.
- Modify architecture without documenting the decision in an ADR.
- Delete documentation before relevant content is consolidated.
- Commit, push, configure remotes, or open PRs without explicit authorization.

## Every Feature Must

- Validate input.
- Enforce authorization server-side.
- Preserve tenant isolation.
- Use Fastify patterns for backend HTTP examples and code.
- Use Vitest for tests.
- Include appropriate tests.
- Pass lint.
- Pass typecheck.
- Pass relevant tests/build gates.
- Update documentation when behavior changes.

## Quality Gates

Run the gates required by the task. For repository-wide verification, use:

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run build
```

Use `QUALITY-GATES.md` for the official gate policy and `SCRIPTS.md` for
PowerShell script usage.

## Security Requirements

- Tenant isolation is mandatory at application and database layers.
- PostgreSQL RLS is defense in depth, not a substitute for authorization.
- Operations that require a tenant must not run silently without `agencyId`.
- Do not rely on user-provided `agencyId`.
- Do not expose secrets in logs, docs, tests, or errors.
- Prefer fail-closed behavior for authorization and tenant context.

## Documentation Rules

- Keep official technical decisions in `docs/01-architecture/technology-stack.md`.
- Keep architectural decisions in `docs/adr/`.
- Keep product/governance decisions in `docs/decisions/`.
- Keep product scope in `docs/00-product/`.
- Keep domain documentation in `docs/02-domain/`.
- Keep security rules in `docs/03-security/`.
- Root-level docs under `docs/*.md` are entry-point bridges only unless stated otherwise.
