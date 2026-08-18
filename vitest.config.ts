import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@apps': new URL('./apps', import.meta.url).pathname,
      '@services': new URL('./services', import.meta.url).pathname,
      '@packages': new URL('./packages', import.meta.url).pathname,
      '@domain': new URL('./packages/domain', import.meta.url).pathname,
      '@database': new URL('./packages/database', import.meta.url).pathname,
      '@shared': new URL('./packages/shared', import.meta.url).pathname,
      '@validation': new URL('./packages/validation', import.meta.url).pathname,
      '@config': new URL('./packages/config', import.meta.url).pathname
    }
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts', 'packages/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      'build',
      'coverage',
      '.turbo',
      'tests/integration/database/**/*.integration.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      exclude: [
        'node_modules/**',
        'dist/**',
        'build/**',
        'coverage/**',
        '**/*.config.*',
        'docs/**',
        'infrastructure/**'
      ]
    }
  }
});
