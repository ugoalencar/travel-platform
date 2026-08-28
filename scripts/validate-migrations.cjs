const fs = require('node:fs');
const path = require('node:path');

const migrationsDir = path.join(process.cwd(), 'infrastructure', 'migrations');

if (!fs.existsSync(migrationsDir)) {
  console.log('No migrations directory found.');
  process.exit(0);
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.error('No SQL migration files found.');
  process.exit(1);
}

const invalidNames = files.filter((file) => !/^\d{3}_[a-z0-9_]+\.sql$/.test(file));

if (invalidNames.length > 0) {
  console.error('Invalid migration file names:');
  invalidNames.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

const prefixes = new Map();
for (const file of files) {
  const prefix = file.slice(0, 3);
  const existing = prefixes.get(prefix) ?? [];
  existing.push(file);
  prefixes.set(prefix, existing);
}

const duplicatePrefixes = [...prefixes.entries()].filter(([, names]) => names.length > 1);

if (duplicatePrefixes.length > 0) {
  console.error('Duplicate migration prefixes found:');
  duplicatePrefixes.forEach(([prefix, names]) => {
    console.error(`- ${prefix}: ${names.join(', ')}`);
  });
  process.exit(1);
}

const expectedPrefix = (index) => String(index + 1).padStart(3, '0');
const outOfSequence = files.filter((file, index) => !file.startsWith(`${expectedPrefix(index)}_`));

if (outOfSequence.length > 0) {
  console.error('Migration files are not sequential:');
  files.forEach((file, index) => console.error(`- expected ${expectedPrefix(index)}_*, found ${file}`));
  process.exit(1);
}

console.log(`Migration files found: ${files.length}`);
files.forEach((file) => console.log(`- ${file}`));
