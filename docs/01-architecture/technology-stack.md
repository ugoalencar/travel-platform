# Technology Stack

This document is the official source for the initial technical decisions of
the Travel Platform repository.

## Official Decisions

| Area | Decision |
| --- | --- |
| Runtime | Node.js |
| Language | TypeScript |
| Monorepo | npm workspaces + Turborepo |
| Backend | Fastify |
| Database | PostgreSQL |
| ORM | Prisma |
| Tests | Vitest |
| Frontend | React + TypeScript |
| Initial client | Web/PWA |
| Infrastructure as Code | Terraform deferred |
| Domain | Wish is part of the domain |
| Tenant isolation | Application checks plus PostgreSQL RLS |

## Notes

- PostgreSQL Row-Level Security is an additional tenant isolation layer, not
  the only control.
- The application must still derive tenant context server-side and enforce
  authorization for every sensitive operation.
- Terraform is intentionally deferred and should not block local or MVP setup.
- Test tooling must standardize on Vitest. Do not introduce another test
  framework without a new accepted ADR.
