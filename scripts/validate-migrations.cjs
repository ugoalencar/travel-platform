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

console.log(`Migration files found: ${files.length}`);
files.forEach((file) => console.log(`- ${file}`));
