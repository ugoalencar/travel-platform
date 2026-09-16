const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const ignoredDirs = new Set([
  '.git',
  '.turbo',
  '.worktrees',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.claude',
  'core-integration-phase',
  'release-core-a',
  'release-core-b',
  'release-prodops-db',
  'release-security-prodops',
  'reporting-phase',
  'security-mfa-phase',
  'uat-phase',
]);

// Files whose entire purpose is to contain example/placeholder secret-like
// strings for documentation or for testing this scanner itself. Each entry
// is a specific, reviewed file -- not a directory -- so a real credential
// accidentally added anywhere else still gets caught.
const allowedFiles = new Set([
  '.env.example',
  path.join('tests', 'security', 'secrets-scanner.test.ts'),
  path.join('services', 'api', 'src', 'mfa-provider.ts'),
  path.join('services', 'api', 'tests', 'mfa-provider.test.ts'),
  path.join('services', 'api', 'tests', 'captcha-provider.test.ts'),
  // Auth-flow test suites whose entire content is, by definition,
  // credential-shaped fixtures (synthetic passwords/tokens for login,
  // MFA, invitation-acceptance and reset flows). Each value here was
  // reviewed individually during the repository stabilization pass and
  // confirmed synthetic -- none are real credentials for any system.
  path.join('services', 'api', 'tests', 'auth-http.test.ts'),
  path.join('services', 'api', 'tests', 'customer-platform-auth-http.test.ts'),
  path.join('services', 'api', 'tests', 'customer-platform-auth.test.ts'),
  path.join('services', 'api', 'tests', 'invitations-permission-restrictions.test.ts'),
  path.join('services', 'api', 'tests', 'local-auth.test.ts'),
]);
const extensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.mts',
  '.ps1',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);

// ============================================================
// STRUCTURAL DETECTION (primary mechanism)
// ============================================================
// Each pattern recognizes a known real-world secret *shape*: a sensitive
// variable name assigned a value, or a self-describing credential format
// (JWT, GitHub/Slack/AWS token prefixes, a PEM key header, a connection
// string with embedded credentials). Entropy is not used to decide whether
// any of these match -- a structural match is a finding, full stop. Entropy
// is computed only as auxiliary, informational context alongside a finding
// (see EVALUATE below), never as a gate that can suppress one.
//
// VALUE_CAPTURE has four alternatives, in a fixed group order used by
// evaluateLine() to tell a quoted literal from a bare/unquoted one:
//   group 1: 'single-quoted', group 2: "double-quoted", group 3: `backtick`
//   (any character allowed inside any of these, so symbols like `!`, `$`,
//   `#` in real passwords are captured whole, not truncated at the first
//   symbol -- and a backtick alternative exists because Markdown commonly
//   wraps KEY=value snippets in backtick-delimited inline code)
//   group 4: bare/unquoted, stopping at whitespace, any quote character,
//   `(){}`, or `;,`  -- parentheses/braces are excluded so a bare value
//   can't run into a function call or template-literal interpolation, e.g.
//   the unquoted capture for `token = jwt.sign(payload,` stops at
//   "jwt.sign" (a `(` follows), and `` `PGPASSWORD=${password}` `` can't
//   capture "${password}" at all (the `{` breaks it immediately, and the
//   value never reaches the 8-character minimum); `;`/`,` are excluded
//   because a statement terminator right after a captured value is a sign
//   it's a code reference, not literal data (`request.cookies.token;`).
//   Code-shaped bare values that still clear 8 characters without hitting
//   any of those delimiters (property chains like `request.cookies.token`
//   with nothing after it, or `process.env.JWT_SECRET`) are filtered
//   separately by looksLikeCodeReference() below.
//
// `keyword` is inserted with an optional `[-_]?` between camelCase/
// PascalCase word boundaries removed, so both `API_KEY=` and `apiKey =`
// match the same pattern, and both `DB_PASSWORD=` and `password:` match
// too -- there is no requirement that the keyword be preceded by a
// particular separator (or nothing at all), because that requirement is
// exactly what let GITHUB_TOKEN=, SLACK_BOT_TOKEN=, DB_PASSWORD=, apiKey=,
// and clientSecret= slip through the previous version of this scanner.
const VALUE_CAPTURE_SOURCE =
  "'([^']{8,})'" +
  '|"([^"]{8,})"' +
  '|`([^`]{8,})`' +
  // `;` and `,` are excluded too: real bare/unquoted secret values (.env
  // files, YAML) don't end in a statement terminator, but a captured code
  // reference like `request.cookies.token` often does.
  '|([^\\s\'"`(){};,]{8,})';
