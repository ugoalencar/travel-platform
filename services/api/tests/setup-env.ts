// Global test-only environment defaults. Vitest never loads .env files on
// its own (no dotenv wiring in this project), so any env var a module
// requires unconditionally (fail-closed) must be provided here for tests
// to run at all -- this is not a real secret, never used outside the test
// process, and must never be reused in staging/production.
process.env.MFA_ENCRYPTION_KEY ??= 'test-only-mfa-encryption-key-do-not-use-in-prod-32chars';
