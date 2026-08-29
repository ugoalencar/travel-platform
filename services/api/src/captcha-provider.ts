/**
 * S2: CAPTCHA / ABUSE VERIFICATION
 *
 * Vendor-agnostic CAPTCHA provider abstraction.
 *
 * Contract:
 * - Server decides when CAPTCHA is required (via LoginAbuseProtector states)
 * - Client provides CAPTCHA token from configured provider
 * - Server verifies token server-side (never trust client booleans)
 * - Verification result recorded for audit
 * - Provider is swappable without changing application code
 *
 * Usage:
 * 1. Server's LoginAbuseProtector checks abuse state
 * 2. If state is 'captcha_required', client must provide CAPTCHA token
 * 3. Application calls verifyToken(token, clientIp)
 * 4. Result: verified boolean + score (for v3-style providers)
 * 5. If verified: allow login to proceed, record audit event
 * 6. If not verified: record failure, apply throttle/block
 */

export type CaptchaProviderType = 'RECAPTCHA_V3' | 'HCAPTCHA' | 'CLOUDFLARE' | 'CUSTOM';

export interface CaptchaVerificationRequest {
  token: string;
  clientIp: string;
  remoteIp?: string;  // For provider-specific validation
}

export interface CaptchaVerificationResult {
  verified: boolean;
  score?: number;  // 0.0-1.0 for v3 providers
  errorCodes?: string[];
  provider: CaptchaProviderType;
  timestamp: Date;
}

/**
 * Abstraction for CAPTCHA provider implementations.
 * Must never trust client-supplied verification; all verification
 * happens server-side by calling the CAPTCHA provider API.
 */
export interface CaptchaProvider {
  /**
   * Verifies a CAPTCHA token from the client.
   *
   * @param request Token and IP context
   * @returns Verification result with score (if applicable)
   * @throws On network errors or provider unavailability
   */
  verify(request: CaptchaVerificationRequest): Promise<CaptchaVerificationResult>;

  /**
   * Determine if this provider is available and properly configured.
   */
  isConfigured(): boolean;

  /**
   * Provider name for logging and audit events.
   */
  name(): CaptchaProviderType;
}

/**
 * Default no-op provider for development and disabled CAPTCHA.
 * Always returns verified=true to allow proceeding.
 */
export class NoOpCaptchaProvider implements CaptchaProvider {
  verify(_request: CaptchaVerificationRequest): Promise<CaptchaVerificationResult> {
    return Promise.resolve({
      verified: true,
      provider: 'CUSTOM',
      timestamp: new Date(),
    });
  }

  isConfigured(): boolean {
    return true;
  }

  name(): CaptchaProviderType {
    return 'CUSTOM';
  }
}

/**
 * Google reCAPTCHA v3 provider.
 *
 * Configuration:
 * - CAPTCHA_PROVIDER=RECAPTCHA_V3
 * - RECAPTCHA_V3_SECRET_KEY=<secret>
 * - RECAPTCHA_V3_SCORE_THRESHOLD=0.5 (adjustable per action)
 */
export class RecaptchaV3Provider implements CaptchaProvider {
  private readonly secretKey: string;
  private readonly scoreThreshold: number;
  private readonly verificationUrl = 'https://www.google.com/recaptcha/api/siteverify';

  constructor(
    secretKey: string,
    scoreThreshold: number = 0.5,
  ) {
    if (!secretKey || secretKey.trim().length === 0) {
      throw new Error('RECAPTCHA_V3_SECRET_KEY is required but not configured');
    }
    this.secretKey = secretKey;
    this.scoreThreshold = scoreThreshold;
  }

  async verify(request: CaptchaVerificationRequest): Promise<CaptchaVerificationResult> {
    try {
      const response = await fetch(this.verificationUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: this.secretKey,
          response: request.token,
          remoteip: request.remoteIp || request.clientIp,
        }).toString(),
        signal: AbortSignal.timeout(5000),  // 5s timeout
      });

      if (!response.ok) {
        return {
          verified: false,
          provider: 'RECAPTCHA_V3',
          errorCodes: [`HTTP ${response.status}`],
          timestamp: new Date(),
        };
      }

      const data = (await response.json()) as Record<string, unknown>;
      const success = data.success === true;
      const score = typeof data.score === 'number' ? data.score : undefined;
      const errorCodes = Array.isArray(data['error-codes'])
        ? (data['error-codes'] as string[])
        : [];

      // Verify score threshold if applicable
      const verified = success && (!score || score >= this.scoreThreshold);

      const result: CaptchaVerificationResult = {
        verified,
        provider: 'RECAPTCHA_V3',
        timestamp: new Date(),
      };

      if (score !== undefined) {
        result.score = score;
      }

      if (errorCodes.length > 0) {
        result.errorCodes = errorCodes;
      }

      return result;
    } catch (error) {
      // Provider unavailable: fail-closed (not verified)
      return {
        verified: false,
        provider: 'RECAPTCHA_V3',
        errorCodes: [error instanceof Error ? error.message : 'Unknown error'],
        timestamp: new Date(),
      };
    }
  }

  isConfigured(): boolean {
    return this.secretKey.trim().length > 0;
  }

  name(): CaptchaProviderType {
    return 'RECAPTCHA_V3';
  }
}

