const { spawn, spawnSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const apiRoot = resolve(__dirname, '..');
const repoRoot = resolve(apiRoot, '..', '..');
const nodeEnv = process.env.NODE_ENV ?? 'development';

if (nodeEnv === 'production') {
  console.error('Refusing to run the local API dev server with NODE_ENV=production.');
  process.exit(1);
}

const envLocalPath = resolve(repoRoot, '.env.local');
if (existsSync(envLocalPath)) {
  const envContent = readFileSync(envLocalPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    const normalizedKey = key.trim();
    if (normalizedKey && !process.env[normalizedKey]) {
      process.env[normalizedKey] = valueParts.join('=').trim();
    }
  }
}

const env = {
  ...process.env,
  NODE_ENV: nodeEnv,
  ALLOW_DEV_AUTH: process.env.ALLOW_DEV_AUTH ?? 'true',
  HOST: process.env.HOST ?? '127.0.0.1',
  PORT: process.env.PORT ?? '4000',
  DATABASE_URL:
    process.env.DATABASE_URL ??
    'postgresql://travel_test:travel_test_password@127.0.0.1:55432/travel_platform_test',
};

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const build = spawnSync(npmCommand, ['run', 'build'], {
  cwd: apiRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (build.status !== 0) {
  if (build.error) {
    console.error(`Failed to start local API build: ${build.error.message}`);
  }

  process.exit(build.status ?? 1);
}

const server = spawn(process.execPath, [resolve(apiRoot, 'dist/services/api/src/server.js')], {
  cwd: apiRoot,
  env,
  stdio: 'inherit',
});

const stopServer = (signal) => {
  if (!server.killed) {
    server.kill(signal);
  }
};

process.on('SIGINT', () => stopServer('SIGINT'));
process.on('SIGTERM', () => stopServer('SIGTERM'));

server.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
