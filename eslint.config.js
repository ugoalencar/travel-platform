const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');
const reactRefresh = require('eslint-plugin-react-refresh');
const prettier = require('eslint-config-prettier');

const tsProjectFiles = [
  'apps/**/*.{ts,tsx}',
  'services/**/*.{ts,tsx}',
  'packages/**/*.{ts,tsx}',
  'tests/**/*.{ts,tsx}',
  'vitest.config.ts',
  'vitest.database.config.ts',
];

const nodeGlobals = {
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  clearImmediate: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  exports: 'writable',
  module: 'readonly',
  process: 'readonly',
  require: 'readonly',
  setImmediate: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  // Built into Node 18+ (no import needed) -- used by staging/ops scripts
  // (e.g. scripts/e2e-smoke.mjs) that call the real API over HTTP.
  fetch: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
};

const vitestGlobals = {
  afterEach: 'readonly',
  beforeEach: 'readonly',
  describe: 'readonly',
  expect: 'readonly',
  it: 'readonly',
  test: 'readonly',
  vi: 'readonly',
};

module.exports = tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.turbo/**',
      'docs/source/**'
    ]
  },
  {
    ...js.configs.recommended,
    files: ['**/*.{js,cjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: nodeGlobals,
      sourceType: 'commonjs',
    },
  },
  {
    ...js.configs.recommended,
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: nodeGlobals,
      sourceType: 'module',
    },
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: tsProjectFiles,
  })),
  {
    files: tsProjectFiles,
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}', '**/*.{test,spec}.{ts,tsx}'],
    languageOptions: {
      globals: vitestGlobals,
    },
  },
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  prettier
);