/**
 * hCaptcha provider.
 *
 * Configuration:
 * - CAPTCHA_PROVIDER=HCAPTCHA
 * - HCAPTCHA_SECRET=<secret>
 * - HCAPTCHA_REPORT_API=false (optional, for privacy)
 */
export class HcaptchaProvider implements CaptchaProvider {
  private readonly secret: string;
  private readonly verificationUrl = 'https://hcaptcha.com/siteverify';

  constructor(secret: string) {
    if (!secret || secret.trim().length === 0) {
      throw new Error('HCAPTCHA_SECRET is required but not configured');
    }
    this.secret = secret;
  }

  async verify(request: CaptchaVerificationRequest): Promise<CaptchaVerificationResult> {
    try {
      const response = await fetch(this.verificationUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: this.secret,
          response: request.token,
          remoteip: request.remoteIp || request.clientIp,
        }).toString(),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return {
          verified: false,
          provider: 'HCAPTCHA',
          errorCodes: [`HTTP ${response.status}`],
          timestamp: new Date(),
        };
      }

      const data = (await response.json()) as Record<string, unknown>;
      const success = data.success === true;
      const errorCodes = Array.isArray(data['error-codes'])
        ? (data['error-codes'] as string[])
        : [];

      const result: CaptchaVerificationResult = {
        verified: success,
        provider: 'HCAPTCHA',
        timestamp: new Date(),
      };

      if (errorCodes.length > 0) {
        result.errorCodes = errorCodes;
      }

      return result;
    } catch (error) {
      return {
        verified: false,
        provider: 'HCAPTCHA',
        errorCodes: [error instanceof Error ? error.message : 'Unknown error'],
        timestamp: new Date(),
      };
    }
  }

  isConfigured(): boolean {
    return this.secret.trim().length > 0;
  }

  name(): CaptchaProviderType {
    return 'HCAPTCHA';
  }
}

/**
 * Cloudflare Turnstile provider.
 *
 * Configuration:
 * - CAPTCHA_PROVIDER=CLOUDFLARE
 * - CLOUDFLARE_TURNSTILE_SECRET=<secret>
 * - CLOUDFLARE_TURNSTILE_ENDPOINT=https://challenges.cloudflare.com/turnstile/v0/siteverify
 */
export class CloudflareProvider implements CaptchaProvider {
  private readonly secret: string;
  private readonly verificationUrl: string;

  constructor(
    secret: string,
    endpoint: string = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
  ) {
    if (!secret || secret.trim().length === 0) {
      throw new Error('CLOUDFLARE_TURNSTILE_SECRET is required but not configured');
    }
    this.secret = secret;
    this.verificationUrl = endpoint;
  }

  async verify(request: CaptchaVerificationRequest): Promise<CaptchaVerificationResult> {
    try {
      const response = await fetch(this.verificationUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: this.secret,
          response: request.token,
          remoteip: request.remoteIp || request.clientIp,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return {
          verified: false,
          provider: 'CLOUDFLARE',
          errorCodes: [`HTTP ${response.status}`],
          timestamp: new Date(),
        };
      }

      const data = (await response.json()) as Record<string, unknown>;
      const success = data.success === true;
      const errorCodes = Array.isArray(data['error-codes'])
        ? (data['error-codes'] as string[])
        : [];

      const result: CaptchaVerificationResult = {
        verified: success,
        provider: 'CLOUDFLARE',
        timestamp: new Date(),
      };

      if (errorCodes.length > 0) {
        result.errorCodes = errorCodes;
      }

      return result;
    } catch (error) {
      return {
        verified: false,
        provider: 'CLOUDFLARE',
        errorCodes: [error instanceof Error ? error.message : 'Unknown error'],
        timestamp: new Date(),
      };
    }
  }

  isConfigured(): boolean {
    return this.secret.trim().length > 0;
  }

  name(): CaptchaProviderType {
    return 'CLOUDFLARE';
  }
}

/**
 * Create appropriate CAPTCHA provider from environment configuration.
 *
 * Environment variables:
 * - CAPTCHA_ENABLED: 'true' or 'false' (default: false for dev)
 * - CAPTCHA_PROVIDER: 'RECAPTCHA_V3', 'HCAPTCHA', 'CLOUDFLARE' (default: CUSTOM/noop)
 * - Provider-specific secrets
 */
export function createCaptchaProvider(env: Record<string, string | undefined>): CaptchaProvider {
  const enabled = env.CAPTCHA_ENABLED === 'true';
  if (!enabled) {
    return new NoOpCaptchaProvider();
  }

  const provider = env.CAPTCHA_PROVIDER ?? 'CUSTOM';

  switch (provider) {
    case 'RECAPTCHA_V3':
      return new RecaptchaV3Provider(
        env.RECAPTCHA_V3_SECRET_KEY || '',
        parseFloat(env.RECAPTCHA_V3_SCORE_THRESHOLD || '0.5')
      );
    case 'HCAPTCHA':
      return new HcaptchaProvider(env.HCAPTCHA_SECRET || '');
    case 'CLOUDFLARE':
      return new CloudflareProvider(
        env.CLOUDFLARE_TURNSTILE_SECRET || '',
        env.CLOUDFLARE_TURNSTILE_ENDPOINT
      );
    default:
      return new NoOpCaptchaProvider();
  }
}