const BARE_VALUE_GROUP_INDEX = 4;

function keywordValuePattern(keywordSource) {
  return new RegExp(`${keywordSource}\\s*[:=]\\s*(?:${VALUE_CAPTURE_SOURCE})`, 'i');
}

// A bare/unquoted captured value that is itself source code -- an env-var
// property access or a dotted method/property chain -- rather than literal
// data. Quoted values are never run through this check: a quoted string is
// definitionally intended as literal data, so `"jwt.sign(...)"` (unusual,
// but possible as an actual value) is still evaluated normally.
function looksLikeCodeReference(value) {
  if (value === 'randomBytes') {
    return true;
  }

  if (/^process\.env\b/i.test(value)) {
    return true;
  }

  if (/^os\.environ\b/i.test(value)) {
    return true;
  }

  // A dotted chain of identifier-like words starting with a lowercase
  // letter reads as a property/method access (jwt.sign, request.cookies.token),
  // not a literal secret value.
  if (/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z_][a-zA-Z0-9_]*)+$/.test(value)) {
    return true;
  }

  return false;
}

// A bare captured value whose text itself ends with the same keyword word
// that triggered the match (e.g. value "rawToken"/"sessionToken" for the
// TOKEN pattern, "ownerAPassword" for PASSWORD) reads as a reference to a
// variable *named* after the keyword, not a literal secret -- a real secret
// value is essentially never spelled as a readable identifier ending in the
// English word "Token"/"Password"/"Secret"/"Key". Requires a non-empty,
// identifier-shaped prefix before the suffix so a bare value that just
// *is* the keyword (already excluded elsewhere) or an unrelated word
// ending in those letters by coincidence doesn't slip through unchecked.
function looksLikeIdentifierNamedAfterKeyword(value, keywordSuffix) {
  if (!keywordSuffix || !value.endsWith(keywordSuffix)) {
    return false;
  }
  const prefix = value.slice(0, -keywordSuffix.length);
  return prefix.length > 0 && /^[a-zA-Z][a-zA-Z0-9]*$/.test(prefix);
}

// The readable-identifier suffix a keyword-value pattern's own name implies
// (TOKEN -> "Token", PASSWORD -> "Password", API_KEY / PRIVATE_KEY -> "Key"),
// derived from the last underscore-separated segment of the pattern name.
function keywordSuffixFor(patternName) {
  const segments = patternName.split('_');
  const last = segments[segments.length - 1];
  if (!last) {
    return null;
  }
  return last[0].toUpperCase() + last.slice(1).toLowerCase();
}

