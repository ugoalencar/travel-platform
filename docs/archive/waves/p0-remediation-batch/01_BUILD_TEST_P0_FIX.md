# P0-1 — BUILD / TEST REPAIR

Target: exact blocked `release/final-rc-02` HEAD.

Branch:
`fix/rc02-build-test-p0`

Mission:
Fix only the two build/test P0s:
1. duplicate ApiError class redeclaration in `apps/agency/src/lib/api.ts`
2. missing `@testing-library/user-event`

Steps:
- inspect git history and canonical ApiError implementation
- keep exactly one authoritative ApiError implementation/export
- update imports rather than duplicating classes
- add `@testing-library/user-event` in the correct workspace/package only
- use version compatible with current React/testing-library stack
- update lockfile normally
- do not add broad dependency upgrades

Run:
lint
typecheck
agency tests
customer tests if shared package touched
security tests if shared API error contract touched
build

Required:
0 TypeScript errors
0 build errors
tests pass

Return:
BRANCH
HEAD
FILES
DEPENDENCY CHANGE
LINT
TYPECHECK
TESTS
BUILD
P0
P1
READY FOR P0 INTEGRATION / BLOCKED

DO NOT PUSH/PR/MERGE.
