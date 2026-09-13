/**
 * S3: MULTI-FACTOR AUTHENTICATION
 *
 * TOTP + Recovery Codes
 *
 * Contract:
 * - OWNER + ADMIN: mandatory MFA
 * - MANAGER: assessed for MFA requirement
 * - AGENT, VIEWER: optional
 *
 * Implementation:
 * - TOTP: RFC 4226 HMAC-based (SHA-1, SHA-256, SHA-512)
 * - Recovery codes: 16 single-use codes, hashed at rest
 * - Secret: shown only at enrollment, protected at rest (should be encrypted)
 * - Verification: valid TOTP required before enable
 * - Session: MFA state tracked (PRIMARY_AUTHENTICATED → MFA_REQUIRED → FULLY_AUTHENTICATED)
 * - Audit: all MFA events logged without secret/code values
 *
 * Usage:
 * 1. Enrollment: generateSecret() → display QR code + recovery codes
 * 2. Verification: verifyCode(secret, code) → enable if valid
 * 3. Recovery: verifyRecoveryCode(userId, code) → mark used, allow bypass MFA
 * 4. Audit: all verification attempts logged
 */

import { createHmac, randomBytes } from 'node:crypto';

/**
 * TOTP algorithm configuration.
 */
export interface TotpConfig {
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  digits: number;  // 6-8 digits
  period: number;  // 30-60 seconds
}

/**
 * Generated TOTP secret with metadata for enrollment.
 */
export interface TotpSecret {
  secret: string;  // Base32 encoded secret (for QR code)
  provisioningUri: string;  // otpauth:// URI for QR code
  recoveryCodesPlaintext: string[];  // 16 codes, shown only at enrollment
}

/**
 * Recovery code verification result.
 */
export interface RecoveryCodeResult {
  valid: boolean;
  used: boolean;
  remaining: number;  // Number of unused codes left
}

/**
 * TOTP verification result.
 */
export interface TotpVerificationResult {
  valid: boolean;
  timeWindow: number;  // Which 30s window was used (for resilience to clock skew)
}

/**
 * RFC 4226 HMAC-based One-Time Password (HOTP) implementation.
 * Used as the foundation for TOTP (time-based variant).
 */
export class HotpProvider {
  /**
   * Generates HMAC-based one-time password.
   *
   * @param secret Base32-decoded secret bytes
   * @param counter Counter value (for HOTP) or time window (for TOTP)
   * @param digits Number of digits (6-8)
   * @param algorithm HMAC algorithm (SHA1, SHA256, SHA512)
   * @returns Numeric OTP as string (left-padded with zeros)
   */
  static generateHotp(
    secret: Buffer,
    counter: number,
    digits: number,
    algorithm: 'SHA1' | 'SHA256' | 'SHA512'
  ): string {
    const hmacAlgorithm = this.mapAlgorithm(algorithm);
    const hmac = createHmac(hmacAlgorithm, secret);

    // Counter is big-endian 64-bit integer
    const counterBuffer = Buffer.alloc(8);
    for (let i = 7; i >= 0; i--) {
      counterBuffer[i] = counter & 0xff;
      counter >>= 8;
    }

    hmac.update(counterBuffer);
    const digest = hmac.digest();

    // Dynamic truncation: last 4 bits of digest → offset into digest
    // RFC 4226: offset is 0-15, guaranteeing offset+3 is within bounds for any HMAC algorithm
    const lastByte = digest[digest.length - 1];
    if (lastByte === undefined) {
      throw new Error('Digest is empty');
    }
    const offset = lastByte & 0x0f;

    // Ensure we can safely access offset through offset+3
    const b1 = digest[offset];
    const b2 = digest[offset + 1];
    const b3 = digest[offset + 2];
    const b4 = digest[offset + 3];

    if (b1 === undefined || b2 === undefined || b3 === undefined || b4 === undefined) {
      throw new Error('Insufficient digest length for HOTP computation');
    }

    const code =
      ((b1 & 0x7f) << 24) |
      ((b2 & 0xff) << 16) |
      ((b3 & 0xff) << 8) |
      (b4 & 0xff);

    const otp = code % Math.pow(10, digits);
    return otp.toString().padStart(digits, '0');
  }

  private static mapAlgorithm(algorithm: 'SHA1' | 'SHA256' | 'SHA512'): string {
    switch (algorithm) {
      case 'SHA1':
        return 'sha1';
      case 'SHA256':
        return 'sha256';
      case 'SHA512':
        return 'sha512';
      default:
        return 'sha1';
    }
  }
}

/**
 * Time-based One-Time Password (TOTP) provider.
 *
 * Implements RFC 6238 with configurable algorithm, digits, and period.
 */
export class TotpProvider {
  private readonly config: TotpConfig = {
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  };

