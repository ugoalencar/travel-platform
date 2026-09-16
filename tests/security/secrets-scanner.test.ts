import { describe, it, expect } from 'vitest';
// scripts/check-secrets.cjs is a CommonJS script; import its pure,
// filesystem-free evaluation functions for unit testing instead of
// exercising the CLI/filesystem-walking entry point.
import {
  evaluateLine,
  isKnownPlaceholder,
  isLikelySecretValue,
  shouldIgnoreDirectory,
  shannonEntropy,
} from '../../scripts/check-secrets.cjs';

// CI-01 / second hardening pass regression suite.
//
// Round 1 fixed exactly one false positive (a documentation example in
// .ai/agents/security-agent.md) by adding an entropy cutoff. An adversarial
// review of that version found it missed most real-world secret shapes:
// SCREAMING_SNAKE_CASE-prefixed names (GITHUB_TOKEN=, DB_PASSWORD=), plain
// camelCase (apiKey=, clientSecret=), short realistic passwords whose
// entropy is unremarkable (PASSWORD=Tr0ub4dor), values containing symbols
// truncated by an over-narrow character class (password="Summer2024!"),
// credentials embedded in connection string URLs, JWTs, and PEM keys.
//
// This version makes structural detection (known keyword names + known
// secret *formats*: JWT, GitHub/Slack/AWS token prefixes, PEM headers,
// connection strings) the primary mechanism. Entropy is retained only as
// informational metadata on a finding, never as a gate that can suppress
// one -- so these tests assert on findings existing/not existing, not on
// entropy thresholds.
//
// All values below are synthetic fixtures invented for this test. None are
// real credentials for any system.

function names(line: string): string[] {
  return evaluateLine(line).map((finding) => finding.pattern);
}

describe('secrets scanner: placeholders are allowed', () => {
  it('allows known placeholder/example values (FAKE PLACEHOLDER -> permitido)', () => {
    expect(names("const secret = 'minha-chave-secreta';")).toEqual([]);
    expect(names("const dbPassword = 'admin123';")).toEqual([]);
    expect(names('JWT_SECRET=replace-with-a-long-random-secret')).toEqual([]);
    expect(names('API_KEY=your-api-key-here')).toEqual([]);
    expect(names('TOKEN=CHANGEME')).toEqual([]);
    expect(names('DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE')).toEqual([]);
  });

  it('allows this repository own disposable local/CI test fixtures', () => {
    expect(names('POSTGRES_PASSWORD: travel_test_password')).toEqual([]);
    expect(names("const runtimePassword = 'travel_app_runtime_local_password';")).toEqual([]);
  });

  it('does not flag a bare env-var reference with no value', () => {
    expect(names('  - [ ] JWT_SECRET não exposto')).toEqual([]);
  });
  it('allows angle-bracket documentation placeholders with spaces', () => {
    expect(names('  - CONNECTOR_META_ACCESS_TOKEN=<page/user access token>')).toEqual([]);
  });

  it('allows cryptographic token generation code instead of treating the generator as a secret', () => {
    expect(names("const token = randomBytes(32).toString('base64url');")).toEqual([]);
  });

  // Repository stabilization pass (CI-02): the scanner was flagging ~80
  // lines across the real auth modules (local-auth.ts, customer-local-
  // auth.ts, session-auth.ts, routes/auth.ts, apps/*/lib/*Api.ts) even
  // though every one of them was either a function call or a plain
  // variable reference, never a literal secret.
  it('allows a bare function-call value (the char right after it is an opening paren)', () => {
    expect(names('  const token = getSessionToken();')).toEqual([]);
    expect(names("  const rawToken = generateOpaqueToken();")).toEqual([]);
    expect(names("    const password = requireString(body.password, 'password');")).toEqual([]);
  });

  it('allows a bare identifier named after the keyword itself (not a literal value)', () => {
    expect(names('    sessionToken: rawToken,')).toEqual([]);
    expect(names("      payload: { agencySlug: agencySlugA, email: ownerAEmail, password: ownerAPassword },")).toEqual([]);
    expect(names('    return { activationToken: rawToken, expiresAt, email };')).toEqual([]);
  });

  it('still detects a real-looking mixed-case value even though it superficially resembles an identifier', () => {
    // Regression guard: an earlier version of this fix used a blanket
    // "bare camelCase identifier" rule, which incorrectly swallowed real
    // secret-shaped values like this one (no keyword suffix, not a call).
    expect(names('DB_PASSWORD=pR7mK2vLq9XnW4tZbYcQ2x')).toContain('PASSWORD');
  });
});

describe('secrets scanner: filesystem traversal scope', () => {
  it('skips nested worktree directories so historical branches do not drown active findings', () => {
    expect(shouldIgnoreDirectory('.worktrees')).toBe(true);
    expect(shouldIgnoreDirectory('node_modules')).toBe(true);
    expect(shouldIgnoreDirectory('services')).toBe(false);
  });
});

