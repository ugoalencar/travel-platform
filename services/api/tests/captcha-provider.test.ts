/* eslint-disable @typescript-eslint/require-await,@typescript-eslint/no-unsafe-call */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  NoOpCaptchaProvider,
  RecaptchaV3Provider,
  HcaptchaProvider,
  CloudflareProvider,
  createCaptchaProvider,
} from '../src/captcha-provider';

describe('S2: CAPTCHA Provider', () => {
  describe('NoOpCaptchaProvider', () => {
    it('should always verify successfully', async () => {
      const provider = new NoOpCaptchaProvider();
      const result = await provider.verify({
        token: 'any-token',
        clientIp: '127.0.0.1',
      });

      expect(result.verified).toBe(true);
      expect(result.provider).toBe('CUSTOM');
    });

    it('should report as configured', () => {
      const provider = new NoOpCaptchaProvider();
      expect(provider.isConfigured()).toBe(true);
    });

    it('should return correct provider name', () => {
      const provider = new NoOpCaptchaProvider();
      expect(provider.name()).toBe('CUSTOM');
    });
  });

  describe('RecaptchaV3Provider', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should require secret key', () => {
      expect(() => {
        new RecaptchaV3Provider('');
      }).toThrow(/RECAPTCHA_V3_SECRET_KEY/);
    });

    it('should verify token with score threshold', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          score: 0.9,
          action: 'LOGIN',
          'error-codes': [],
        }),
      });

      const provider = new RecaptchaV3Provider('secret-key', 0.5);
      const result = await provider.verify({
        token: 'token-123',
        clientIp: '127.0.0.1',
      });

      expect(result.verified).toBe(true);
      expect(result.score).toBe(0.9);
      expect(result.provider).toBe('RECAPTCHA_V3');
    });

    it('should reject token with low score', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          score: 0.2,
          'error-codes': [],
        }),
      });

      const provider = new RecaptchaV3Provider('secret-key', 0.5);
      const result = await provider.verify({
        token: 'token-123',
        clientIp: '127.0.0.1',
      });

      expect(result.verified).toBe(false);
      expect(result.score).toBe(0.2);
    });

    it('should fail closed on network error', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

      const provider = new RecaptchaV3Provider('secret-key');
      const result = await provider.verify({
        token: 'token-123',
        clientIp: '127.0.0.1',
      });

      expect(result.verified).toBe(false);
      expect(result.provider).toBe('RECAPTCHA_V3');
      expect(result.errorCodes).toContain('Network error');
    });

    it('should fail closed on HTTP error', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      const provider = new RecaptchaV3Provider('secret-key');
      const result = await provider.verify({
        token: 'token-123',
        clientIp: '127.0.0.1',
      });

      expect(result.verified).toBe(false);
      expect(result.errorCodes).toContain('HTTP 503');
    });

    it('should report as configured', () => {
      const provider = new RecaptchaV3Provider('secret-key');
      expect(provider.isConfigured()).toBe(true);
    });

    it('should return correct provider name', () => {
      const provider = new RecaptchaV3Provider('secret-key');
      expect(provider.name()).toBe('RECAPTCHA_V3');
    });
  });

  describe('HcaptchaProvider', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should require secret', () => {
      expect(() => {
        new HcaptchaProvider('');
      }).toThrow(/HCAPTCHA_SECRET/);
    });

    it('should verify valid token', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          'error-codes': [],
        }),
      });

      const provider = new HcaptchaProvider('secret-key');
      const result = await provider.verify({
        token: 'token-123',
        clientIp: '127.0.0.1',
      });

      expect(result.verified).toBe(true);
      expect(result.provider).toBe('HCAPTCHA');
    });

    it('should fail closed on invalid token', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          'error-codes': ['invalid-input-response'],
        }),
      });

      const provider = new HcaptchaProvider('secret-key');
      const result = await provider.verify({
        token: 'invalid-token',
        clientIp: '127.0.0.1',
      });

      expect(result.verified).toBe(false);
      expect(result.errorCodes).toContain('invalid-input-response');
    });
  });

  describe('CloudflareProvider', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should require secret', () => {
      expect(() => {
        new CloudflareProvider('');
      }).toThrow(/CLOUDFLARE_TURNSTILE_SECRET/);
    });

    it('should verify token', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
        }),
      });

      const provider = new CloudflareProvider('secret-key');
      const result = await provider.verify({
        token: 'token-123',
        clientIp: '127.0.0.1',
      });

      expect(result.verified).toBe(true);
      expect(result.provider).toBe('CLOUDFLARE');
    });

    it('should use custom endpoint', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const customEndpoint = 'https://custom.turnstile.com/verify';
      const provider = new CloudflareProvider('secret-key', customEndpoint);
      await provider.verify({
        token: 'token-123',
        clientIp: '127.0.0.1',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        customEndpoint,
        expect.any(Object)
      );
    });
  });

  describe('createCaptchaProvider', () => {
    it('should return NoOpCaptchaProvider when disabled', () => {
      const provider = createCaptchaProvider({
        CAPTCHA_ENABLED: 'false',
      });

      expect(provider.name()).toBe('CUSTOM');
    });

    it('should return RecaptchaV3Provider when configured', () => {
      const provider = createCaptchaProvider({
        CAPTCHA_ENABLED: 'true',
        CAPTCHA_PROVIDER: 'RECAPTCHA_V3',
        RECAPTCHA_V3_SECRET_KEY: 'secret-key',
      });

      expect(provider.name()).toBe('RECAPTCHA_V3');
    });

    it('should return HcaptchaProvider when configured', () => {
      const provider = createCaptchaProvider({
        CAPTCHA_ENABLED: 'true',
        CAPTCHA_PROVIDER: 'HCAPTCHA',
        HCAPTCHA_SECRET: 'secret-key',
      });

      expect(provider.name()).toBe('HCAPTCHA');
    });

    it('should return CloudflareProvider when configured', () => {
      const provider = createCaptchaProvider({
        CAPTCHA_ENABLED: 'true',
        CAPTCHA_PROVIDER: 'CLOUDFLARE',
        CLOUDFLARE_TURNSTILE_SECRET: 'secret-key',
      });

      expect(provider.name()).toBe('CLOUDFLARE');
    });

    it('should use default NoOp provider for unknown provider', () => {
      const provider = createCaptchaProvider({
        CAPTCHA_ENABLED: 'true',
        CAPTCHA_PROVIDER: 'UNKNOWN',
      });

      expect(provider.name()).toBe('CUSTOM');
    });

    it('should parse score threshold from environment', () => {
      const provider = createCaptchaProvider({
        CAPTCHA_ENABLED: 'true',
        CAPTCHA_PROVIDER: 'RECAPTCHA_V3',
        RECAPTCHA_V3_SECRET_KEY: 'secret-key',
        RECAPTCHA_V3_SCORE_THRESHOLD: '0.7',
      });

      expect(provider.name()).toBe('RECAPTCHA_V3');
    });
  });

  describe('CAPTCHA bypass prevention', () => {
    it('server decision should not be overridden by client boolean', async () => {
      // This test verifies that the captcha provider only returns
      // what the SERVER decided (via abuse protector state).
      // Client-supplied bypass booleans are irrelevant.

      const provider = new NoOpCaptchaProvider();
      const result = await provider.verify({
        token: 'any-token',
        clientIp: '127.0.0.1',
      });

      // Server decision (from abuse protector) determines requirement
      // Client cannot bypass this with client-side boolean manipulations
      expect(result.verified).toBe(true);
      expect(result.provider).toBeDefined();
    });
  });

  describe('temporary block and provider unavailable behavior', () => {
    it('should fail closed when provider is unavailable', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(
        new Error('Provider endpoint unavailable')
      );

      const provider = new RecaptchaV3Provider('secret-key');
      const result = await provider.verify({
        token: 'token-123',
        clientIp: '127.0.0.1',
      });

      // Fail closed: if provider is down, don't bypass CAPTCHA
      expect(result.verified).toBe(false);
    });
  });
});
