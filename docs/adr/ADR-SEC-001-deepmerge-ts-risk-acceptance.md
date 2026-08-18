# ADR-SEC-001 - Aceitação temporária do risco de deepmerge-ts via tooling do Prisma

## Status

Aceito — Temporário

## Context

`npm audit` reported a known vulnerability in `deepmerge-ts`.

The finding identified:

- package: `deepmerge-ts`
- installed version: `7.1.5`
- advisory source: `1145093`
- GHSA: `GHSA-ggr8-5vv4-36mx`
- CVE: `CVE-2026-40345`
- severity: high
- vulnerable range: `<8.0.0`
- patched version: `8.0.0`

The dependency enters the project through Prisma tooling:

```text
travel-platform@0.1.0
-> prisma@6.19.3
-> @prisma/config@6.19.3
-> deepmerge-ts@7.1.5
```

The analysis classified the current project exposure as tooling/build-time rather than a dependency directly used by the application runtime.

There is not enough technical justification to force a transitive update through `npm overrides` at this time. The command `npm audit fix --force` will not be used because it can introduce uncontrolled or breaking dependency changes.

## Decision

The project temporarily accepts this risk.

The project will:

- keep the finding documented;
- not apply a manual override for `deepmerge-ts`;
- not force a Prisma upgrade or downgrade;
- continue using the current Prisma version while there is no safe, compatible upstream correction available;
- revisit this decision through the review triggers below.

## Security Rationale

This decision does not mean the vulnerability is irrelevant.

Tooling dependencies are part of the software supply-chain attack surface. The risk is accepted with limited scope because the affected dependency currently appears in Prisma configuration/build tooling, not in application request handling.

Development and CI environments remain subject to security controls. Sensitive credentials must not be exposed unnecessarily to build tools. When Git is initialized, the lockfile must remain versioned so dependency changes are auditable and reproducible.

## Review Triggers

This decision must be reviewed when any of these events occur:

1. Prisma publishes a version that removes or updates the vulnerable dependency.
2. `deepmerge-ts` publishes a correction applicable to the dependency chain used by Prisma.
3. The advisory severity increases.
4. Practical exploitation evidence appears that is relevant to this project usage.
5. The dependency becomes part of the application runtime.
6. A Prisma update is planned.
7. Before the first production deploy, if the finding still exists.

## Review Procedure

During review:

- run `npm audit`;
- run `npm ls deepmerge-ts`;
- run `npm explain deepmerge-ts`;
- check the current Prisma version;
- check official advisories;
- evaluate a normal Prisma update before considering an override;
- run lint, typecheck, test, and build after any dependency change.

## Rejected Alternatives

### npm audit fix --force

Rejected because it risks breaking changes and uncontrolled dependency updates.

### npm override imediato

Temporarily rejected because it may force a transitive version not tested by the Prisma dependency chain.

### Ignorar sem documentacao

Rejected because known vulnerabilities require traceability.

## Consequences

Positive:

- avoids a forced and potentially incompatible dependency change;
- keeps the decision traceable;
- defines objective review triggers.

Negative:

- the finding will continue appearing in `npm audit`;
- periodic review is required;
- residual risk remains temporarily accepted.

## CI Enforcement

`npm run security:check` (`scripts/check-security-audit.cjs`) applies this
already-accepted exception mechanically in CI: it runs `npm audit --json`
and compares every reported advisory against a small, explicit allowlist
keyed to this exact finding (package `deepmerge-ts`, GHSA-GGR8-5VV4-36MX).
A match is printed as a `WARNING` referencing this ADR and does not fail the
gate. Any other finding -- a new advisory, a different advisory in
`deepmerge-ts`, or this GHSA id in an unrelated package -- still fails the
gate. This section only records that the exception is enforced this way; it
does not change the Status or Decision above. Removing the allowlist entry
in `scripts/check-security-audit.cjs` is how this exception is retired once
a Review Trigger fires -- that removal does not itself require rewriting
this ADR.

## Owner

Security / Architecture

## Review

Before the first production deploy or when any Review Trigger occurs.

## Related Documentation

- [AGENTS.md](../../AGENTS.md)
- [Security documentation](../03-security/)
- [Technology stack](../01-architecture/technology-stack.md)
- [ADR-TECH-001 - Stack](ADR-TECH-001-stack.md)