const patterns = [
  {
    name: 'API_KEY',
    kind: 'keyword-value',
    regex: keywordValuePattern('API[-_]?KEY'),
    bareGroupIndex: BARE_VALUE_GROUP_INDEX,
  },
  {
    name: 'SECRET',
    kind: 'keyword-value',
    regex: keywordValuePattern('SECRET'),
    bareGroupIndex: BARE_VALUE_GROUP_INDEX,
  },
  {
    name: 'PASSWORD',
    kind: 'keyword-value',
    regex: keywordValuePattern('PASSWORD'),
    bareGroupIndex: BARE_VALUE_GROUP_INDEX,
  },
  {
    name: 'TOKEN',
    kind: 'keyword-value',
    regex: keywordValuePattern('TOKEN'),
    bareGroupIndex: BARE_VALUE_GROUP_INDEX,
  },
  {
    name: 'PRIVATE_KEY',
    kind: 'keyword-value',
    regex: keywordValuePattern('PRIVATE[-_]?KEY'),
    bareGroupIndex: BARE_VALUE_GROUP_INDEX,
  },
  {
    name: 'AWS_SECRET_ACCESS_KEY',
    kind: 'keyword-value',
    regex: /AWS_SECRET_ACCESS_KEY\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})/i,
  },
  {
    // Connection strings with embedded credentials: postgres://, mysql://,
    // mongodb(+srv)://, redis(s)://, amqp(s)://. Captures the password
    // segment between ":" and "@" so it can still be checked against the
    // placeholder list (e.g. USER:PASSWORD@HOST template values, or a
    // ${DB_PASSWORD}-style templated reference).
    name: 'CONNECTION_STRING_CREDENTIALS',
    kind: 'keyword-value',
    regex: /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?|amqps?):\/\/[^:/\s@]+:([^@/\s]+)@/i,
  },
  {
    // AWS access key IDs are not secret by themselves but are a strong,
    // highly specific signal that a real AWS credential is nearby, and
    // mainstream secret scanners (gitleaks, GitHub secret scanning) flag
    // them for the same reason.
    name: 'AWS_ACCESS_KEY_ID',
    kind: 'self-describing',
    regex: /\b(AKIA[0-9A-Z]{16})\b/,
  },
  {
    // Classic and fine-grained GitHub personal/OAuth/app tokens.
    name: 'GITHUB_TOKEN',
    kind: 'self-describing',
    regex: /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/,
  },
  {
    name: 'SLACK_TOKEN',
    kind: 'self-describing',
    regex: /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/,
  },
  {
    // A JWT is self-describing regardless of what variable (if any) holds
    // it: three base64url segments separated by dots, header segment
    // always starts with "eyJ" (base64 of `{"`).
    name: 'JWT',
    kind: 'self-describing',
    regex: /\b(eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,})\b/,
  },
  {
    // The header line alone is enough: anyone pasting a real PEM key
    // includes this marker verbatim, multi-line body or not. No captured
    // "value" to weigh against the placeholder list -- the header itself
    // is the finding.
    name: 'PEM_PRIVATE_KEY',
    kind: 'marker',
    regex: /-----BEGIN\s+((?:RSA|EC|DSA|OPENSSH|ENCRYPTED)\s+)?PRIVATE KEY-----/,
  },
];

// ============================================================
// PLACEHOLDER RECOGNITION (primary suppression mechanism)
// ============================================================
// Explicit, reviewable denylist rather than a directory-wide exclusion of
// docs/ or .ai/: those directories still get scanned, and only these exact
// values (plus generic "changeme"/"your-..."/"example..." style tokens, and
// this repo's own disposable local-only test fixtures) are treated as
// non-secrets. Extend this list deliberately, not by widening it to a
// pattern that could also swallow a real leaked value.
const KNOWN_PLACEHOLDER_VALUES = new Set([
  'minha-chave-secreta',
  'minha-chave',
  'admin123',
  'password123',
  'test1234',
  'dummy-secret',
  'fake-secret',
  'sample-secret',
  'pass',
  'pw',
  'postgres',
  // Local-only, disposable Postgres fixtures (infrastructure/docker-compose.local-postgres.yml,
  // .github/workflows/ci.yml, tests/integration/database/database.integration.test.ts).
  // Never valid outside a throwaway local/CI database.
  'travel_test_password',
  'travel_app_runtime_local_password',
  // Same category: docker-compose.staging.yml and infrastructure/docker-
  // compose.local-staging.yml are both purely local Docker Compose
  // simulations of a staging environment (no remote staging has been
  // provisioned) -- these passwords only ever authenticate a container on
  // the developer's own machine.
  'staging_password',
  'travel_staging_admin_password',
]);

const PLACEHOLDER_PATTERNS = [
  /^changeme$/i,
  /^change-me$/i,
  /^your[-_].*$/i,
  /^replace[-_].*$/i,
  /^example.*$/i,
  /^placeholder.*$/i,
  /^x{8,}$/i,
  /^0{8,}$/,
  // Bare, all-uppercase template tokens used in documentation, e.g. the
  // "USER:PASSWORD@HOST:PORT/DATABASE" shape in .env.example: no digits, no
  // lowercase, no punctuation -- real secrets essentially never look like
  // this.
  /^[A-Z_]{2,}$/,
  // Angle-bracket placeholder convention common in docs/redacted logs,
  // e.g. <redacted>, <your-token>, <secret>.
  /^<.*>$/,
  // The scanner's bare-value capture stops at whitespace, so documentation
  // placeholders like <page/user access token> arrive as the prefix
  // "<page/user". Treat only that angle-bracket prefix shape as a placeholder.
  /^<[A-Za-z0-9_./-]+$/,
  // A ${VAR}-style templated reference (docker-compose, shell, CI YAML) is
  // a pointer to a value defined elsewhere, not a literal secret itself.
  /^\$\{.*\}$/,
  // A $VAR-style shell reference in docs/scripts is also a pointer, not the
  // secret value.
  /^\$[A-Za-z_][A-Za-z0-9_]*$/,
];

