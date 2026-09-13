# Mega Pack Integration Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate remaining Mega Pack worktrees safely into `main` without losing committed or uncommitted legitimate feature work.

**Architecture:** Each Mega Pack worktree is handled as one verifiable integration unit. Integration uses a temporary branch/worktree from the current accepted baseline, classifies every file, resolves migration conflicts before tests, and only promotes work after targeted and global gates pass.

**Tech Stack:** Git worktrees, Node.js, TypeScript, npm workspaces, Fastify, PostgreSQL/RLS, Vitest.

## Global Constraints

- Do not start staging until Fase 0 and Fase 1 are complete.
- Do not delete untracked files blindly.
- Do not copy random files between worktrees from multiple features at the same time.
- Do not rewrite historical applied migrations.
- Do not merge multiple Mega Pack worktrees at once.
- Do not touch production or staging systems.
- Do not weaken Auth, RBAC, RLS, tenant isolation, security core, or finance core.
- Do not change finance formulas unless the change is already part of the feature contract.
- Treat current `main` as authority for Auth, Tenant, RBAC, RLS, security core, finance core, and already-applied migrations.
- Every worktree must produce a final per-worktree report before moving to the next worktree.
- Current executive tracking numbers: Fase 0 - Main limpo: 75%; Fase 1 - Mega Pack integrado: 55%.

---

## File Structure

- `ROADMAP_PHASE0_CHECKPOINT.md`: living checkpoint for baseline, gates, and continuation state.
- `ROADMAP_PHASE0_WORKTREE_INVENTORY.md`: dirty `main` inventory and classification summary.
- `ROADMAP_PHASE1_WORKTREE_AUDIT.md`: Mega Pack branch/worktree audit and integration order.
- `docs/superpowers/plans/2026-09-13-mega-pack-integration-recovery.md`: this executable integration plan.
- `docs/superpowers/specs/mega-pack-integration/<worktree>.md`: one per-worktree integration report, created as each unit is processed.
- Temporary integration worktrees under `.worktrees/integrate-<worktree>` when the active checkout is unsafe to modify directly.

## Worktree Order

1. `mega-catalog`
2. `mega-ocr`
3. `mega-partners`
4. `mega-upsell`
5. `mega-contracts`
6. `mega-insurance`
7. `mega-campaigns`
8. `mega-traveler`

### Task 1: Preflight And Baseline Guard

**Files:**
- Modify: `ROADMAP_PHASE0_CHECKPOINT.md`
- Modify: `ROADMAP_PHASE1_WORKTREE_AUDIT.md`

**Interfaces:**
- Consumes: current git worktree list, current `main` HEAD, current dirty status.
- Produces: updated baseline state for all later tasks.

- [ ] **Step 1: Capture current baseline identity**

Run:

```powershell
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status --short --untracked-files=all
```

Expected:
- Branch is `main`.
- Status may be dirty, but all dirty files must be documented before integration.

- [ ] **Step 2: Confirm worktree isolation capability**

Run:

```powershell
git rev-parse --git-dir
git rev-parse --git-common-dir
git check-ignore -q .worktrees; if ($LASTEXITCODE -eq 0) { '.worktrees ignored' } else { '.worktrees not ignored' }
```

Expected:
- If `.git` equals common dir, current checkout is not isolated.
- `.worktrees ignored`.

- [ ] **Step 3: Update checkpoint with baseline**

Record branch, HEAD, dirty status count, and the integration order in `ROADMAP_PHASE0_CHECKPOINT.md`.

### Task 2: Per-Worktree Inventory Template

**Files:**
- Create: `docs/superpowers/specs/mega-pack-integration/<worktree>.md`

**Interfaces:**
- Consumes: one source worktree path and branch name.
- Produces: a complete per-worktree report with file classification and gate status.

- [ ] **Step 1: Create report file**

For each worktree, create a report using this structure:

```markdown
# Mega Pack Integration Report - <worktree>

Date:
Source worktree:
Source branch:
Source HEAD:
Baseline main HEAD:

## Commits Outside Main

## Modified Files

## Untracked Files

## Migrations

## File Classification

| File | Classification | Action | Notes |
|---|---|---|---|

## Conflicts

## Tests

## Security / RLS

## Merge Status

Merged into main: NO
Safe to remove source worktree: NO
```

- [ ] **Step 2: Inventory commits**

Run:

```powershell
git -C <source-worktree> rev-parse --abbrev-ref HEAD
git -C <source-worktree> rev-parse HEAD
git rev-list --left-right --count main...<branch>
git log --oneline main..<branch>
```

Expected:
- Branch-only commits are listed.
- If no branch-only commits exist, local uncommitted files still need classification.

- [ ] **Step 3: Inventory dirty files**

Run:

```powershell
git -C <source-worktree> status --short --untracked-files=all
```

Expected:
- Every modified and untracked file is copied into the report.

