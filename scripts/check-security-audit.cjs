const { spawnSync } = require('node:child_process');

// DEP-01 / security:check policy.
//
// `npm audit` alone is not a usable CI gate for this repository: it already
// reports a known, ADR-accepted finding (deepmerge-ts, pulled in
// transitively through Prisma's own tooling -- see
// docs/adr/ADR-SEC-001-deepmerge-ts-risk-acceptance.md) which will stay red
// until Prisma ships a fix. Making the whole gate `|| true` or
// `continue-on-error: true` would hide that AND every future, genuinely new
// vulnerability behind the same green checkmark -- decorative, not a gate.
//
// Instead: run `npm audit --json`, compare every reported advisory against
// a small, explicit, reviewed allowlist of exactly the findings an ADR has
// already accepted. A finding on the allowlist is reported as a WARNING
// (visible, not silent) and does not fail the gate. Any other finding at or
// above AUDIT_LEVEL fails the gate, exactly as `npm audit
// --audit-level=moderate` would have.
//
// To retire the exception: once ADR-SEC-001's review triggers fire (Prisma
// ships a fix, the advisory is withdrawn, before first production deploy),
// remove its entry from ACCEPTED_FINDINGS below. Do not edit the ADR's
// Status or Decision here -- this file only records that CI applies the
// exception the ADR already authorized; the risk remains ACCEPTED --
// TEMPORARY until the ADR itself is revisited.

const AUDIT_LEVEL_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const AUDIT_LEVEL = 'moderate';

// Each entry must match BOTH the advisory GHSA id AND the vulnerable
// package name -- not the package alone, and not "any advisory in this
// dependency chain" -- so a new, unrelated vulnerability in the same
// package (or the same GHSA id resurfacing in an unrelated package) is
// never silently accepted by accident.
const ACCEPTED_FINDINGS = [
  {
    packageName: 'deepmerge-ts',
    ghsaId: 'GHSA-GGR8-5VV4-36MX',
    adr: 'docs/adr/ADR-SEC-001-deepmerge-ts-risk-acceptance.md',
    reason:
      'Tooling/build-time dependency of Prisma config, not application runtime code. ' +
      'Risk accepted temporarily pending a Prisma release that drops the vulnerable ' +
      'deepmerge-ts version; see the ADR review triggers.',
  },
];

function findAcceptedEntry(packageName, ghsaId) {
  return ACCEPTED_FINDINGS.find(
    (entry) => entry.packageName === packageName && entry.ghsaId === ghsaId,
  );
}

function extractGhsaId(url) {
  const match = /\/(GHSA-[a-z0-9-]+)/i.exec(url ?? '');
  return match ? match[1].toUpperCase() : null;
}

function collectAdvisories(auditReport) {
  const advisories = [];

  for (const vulnerability of Object.values(auditReport.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      // `via` entries are either a plain package-name string (meaning "this
      // is vulnerable because that other package is") or an advisory
      // object. Only advisory objects carry a GHSA id to key the allowlist
      // on; the plain-string entries are cross-references to another
      // `vulnerabilities` entry that will itself be walked separately.
      if (typeof via === 'string') {
        continue;
      }

      advisories.push({
        packageName: vulnerability.name,
        severity: via.severity,
        ghsaId: extractGhsaId(via.url),
        title: via.title,
        url: via.url,
      });
    }
  }

  return advisories;
}

function runAudit() {
  // npm is npm.cmd on Windows, which spawnSync cannot exec directly without
  // a shell (EINVAL). Passing the whole command as a single string with
  // shell: true (no separate args array) runs it through the shell without
  // triggering Node's shell-argument-escaping deprecation warning, and
  // there is no untrusted input in this fixed command line.
  const result = spawnSync('npm audit --json', {
    encoding: 'utf8',
    shell: true,
  });

  // `npm audit` exits non-zero whenever it finds anything reportable --
  // that is expected and NOT itself a failure to run the command. Only a
  // missing/unparseable JSON payload means the audit itself could not be
  // performed.
  if (!result.stdout) {
    console.error('npm audit produced no output.');
    if (result.stderr) {
      console.error(result.stderr);
    }
    process.exitCode = 1;
    return null;
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    console.error('Could not parse `npm audit --json` output.');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return null;
  }
}

function classifyAdvisories(advisories, auditLevel = AUDIT_LEVEL) {
  const minRank = AUDIT_LEVEL_RANK[auditLevel];
  const accepted = [];
  const unaccepted = [];

  for (const advisory of advisories) {
    if ((AUDIT_LEVEL_RANK[advisory.severity] ?? 0) < minRank) {
      continue;
    }

    const acceptedEntry = advisory.ghsaId
      ? findAcceptedEntry(advisory.packageName, advisory.ghsaId)
      : undefined;

    if (acceptedEntry) {
      accepted.push({ advisory, acceptedEntry });
    } else {
      unaccepted.push(advisory);
    }
  }

  return { accepted, unaccepted };
}

function main() {
  const auditReport = runAudit();
  if (!auditReport) {
    return;
  }

  const advisories = collectAdvisories(auditReport);
  const { accepted, unaccepted } = classifyAdvisories(advisories);

  if (accepted.length === 0 && unaccepted.length === 0) {
    console.log(`No vulnerabilities at or above "${AUDIT_LEVEL}" severity.`);
    return;
  }

  if (accepted.length > 0) {
    console.warn('WARNING: known, ADR-accepted findings present:');
    for (const { advisory, acceptedEntry } of accepted) {
      console.warn(
        `- [ACCEPTED] ${advisory.packageName} / ${advisory.ghsaId} (${advisory.severity}) -- ${acceptedEntry.adr}`,
      );
      console.warn(`  ${acceptedEntry.reason}`);
    }
  }

  if (unaccepted.length > 0) {
    console.error('New or unaccepted vulnerabilities found:');
    for (const advisory of unaccepted) {
      console.error(
        `- [NEW] ${advisory.packageName} / ${advisory.ghsaId ?? 'unknown-advisory'} (${advisory.severity}): ${advisory.title}`,
      );
      console.error(`  ${advisory.url}`);
    }
    console.error(
      '\nThese are not covered by any entry in ACCEPTED_FINDINGS ' +
        '(scripts/check-security-audit.cjs). Triage and either fix them or add ' +
        'a new ADR that explicitly accepts the risk before allowlisting them.',
    );
    process.exitCode = 1;
    return;
  }

  console.log('\nAll findings are known and ADR-accepted. Gate passes with warnings above.');
}

if (require.main === module) {
  main();
}

module.exports = {
  AUDIT_LEVEL,
  AUDIT_LEVEL_RANK,
  ACCEPTED_FINDINGS,
  findAcceptedEntry,
  extractGhsaId,
  collectAdvisories,
  classifyAdvisories,
};
