import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmailProvider, resetEmailProviderCacheForTests } from '../src/email/factory';
import { EmailProviderNotConfiguredError, EmailProviderSendError } from '../src/email/types';
import { DevLogEmailProvider } from '../src/email/dev-log-provider';
import { ResendEmailProvider } from '../src/email/resend-provider';
import { UnconfiguredEmailProvider } from '../src/email/unconfigured-provider';
import * as emailIndex from '../src/email/index';

describe('createEmailProvider (factory)', () => {
  afterEach(() => {
    resetEmailProviderCacheForTests();
    vi.unstubAllGlobals();
  });

  it('uses ResendEmailProvider whenever RESEND_API_KEY and EMAIL_FROM are set, regardless of NODE_ENV', () => {
    const provider = createEmailProvider({
      NODE_ENV: 'development',
      RESEND_API_KEY: 'test-key',
      EMAIL_FROM: 'no-reply@example.test',
    });
    expect(provider).toBeInstanceOf(ResendEmailProvider);
  });

  it('fails closed (UnconfiguredEmailProvider) in production without a real provider configured', () => {
    const provider = createEmailProvider({ NODE_ENV: 'production' });
    expect(provider).toBeInstanceOf(UnconfiguredEmailProvider);
  });

  it('fails closed (UnconfiguredEmailProvider) in staging without a real provider configured', () => {
    const provider = createEmailProvider({ NODE_ENV: 'staging' });
    expect(provider).toBeInstanceOf(UnconfiguredEmailProvider);
  });

  it('fails closed when EMAIL_REQUIRE_REAL=true even outside production/staging', () => {
    const provider = createEmailProvider({
      NODE_ENV: 'development',
      EMAIL_REQUIRE_REAL: 'true',
    });
    expect(provider).toBeInstanceOf(UnconfiguredEmailProvider);
  });

  it('falls back to DevLogEmailProvider in plain development with no provider configured', () => {
    const provider = createEmailProvider({ NODE_ENV: 'development' });
    expect(provider).toBeInstanceOf(DevLogEmailProvider);
  });

  it('UnconfiguredEmailProvider.send() always throws EMAIL_PROVIDER_NOT_CONFIGURED, never fakes success', async () => {
    const provider = new UnconfiguredEmailProvider();
    await expect(provider.send({ to: 'a@b.test', subject: 's', html: '<p/>', text: 't' })).rejects.toBeInstanceOf(
      EmailProviderNotConfiguredError,
    );
  });
});

describe('DevLogEmailProvider', () => {
  it('never sends a real email and never logs the HTML/text body (may contain a real link/token)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const provider = new DevLogEmailProvider();
    const result = await provider.send({
      to: 'someone@example.test',
      subject: 'Redefinição de senha',
      html: '<a href="https://example.test/reset?token=SUPER-SECRET-TOKEN">link</a>',
      text: 'https://example.test/reset?token=SUPER-SECRET-TOKEN',
    });
    expect(result.provider).toBe('dev-log');
    const loggedPayload = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(loggedPayload).not.toContain('SUPER-SECRET-TOKEN');
    logSpy.mockRestore();
  });
});

describe('ResendEmailProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends via the real Resend REST endpoint and never leaks the API key in the returned result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'resend-message-id-123' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new ResendEmailProvider({ apiKey: 'sk_live_super_secret', from: 'no-reply@example.test' });
    const result = await provider.send({ to: 'a@b.test', subject: 's', html: '<p/>', text: 't' });

    expect(result).toEqual({ provider: 'resend', messageId: 'resend-message-id-123' });
    expect(JSON.stringify(result)).not.toContain('sk_live_super_secret');

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer sk_live_super_secret');
  });

  it('throws EmailProviderSendError (never fakes success) when Resend rejects the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 422, json: () => Promise.resolve({}) }),
    );
    const provider = new ResendEmailProvider({ apiKey: 'k', from: 'no-reply@example.test' });
    await expect(provider.send({ to: 'a@b.test', subject: 's', html: '<p/>', text: 't' })).rejects.toBeInstanceOf(
      EmailProviderSendError,
    );
  });

  it('throws EmailProviderSendError on network failure/timeout without exposing the API key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const provider = new ResendEmailProvider({ apiKey: 'sk_super_secret', from: 'no-reply@example.test' });
    await expect(
      provider.send({ to: 'a@b.test', subject: 's', html: '<p/>', text: 't' }),
    ).rejects.toMatchObject({ message: expect.not.stringContaining('sk_super_secret') as unknown });
  });
});

describe('high-level email helpers (services/api/src/email/index.ts)', () => {
  const env = { NODE_ENV: 'development' };

  afterEach(() => {
    resetEmailProviderCacheForTests();
  });

  beforeEach(() => {
    resetEmailProviderCacheForTests();
  });

  it('sendEmployeeInvitationEmail builds a customer-portal accept-invitation link and sends it', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const result = await emailIndex.sendEmployeeInvitationEmail(
      { to: 'novo@agencia.test', token: 'abc123', agencyName: 'Agência Teste' },
      { ...env, CUSTOMER_PORTAL_URL: 'https://portal.example.test' },
    );
    expect(result.provider).toBe('dev-log');
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('email.employee_invitation.sent');
    logSpy.mockRestore();
  });

  it('sendStaffPasswordResetEmail builds an agency-app reset-password link', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const result = await emailIndex.sendStaffPasswordResetEmail(
      { to: 'owner@agencia.test', token: 'xyz789' },
      { ...env, APP_URL: 'https://agency.example.test' },
    );
    expect(result.provider).toBe('dev-log');
    expect(logSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('email.staff_password_reset.sent');
    logSpy.mockRestore();
  });

  it('sendCustomerPasswordResetEmail and sendCustomerActivationEmail build customer-portal links', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await emailIndex.sendCustomerPasswordResetEmail(
      { to: 'cliente@example.test', token: 't1' },
      { ...env, CUSTOMER_PORTAL_URL: 'https://portal.example.test' },
    );
    await emailIndex.sendCustomerActivationEmail(
      { to: 'cliente@example.test', token: 't2', agencyName: 'Agência Teste' },
      { ...env, CUSTOMER_PORTAL_URL: 'https://portal.example.test' },
    );
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('email.customer_password_reset.sent');
    expect(logged).toContain('email.customer_activation.sent');
    logSpy.mockRestore();
  });

  it('logs failures without ever logging the token, and rethrows so callers can react', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const prodEnv = { NODE_ENV: 'production' }; // no RESEND_API_KEY -> fail-closed

    await expect(
      emailIndex.sendEmployeeInvitationEmail({ to: 'a@b.test', token: 'SENSITIVE-TOKEN-VALUE' }, prodEnv),
    ).rejects.toThrow('EMAIL_PROVIDER_NOT_CONFIGURED');

    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('email.employee_invitation.failed');
    expect(logged).toContain('EMAIL_PROVIDER_NOT_CONFIGURED');
    expect(logged).not.toContain('SENSITIVE-TOKEN-VALUE');
    logSpy.mockRestore();
  });

  it('never logs an API key even when the Resend provider is used', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'msg-1' }) }),
    );
    await emailIndex.sendStaffPasswordResetEmail(
      { to: 'owner@agencia.test', token: 't' },
      { NODE_ENV: 'production', RESEND_API_KEY: 'sk_super_secret_key', EMAIL_FROM: 'x@y.test' },
    );
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).not.toContain('sk_super_secret_key');
    logSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