- [ ] **Step 4: Inventory migrations**

Run:

```powershell
git -C <source-worktree> ls-files --others --modified --exclude-standard infrastructure/migrations
Get-ChildItem D:\travel-platform\infrastructure\migrations -File | Select-Object -ExpandProperty Name | Sort-Object
```

Expected:
- Incoming migration names are compared against current `main`.
- Any collision is flagged before integration.

### Task 3: Integrate One Worktree In Isolation

**Files:**
- Modify/Create: files classified as feature source, tests, migrations, or docs for the selected worktree only.
- Create: `.worktrees/integrate-<worktree>` via git worktree.

**Interfaces:**
- Consumes: one completed per-worktree report.
- Produces: one temporary integration branch with only that worktree's legitimate changes.

- [ ] **Step 1: Create temporary integration worktree from current baseline**

Run:

```powershell
git worktree add .worktrees/integrate-<worktree> -b integration/<worktree> main
```

Expected:
- New isolated worktree exists.
- Branch name is `integration/<worktree>`.

- [ ] **Step 2: Bring committed work**

If branch-only commits exist and the branch is clean enough to merge as a unit:

```powershell
git -C .worktrees/integrate-<worktree> merge --no-ff <source-branch>
```

Expected:
- Merge succeeds or reports conflicts that must be resolved inside the integration worktree.

- [ ] **Step 3: Bring legitimate uncommitted work**

For files classified as feature source, tests, migrations, or docs, copy only from this same source worktree to the integration worktree after classification.

Expected:
- No files from any other worktree are copied.
- Generated artifacts and unrelated files remain excluded.

- [ ] **Step 4: Resolve migration collisions**

If an incoming migration number collides with current baseline and is unapplied:
- Rename only the incoming migration file to the next available number.
- Update any references in the per-worktree report.

Expected:
- Existing migrations in `main` are unchanged.

### Task 4: Verify One Integrated Worktree

**Files:**
- Modify: `docs/superpowers/specs/mega-pack-integration/<worktree>.md`
- Modify: `ROADMAP_PHASE1_WORKTREE_AUDIT.md`

**Interfaces:**
- Consumes: integration branch/worktree from Task 3.
- Produces: evidence-backed test result and merge recommendation.

- [ ] **Step 1: Run targeted tests**

Run the smallest relevant test command for the module. Examples:

```powershell
npm --workspace @travel-platform/api test -- <module-name>
```

Expected:
- Targeted test output is recorded in the per-worktree report.

- [ ] **Step 2: Run standard gates**

Run:

```powershell
npm run typecheck
npm run lint
npm run build
```

Expected:
- All commands exit 0 before merge eligibility.

- [ ] **Step 3: Run security/RLS gates when tenant-scoped data is touched**

Run when the module changes tenant-scoped data, auth, RBAC, RLS, migrations, grants, or database tests:

```powershell
npm run security:check
npm run test:security
npm run test:db
```

Expected:
- All relevant commands exit 0 before merge eligibility.

- [ ] **Step 4: Update report**

Fill:

```markdown
CONFLICTS:
TESTS:
SECURITY:
MERGED:
SAFE TO REMOVE WORKTREE:
```

Expected:
- `SAFE TO REMOVE WORKTREE` remains `NO` until unique commits and legitimate untracked files are absent from the source worktree.

### Task 5: Promote One Worktree To Main

**Files:**
- Modify: current `main`, only after integration branch is verified.
- Modify: `ROADMAP_PHASE0_CHECKPOINT.md`
- Modify: `ROADMAP_PHASE1_WORKTREE_AUDIT.md`

**Interfaces:**
- Consumes: verified integration branch.
- Produces: updated `main` with one integrated Mega Pack unit.

- [ ] **Step 1: Merge only after green gates**

Run from `main` after ensuring the dirty main state is intentionally handled:

```powershell
git merge --no-ff integration/<worktree>
```

Expected:
- Only one worktree's integration branch is merged.

- [ ] **Step 2: Revalidate main**

Run:

```powershell
git status --short
npm run typecheck
npm run lint
npm run build
```

If security-sensitive, also run:

```powershell
npm run security:check
npm run test:security
npm run test:db
```

Expected:
- Main is green before the next worktree starts.

- [ ] **Step 3: Update executive percentages**

Update:
- Fase 0 - Main limpo
- Fase 1 - Mega Pack integrado

Expected:
- Percentages change only with evidence.

## Self-Review

- Spec coverage: The plan covers inventory, classification, migration comparison, isolated integration, targeted/global/security/RLS gates, merge, main revalidation, and cleanup safety.
- Placeholder scan: No `TBD`, generic TODO, or unspecified test instruction remains.
- Type consistency: The same `<worktree>`, `<source-worktree>`, and `<source-branch>` placeholders are used consistently as execution parameters, not as missing implementation details.
