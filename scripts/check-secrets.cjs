const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const ignoredDirs = new Set([
  '.git',
  '.turbo',
  'node_modules',
  'dist',
  'build',
  'coverage',
]);

const allowedFiles = new Set(['.env.example']);
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

const patterns = [
  /(?<![A-Z0-9_])API_KEY\s*[:=]\s*['"]?[A-Za-z0-9_-]{16,}/i,
  /(?<![A-Z0-9_])SECRET\s*[:=]\s*['"]?[A-Za-z0-9_-]{16,}/i,
  /(?<![A-Z0-9_])PASSWORD\s*[:=]\s*['"]?[A-Za-z0-9_-]{8,}/i,
  /(?<![A-Z0-9_])TOKEN\s*[:=]\s*['"]?[A-Za-z0-9_-]{16,}/i,
  /(?<![A-Z0-9_])PRIVATE_KEY\s*[:=]\s*['"]?[A-Za-z0-9_-]{16,}/i,
  /AWS_SECRET_ACCESS_KEY\s*[:=]\s*['"]?[A-Za-z0-9/+=]{40}/i,
];

const findings = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(root, fullPath);

    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        walk(fullPath);
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
      if (patterns.some((pattern) => pattern.test(line))) {
        findings.push(`${relativePath}:${index + 1}`);
      }
    });
  }
}

walk(root);

if (findings.length > 0) {
  console.error('Possible secrets found:');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log('No obvious secrets found.');