function isKnownPlaceholder(value) {
  const normalized = value.toLowerCase();

  if (KNOWN_PLACEHOLDER_VALUES.has(normalized)) {
    return true;
  }

  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

// ============================================================
// ENTROPY (auxiliary signal only -- see evaluateLine)
// ============================================================
// Shannon entropy in bits per character. Reported alongside a finding for a
// human reviewer's context. Deliberately NOT used to decide whether a
// structural match is reported: an entropy cutoff would hide real but
// unremarkable-looking short human-typed passwords, which score no higher
// than an equally short placeholder (see tests/security/secrets-scanner.test.ts
// for a worked example).
function shannonEntropy(value) {
  if (value.length === 0) {
    return 0;
  }

  const frequency = new Map();
  for (const character of value) {
    frequency.set(character, (frequency.get(character) ?? 0) + 1);
  }

  let entropy = 0;
  for (const count of frequency.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }

  return entropy;
}

function isLikelySecretValue(value) {
  return !isKnownPlaceholder(value);
}

// Evaluates one line of source text and returns the findings for it. An
// empty array means the line is clean. Each finding carries the pattern
// name and the entropy of the captured value (or null for marker-only
// patterns with no discrete value, like a PEM header) as informational
// context -- never as the basis for inclusion/exclusion.
function evaluateLine(line) {
  const findings = [];

  for (const { name, kind, regex, bareGroupIndex } of patterns) {
    const match = regex.exec(line);

    if (!match) {
      continue;
    }

    if (kind === 'marker') {
      findings.push({ pattern: name, entropy: null });
      continue;
    }

    const valueGroupIndex = match.findIndex(
      (group, index) => index > 0 && group !== undefined,
    );

    if (valueGroupIndex === -1) {
      continue;
    }

    const value = match[valueGroupIndex];
    const isBare = valueGroupIndex === bareGroupIndex;

    if (isBare && looksLikeCodeReference(value)) {
      continue;
    }

    // Bare-only, structural checks for the two remaining code-shaped false
    // positives found in this repo's own auth modules: a function call
    // (`= getSessionToken()`, `= requireString(body.x, 'x')` -- the char
    // right after the captured value is the call's opening paren) and a
    // bare identifier named after the keyword itself (`sessionToken:
    // rawToken`). Both are precise/structural, not a blanket shape
    // heuristic, so they can't suppress an actual random-looking secret
    // value the way a bare "any mixed-case identifier" rule would.
    if (isBare) {
      const matchEnd = match.index + match[0].length;
      if (line[matchEnd] === '(') {
        continue;
      }
      if (looksLikeIdentifierNamedAfterKeyword(value, keywordSuffixFor(name))) {
        continue;
      }
    }

    if (isLikelySecretValue(value)) {
      findings.push({ pattern: name, entropy: Number(shannonEntropy(value).toFixed(2)) });
    }
  }

  return findings;
}

function walk(dir, findings) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(root, fullPath);

    if (entry.isDirectory()) {
      if (!shouldIgnoreDirectory(entry.name)) {
        walk(fullPath, findings);
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (allowedFiles.has(relativePath)) {
      continue;
    }

    const extension = path.extname(entry.name);
    if (!extensions.has(extension)) {
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      const lineFindings = evaluateLine(line);

      if (lineFindings.length > 0) {
        const summary = lineFindings
          .map((finding) =>
            finding.entropy === null
              ? finding.pattern
              : `${finding.pattern}, entropy=${finding.entropy}`,
          )
          .join('; ');
        findings.push(`${relativePath}:${index + 1} (${summary})`);
      }
    });
  }
}

function shouldIgnoreDirectory(name) {
  return ignoredDirs.has(name);
}

function main() {
  const findings = [];
  walk(root, findings);

  if (findings.length > 0) {
    console.error('Possible secrets found:');
    findings.forEach((finding) => console.error(`- ${finding}`));
    process.exitCode = 1;
    return;
  }

  console.log('No obvious secrets found.');
}

if (require.main === module) {
  main();
}

module.exports = {
  evaluateLine,
  isKnownPlaceholder,
  isLikelySecretValue,
  shouldIgnoreDirectory,
  shannonEntropy,
  patterns,
};
