const { spawn, spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const apiRoot = resolve(__dirname, '..');
const nodeEnv = process.env.NODE_ENV ?? 'development';

if (nodeEnv === 'production') {
  console.error('Refusing to run the Travel Lite API dev server with NODE_ENV=production.');
  process.exit(1);
}

const env = {
  ...process.env,
  NODE_ENV: nodeEnv,
  HOST: process.env.HOST ?? '127.0.0.1',
  PORT: process.env.PORT ?? '4010',
};

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const build = spawnSync(npmCommand, ['run', 'build'], {
  cwd: apiRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (build.status !== 0) {
  console.error(`Failed to build the Travel Lite API: ${build.error ?? 'build failed'}`);
  process.exit(build.status ?? 1);
}

const server = spawn(process.execPath, [resolve(apiRoot, 'dist/services/api-lite/src/server.js')], {
  cwd: apiRoot,
  stdio: 'inherit',
  env,
});

server.on('exit', (code) => process.exit(code ?? 0));
