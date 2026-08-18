import { describe, it, expect } from 'vitest';
import {
  ACCEPTED_FINDINGS,
  classifyAdvisories,
  collectAdvisories,
  extractGhsaId,
} from '../../scripts/check-security-audit.cjs';

// DEP-01 policy regression: security:check must WARN (not fail) on exactly
// the finding docs/adr/ADR-SEC-001-deepmerge-ts-risk-acceptance.md already
// accepted, and must FAIL on anything else -- a new advisory in an
// unrelated package, a *different* advisory in the same accepted package,
// or the accepted GHSA id resurfacing in an unrelated package. None of
// these fixtures are real `npm audit` output; they are shaped like it.

function auditReportWith(vulnerabilities: Record<string, unknown>) {
  return { vulnerabilities };
}

function advisory(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    source: 1145093,
    name: 'deepmerge-ts',
    title: 'DeepmergeTS has stack exhaustion when merging recursive object graphs',
    url: 'https://github.com/advisories/GHSA-ggr8-5vv4-36mx',
    severity: 'high',
    ...overrides,
  };
}

describe('DEP-01 allowlist: the known, ADR-accepted finding', () => {
  it('has exactly one entry, keyed to deepmerge-ts + the ADR-SEC-001 GHSA id', () => {
    expect(ACCEPTED_FINDINGS).toHaveLength(1);
    expect(ACCEPTED_FINDINGS[0]).toMatchObject({
      packageName: 'deepmerge-ts',
      ghsaId: 'GHSA-GGR8-5VV4-36MX',
      adr: 'docs/adr/ADR-SEC-001-deepmerge-ts-risk-acceptance.md',
    });
  });

  it('extracts the GHSA id from an advisory URL', () => {
    expect(extractGhsaId('https://github.com/advisories/GHSA-ggr8-5vv4-36mx')).toBe(
      'GHSA-GGR8-5VV4-36MX',
    );
    expect(extractGhsaId(undefined)).toBeNull();
  });
});

describe('classifyAdvisories: WARN on known, FAIL on new', () => {
  it('classifies the exact accepted finding as accepted, not a failure', () => {
    const report = auditReportWith({ 'deepmerge-ts': { name: 'deepmerge-ts', via: [advisory()] } });
    const { accepted, unaccepted } = classifyAdvisories(collectAdvisories(report));

    expect(unaccepted).toEqual([]);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.advisory.packageName).toBe('deepmerge-ts');
    expect(accepted[0]?.acceptedEntry.adr).toBe(
      'docs/adr/ADR-SEC-001-deepmerge-ts-risk-acceptance.md',
    );
  });

  it('fails on a new vulnerability in an unrelated package', () => {
    const report = auditReportWith({
      'some-other-package': {
        name: 'some-other-package',
        via: [
          advisory({
            name: 'some-other-package',
            url: 'https://github.com/advisories/GHSA-xxxx-yyyy-zzzz',
            title: 'Unrelated new vulnerability',
          }),
        ],
      },
    });

    const { accepted, unaccepted } = classifyAdvisories(collectAdvisories(report));

    expect(accepted).toEqual([]);
    expect(unaccepted).toHaveLength(1);
    expect(unaccepted[0]?.packageName).toBe('some-other-package');
  });

  it('fails on a *different* advisory in the already-accepted package (not a blanket package allowlist)', () => {
    const report = auditReportWith({
      'deepmerge-ts': {
        name: 'deepmerge-ts',
        via: [
          advisory({
            url: 'https://github.com/advisories/GHSA-9999-8888-7777',
            title: 'A hypothetical second, different deepmerge-ts advisory',
          }),
        ],
      },
    });

    const { accepted, unaccepted } = classifyAdvisories(collectAdvisories(report));

    expect(accepted).toEqual([]);
    expect(unaccepted).toHaveLength(1);
    expect(unaccepted[0]?.ghsaId).toBe('GHSA-9999-8888-7777');
  });

  it('fails if the accepted GHSA id resurfaces in an unrelated package', () => {
    const report = auditReportWith({
      'unrelated-package': {
        name: 'unrelated-package',
        via: [advisory({ name: 'unrelated-package' })],
      },
    });

    const { accepted, unaccepted } = classifyAdvisories(collectAdvisories(report));

    expect(accepted).toEqual([]);
    expect(unaccepted).toHaveLength(1);
    expect(unaccepted[0]?.packageName).toBe('unrelated-package');
  });

  it('ignores severities below the audit level', () => {
    const report = auditReportWith({
      'low-severity-package': {
        name: 'low-severity-package',
        via: [
          advisory({
            name: 'low-severity-package',
            url: 'https://github.com/advisories/GHSA-1111-2222-3333',
            severity: 'low',
          }),
        ],
      },
    });

    const { accepted, unaccepted } = classifyAdvisories(collectAdvisories(report));

    expect(accepted).toEqual([]);
    expect(unaccepted).toEqual([]);
  });

  it('follows cross-reference "via" string entries without treating them as advisories', () => {
    // Real `npm audit --json` output includes plain package-name strings in
    // `via` for a package that is vulnerable only because a dependency is;
    // those must not be misread as an advisory with no GHSA id.
    const report = auditReportWith({
      '@prisma/config': {
        name: '@prisma/config',
        via: ['deepmerge-ts'],
      },
      'deepmerge-ts': {
        name: 'deepmerge-ts',
        via: [advisory()],
      },
    });

    const { accepted, unaccepted } = classifyAdvisories(collectAdvisories(report));

    expect(unaccepted).toEqual([]);
    expect(accepted).toHaveLength(1);
  });
});