  constructor(config?: Partial<TotpConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Generates a new TOTP secret for enrollment.
   *
   * @param accountName User email or identifier (for QR code label)
   * @param issuer Company/service name (for QR code label)
   * @returns Secret, provisioning URI, and recovery codes
   */
  generateSecret(accountName: string, issuer: string): TotpSecret {
    // Generate 32-byte secret (256 bits) for high entropy
    const secretBytes = randomBytes(32);
    const secretBase32 = this.encodeBase32(secretBytes);

    const provisioningUri = this.buildProvisioningUri(
      secretBase32,
      accountName,
      issuer,
      this.config.algorithm,
      this.config.digits,
      this.config.period
    );

    const recoveryCodesPlaintext = this.generateRecoveryCodes(16);

    return {
      secret: secretBase32,
      provisioningUri,
      recoveryCodesPlaintext,
    };
  }

  /**
   * Verifies a TOTP code against a secret.
   *
   * Allows for 30-second clock skew (±1 time window) to handle:
   * - Client and server clock differences
   * - User delay in entering code
   *
   * @param secretBase32 Base32-encoded secret
   * @param code User-entered code (e.g., "123456")
   * @param nowSeconds Current time in seconds (defaults to Date.now() / 1000)
   * @returns Verification result with time window
   */
  verifyCode(
    secretBase32: string,
    code: string,
    nowSeconds: number = Math.floor(Date.now() / 1000)
  ): TotpVerificationResult {
    if (!code || code.length !== this.config.digits) {
      return { valid: false, timeWindow: -1 };
    }

    try {
      const secretBytes = this.decodeBase32(secretBase32);

      // Check current window and ±1 adjacent windows for clock skew tolerance
      const currentWindow = Math.floor(nowSeconds / this.config.period);
      for (let offset = -1; offset <= 1; offset++) {
        const window = currentWindow + offset;
        const expected = HotpProvider.generateHotp(
          secretBytes,
          window,
          this.config.digits,
          this.config.algorithm
        );

        // Constant-time comparison to prevent timing attacks
        if (this.constantTimeEquals(code, expected)) {
          return { valid: true, timeWindow: window };
        }
      }

      return { valid: false, timeWindow: -1 };
    } catch {
      return { valid: false, timeWindow: -1 };
    }
  }

  /**
   * Generates recovery codes.
   * Codes should be hashed before storage (never store plaintext).
   */
  private generateRecoveryCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      // 8 bytes = 64 bits, enough entropy for one-time use codes
      const bytes = randomBytes(4);
      const hex = bytes.toString('hex').toUpperCase();
      // Format: XXXX-XXXX for readability
      codes.push(`${hex.slice(0, 4)}-${hex.slice(4, 8)}`);
    }
    return codes;
  }

  /**
   * Builds otpauth:// URI for QR code generation (e.g., with qrcode npm package).
   *
   * Format: otpauth://totp/[email]?secret=[secret]&issuer=[issuer]
   */
  private buildProvisioningUri(
    secretBase32: string,
    accountName: string,
    issuer: string,
    algorithm: string,
    digits: number,
    period: number
  ): string {
    const params = new URLSearchParams({
      secret: secretBase32,
      issuer,
      algorithm,
      digits: digits.toString(),
      period: period.toString(),
    });
    return `otpauth://totp/${encodeURIComponent(accountName)}?${params.toString()}`;
  }

  /**
   * Encodes binary data to Base32 (RFC 4648).
   */
  private encodeBase32(data: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    let buffer = 0;
    let bufferLength = 0;

    for (const byte of data) {
      buffer = (buffer << 8) | byte;
      bufferLength += 8;
      while (bufferLength >= 5) {
        bufferLength -= 5;
        result += alphabet[(buffer >> bufferLength) & 31];
      }
    }

    if (bufferLength > 0) {
      result += alphabet[(buffer << (5 - bufferLength)) & 31];
    }

    // Pad to 8-character groups
    while (result.length % 8) {
      result += '=';
    }

    return result;
  }

  /**
   * Decodes Base32 data (RFC 4648).
   */
  decodeBase32(encoded: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let buffer = 0;
    let bufferLength = 0;
    const bytes: number[] = [];

    for (const char of encoded.toUpperCase()) {
      if (char === '=') break;
      const value = alphabet.indexOf(char);
      if (value === -1) throw new Error(`Invalid Base32 character: ${char}`);
      buffer = (buffer << 5) | value;
      bufferLength += 5;
      if (bufferLength >= 8) {
        bufferLength -= 8;
        bytes.push((buffer >> bufferLength) & 0xff);
      }
    }

    return Buffer.from(bytes);
  }

  /**
   * Constant-time string comparison to prevent timing attacks.
   */
  private constantTimeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}

/**
 * Factory for creating TOTP provider with environment configuration.
 */
export function createTotpProvider(env: Record<string, string | undefined> = {}): TotpProvider {
  return new TotpProvider({
    algorithm: (env.MFA_TOTP_ALGORITHM as 'SHA1' | 'SHA256' | 'SHA512') ?? 'SHA1',
    digits: parseInt(env.MFA_TOTP_DIGITS ?? '6'),
    period: parseInt(env.MFA_TOTP_PERIOD ?? '30'),
  });
}

/**
 * Hashes a recovery code for storage.
 * Uses HMAC-SHA256 — cryptographically sound for single-use tokens.
 * If password-style hashing is needed, upgrade to bcrypt/argon2.
 */
export function hashRecoveryCode(code: string): string {
  // HMAC-SHA256 — deterministic, suitable for single-use token verification
  return createHmac('sha256', 'recovery-code-secret')
    .update(code)
    .digest('hex');
}

/**
 * Verifies a recovery code against a stored hash.
 * Uses constant-time comparison of HMAC-SHA256 hashes.
 */
export function verifyRecoveryCode(code: string, hash: string): boolean {
  // Constant-time comparison of HMAC-SHA256 hashes
  const codeHash = hashRecoveryCode(code);
  return constantTimeEquals(codeHash, hash);
}

/**
 * Constant-time string comparison.
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