describe('secrets scanner: structural detection (REALISTIC SECRET PATTERN -> detectado)', () => {
  it('detects SCREAMING_SNAKE_CASE-prefixed names (previously the biggest gap)', () => {
    expect(names('GITHUB_TOKEN=ghp_9fJ2kLpQ7xZmN4vR8tYcW1bAxxxxxxxxxxxxx')).toContain(
      'GITHUB_TOKEN',
    );
    expect(names('SLACK_BOT_TOKEN=xoxb-1234567890123-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx')).toContain(
      'SLACK_TOKEN',
    );
    expect(names('DB_PASSWORD=pR7mK2vLq9XnW4tZbYcQ2x')).toContain('PASSWORD');
    expect(names('APP_API_KEY=sk_live_9fJ2kLpQ7xZmN4vR8tYcW1bA')).toContain('API_KEY');
  });

  it('detects camelCase identifiers', () => {
    expect(names('apiKey = "sk_live_9fJ2kLpQ7xZmN4vR8tYcW1bA"')).toContain('API_KEY');
    expect(names('const clientSecret = "9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c";')).toContain('SECRET');
  });

  it('detects a password containing symbols instead of truncating at them', () => {
    const findings = evaluateLine('password="Summer2024!"');
    expect(findings.map((f) => f.pattern)).toContain('PASSWORD');
  });

  it('detects a short but real-looking password (entropy is not the gate)', () => {
    expect(names('PASSWORD=Tr0ub4dor')).toContain('PASSWORD');
  });

  it('detects credentials embedded in a database connection string', () => {
    expect(
      names('DATABASE_URL=postgresql://admin:Sup3rS3cr3tPass9@db.prod.internal:5432/app'),
    ).toContain('CONNECTION_STRING_CREDENTIALS');
  });

  it('detects a bare JWT with no keyword prefix at all', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(names(`const auth = "${jwt}";`)).toContain('JWT');
    expect(names(jwt)).toContain('JWT');
  });

  it('detects GitHub-style tokens', () => {
    expect(names('token = ghp_16C7e42F292c6912E7710c838347Ae178B4axxxx')).toContain(
      'GITHUB_TOKEN',
    );
    expect(names('github_pat_11ABCDEFG0123456789abcdefghijklmnopqrstuvwxyz')).toContain(
      'GITHUB_TOKEN',
    );
  });

  it('detects AWS-style credentials', () => {
    expect(names('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE')).toContain('AWS_ACCESS_KEY_ID');
    expect(
      names('aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'),
    ).toContain('AWS_SECRET_ACCESS_KEY');
  });

  it('detects a PEM private key header', () => {
    expect(names('-----BEGIN RSA PRIVATE KEY-----')).toContain('PEM_PRIVATE_KEY');
    expect(names('-----BEGIN PRIVATE KEY-----')).toContain('PEM_PRIVATE_KEY');
    expect(names('PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----"')).toEqual(
      expect.arrayContaining(['PEM_PRIVATE_KEY']),
    );
  });
});

describe('secrets scanner: entropy is auxiliary metadata only', () => {
  it('attaches entropy to a finding without using it to decide inclusion', () => {
    const findings = evaluateLine('PASSWORD=Tr0ub4dor');
    const passwordFinding = findings.find((f) => f.pattern === 'PASSWORD');

    expect(passwordFinding).toBeDefined();
    expect(typeof passwordFinding?.entropy).toBe('number');
  });

  it('reports null entropy for marker-only findings with no discrete captured value', () => {
    const findings = evaluateLine('-----BEGIN RSA PRIVATE KEY-----');
    expect(findings[0]?.entropy).toBeNull();
  });

  it('still exposes shannonEntropy directly for calibration/debugging', () => {
    expect(shannonEntropy('')).toBe(0);
    expect(shannonEntropy('aaaaaaaaaaaaaaaa')).toBeCloseTo(0, 5);
    expect(shannonEntropy('Kx9mQ2vLp8AnR4wZ7tYcF3Q')).toBeGreaterThan(3.0);
  });
});

describe('secrets scanner: placeholder helpers', () => {
  it('treats curated placeholder values and generic placeholder patterns as safe', () => {
    expect(isKnownPlaceholder('minha-chave-secreta')).toBe(true);
    expect(isKnownPlaceholder('admin123')).toBe(true);
    expect(isKnownPlaceholder('changeme')).toBe(true);
    expect(isKnownPlaceholder('your-secret-here')).toBe(true);
    expect(isKnownPlaceholder('example-token-value')).toBe(true);
    expect(isKnownPlaceholder('PASSWORD')).toBe(true);
    expect(isKnownPlaceholder('travel_test_password')).toBe(true);
    expect(isKnownPlaceholder('Kx9mQ2vLp8AnR4wZ7tYcF3Q')).toBe(false);
    expect(isKnownPlaceholder('Tr0ub4dor')).toBe(false);
  });

  it('does not let the placeholder denylist swallow an unrelated real-looking value', () => {
    // "admin123" is an accepted example value; a value that merely
    // resembles it in shape but isn't the literal denylisted string must
    // still be evaluated normally.
    expect(isKnownPlaceholder('admin1234567890realvalue')).toBe(false);
    expect(isLikelySecretValue('admin1234567890realvalue')).toBe(true);
  });

  it('isLikelySecretValue is placeholder-gated, not entropy-gated', () => {
    expect(isLikelySecretValue('admin123')).toBe(false);
    expect(isLikelySecretValue('Tr0ub4dor')).toBe(true);
    expect(isLikelySecretValue('Kx9mQ2vLp8AnR4wZ7tYcF3Q')).toBe(true);
  });
});
