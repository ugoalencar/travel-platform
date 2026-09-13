# Security Audit Checkpoint

Date: 2026-09-12

## Done

- Reduced `secrets:scan` noise by skipping `.worktrees`.
- Kept active-source false positives covered by tests:
  - angle-bracket documentation placeholders with spaces;
  - `randomBytes(32).toString('base64url')` token generation code.
- Exported and typed `shouldIgnoreDirectory` for scanner regression tests.
- Hardened `services/api/src/financial.ts` dynamic reference checks by limiting table names to a TypeScript union allowlist.
- Upgraded Vitest toolchain to `5.0.0` across the root and frontend workspaces to clear `GHSA-82FW-GWWQ-J7X9`.
- Migrated backend/database tests from the removed Vitest 3 `describe.sequential` chain to regular `describe(...)`; existing configs already disable file parallelism for those suites.
- Fixed mega-pack API lint errors in Meta connector, OCR providers, and characterization tests while preserving async contracts.
- Isolated the official DB/RLS integration test container by deriving the Docker Compose project/container name from the worktree and using an ephemeral local host port.
- Updated the DB/RLS schema/grant expectations for the current migrations (`departments`, enrollment tables, `invitations`, `permission_restrictions`).

## Fresh Verification

- `npm run secrets:scan`: pass, no obvious secrets found.
- `npm run test:security`: pass, 55 tests.
- `npm run typecheck`: pass.
- `npm run security:check`: pass, no vulnerabilities at or above moderate severity.
- `npm --workspace @travel-platform/api test -- dev-auth env security-headers production-auth`: pass, 67 tests.
- `npm --workspace @travel-platform/agency test`: pass, 116 tests.
- `npm --workspace @travel-platform/customer test`: pass, 537 tests.
- `npm --workspace @travel-platform/marketing test`: pass, no test files.
- `npm --workspace @travel-platform/platform-admin test`: pass, no test files.
- `npm run lint`: pass; existing warnings remain, but no errors.
- `npm run test:db`: pass, 9 tests.

## Still Blocking

- No security gate is currently blocked.
- Broader worktree still contains unrelated/uncommitted mega-pack files and pre-existing warnings.

## Next Safe Step

Continue with the broader mega-pack integration/build verification, or commit the security hardening checkpoint once the user authorizes a commit.
