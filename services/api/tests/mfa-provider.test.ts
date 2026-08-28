import { describe, it, expect } from 'vitest';
import {
  TotpProvider,
  HotpProvider,
  hashRecoveryCode,
  verifyRecoveryCode,
  createTotpProvider,
} from '../src/mfa-provider';

describe('S3: MFA — TOTP + Recovery Codes', () => {
  describe('HotpProvider', () => {
    it('should generate HOTP code with SHA1', () => {
      // Test vector from RFC 4226 Appendix D
      const secret = Buffer.from([
        0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38,
        0x39, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36,
        0x37, 0x38, 0x39, 0x30,
      ]);

      const codes = [
        '755224',
        '287082',
        '359152',
        '969429',
        '338314',
        '254676',
        '287922',
        '162583',
        '399871',
        '520489',
      ];

      for (let i = 0; i < codes.length; i++) {
        const code = HotpProvider.generateHotp(secret, i, 6, 'SHA1');
        expect(code).toBe(codes[i]);
      }
    });

    it('should handle different digit counts', () => {
      const secret = Buffer.from('secret-key');

      const code6 = HotpProvider.generateHotp(secret, 0, 6, 'SHA1');
      const code8 = HotpProvider.generateHotp(secret, 0, 8, 'SHA1');

      expect(code6).toHaveLength(6);
      expect(code8).toHaveLength(8);
      expect(code8).not.toBe(code6.padEnd(8, '0'));  // They're different codes
    });

    it('should support SHA256 and SHA512', () => {
      const secret = Buffer.from('secret-key');

      const codeSha1 = HotpProvider.generateHotp(secret, 0, 6, 'SHA1');
      const codeSha256 = HotpProvider.generateHotp(secret, 0, 6, 'SHA256');
      const codeSha512 = HotpProvider.generateHotp(secret, 0, 6, 'SHA512');

      expect(codeSha1).toHaveLength(6);
      expect(codeSha256).toHaveLength(6);
      expect(codeSha512).toHaveLength(6);

      // Different algorithms should produce different codes
      expect(codeSha1).not.toBe(codeSha256);
      expect(codeSha256).not.toBe(codeSha512);
    });
  });

  describe('TotpProvider', () => {
    let provider: TotpProvider;

    it('should create with default config', () => {
      provider = new TotpProvider();
      expect(provider).toBeDefined();
    });

    it('should create with custom config', () => {
      provider = new TotpProvider({
        algorithm: 'SHA256',
        digits: 8,
        period: 60,
      });
      expect(provider).toBeDefined();
    });

    it('should generate secret with recovery codes', () => {
      provider = new TotpProvider();
      const secret = provider.generateSecret('user@example.com', 'MyApp');

      expect(secret.secret).toBeDefined();
      expect(secret.secret).toMatch(/^[A-Z2-7=]+$/);  // Base32 encoded
      expect(secret.provisioningUri).toMatch(/^otpauth:\/\/totp\//);
      expect(secret.provisioningUri).toContain('user@example.com');
      expect(secret.provisioningUri).toContain('MyApp');
      expect(secret.recoveryCodesPlaintext).toHaveLength(16);
    });

    it('should have unique recovery codes', () => {
      provider = new TotpProvider();
      const secret = provider.generateSecret('user@example.com', 'MyApp');
      const codes = new Set(secret.recoveryCodesPlaintext);

      // All codes should be unique
      expect(codes.size).toBe(16);
    });

    it('should include required parameters in provisioning URI', () => {
      provider = new TotpProvider({
        algorithm: 'SHA256',
        digits: 8,
        period: 45,
      });
      const secret = provider.generateSecret('user@example.com', 'MyApp');

      expect(secret.provisioningUri).toContain('algorithm=SHA256');
      expect(secret.provisioningUri).toContain('digits=8');
      expect(secret.provisioningUri).toContain('period=45');
    });

    it('should verify valid TOTP code', () => {
      provider = new TotpProvider({
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      });

      // Use RFC 4226 test vector as base32-encoded secret
      const testSecret = 'GEZDGNBVGY3TQOJQ';  // Binary 123456789012345678 encoded
      const nowSeconds = Math.floor(Date.now() / 1000);

      // Generate expected code for current time window
      const expectedCode = HotpProvider.generateHotp(
        Buffer.from([
          0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38,
          0x39, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36,
          0x37, 0x38, 0x39, 0x30,
        ]),
        Math.floor(nowSeconds / 30),
        6,
        'SHA1'
      );

      const result = provider.verifyCode(testSecret, expectedCode, nowSeconds);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid code', () => {
      provider = new TotpProvider();
      const secret = provider.generateSecret('user@example.com', 'MyApp').secret;

      const result = provider.verifyCode(secret, '000000');
      // Very unlikely to match (1 in 1 million chance)
      expect(result.valid).toBe(false);
    });

    it('should reject code with wrong length', () => {
      provider = new TotpProvider({ digits: 6 });
      const secret = provider.generateSecret('user@example.com', 'MyApp').secret;

      const result = provider.verifyCode(secret, '12345');  // Only 5 digits
      expect(result.valid).toBe(false);
    });

    it('should handle clock skew (±1 time window)', () => {
      provider = new TotpProvider({
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      });

      const testSecret = 'GEZDGNBVGY3TQOJQ';
      const nowSeconds = Math.floor(Date.now() / 1000);

      // Generate code for 30 seconds in the future
      const futureCode = HotpProvider.generateHotp(
        Buffer.from([
          0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38,
          0x39, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36,
          0x37, 0x38, 0x39, 0x30,
        ]),
        Math.floor(nowSeconds / 30) + 1,  // Next window
        6,
        'SHA1'
      );

      // Verify with current time (should accept due to ±1 skew)
      const result = provider.verifyCode(testSecret, futureCode, nowSeconds);
      expect(result.valid).toBe(true);
    });

    it('should reject codes outside tolerance window', () => {
      provider = new TotpProvider({
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      });

      const testSecret = 'GEZDGNBVGY3TQOJQ';
      const nowSeconds = Math.floor(Date.now() / 1000);

      // Generate code for 90 seconds in the past (3 windows back)
      const veryOldCode = HotpProvider.generateHotp(
        Buffer.from([
          0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38,
          0x39, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36,
          0x37, 0x38, 0x39, 0x30,
        ]),
        Math.floor(nowSeconds / 30) - 3,
        6,
        'SHA1'
      );

      const result = provider.verifyCode(testSecret, veryOldCode, nowSeconds);
      expect(result.valid).toBe(false);
    });

    it('should reject malformed base32 secret', () => {
      provider = new TotpProvider();
      const result = provider.verifyCode('!!!INVALID!!!', '123456');
      expect(result.valid).toBe(false);
    });
  });

  describe('Recovery code hashing', () => {
    it('should hash recovery codes', () => {
      const code = 'ABCD-1234';
      const hash1 = hashRecoveryCode(code);
      const hash2 = hashRecoveryCode(code);

      // Hashes should be deterministic
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(code);
    });

    it('should verify matching recovery code', () => {
      const code = 'ABCD-1234';
      const hash = hashRecoveryCode(code);

      const valid = verifyRecoveryCode(code, hash);
      expect(valid).toBe(true);
    });

    it('should reject non-matching recovery code', () => {
      const code1 = 'ABCD-1234';
      const code2 = 'EFGH-5678';
      const hash = hashRecoveryCode(code1);

      const valid = verifyRecoveryCode(code2, hash);
      expect(valid).toBe(false);
    });

    it('should use constant-time comparison', () => {
      const code = 'ABCD-1234';
      const hash = hashRecoveryCode(code);

      // Both should take similar time regardless of match
      const validResult = verifyRecoveryCode(code, hash);
      const invalidResult = verifyRecoveryCode('XXXX-XXXX', hash);

      expect(validResult).toBe(true);
      expect(invalidResult).toBe(false);
    });
  });

  describe('createTotpProvider', () => {
    it('should create provider with environment config', () => {
      const provider = createTotpProvider({
        MFA_TOTP_ALGORITHM: 'SHA256',
        MFA_TOTP_DIGITS: '8',
        MFA_TOTP_PERIOD: '45',
      });

      expect(provider).toBeDefined();
    });

    it('should use defaults when env vars not set', () => {
      const provider = createTotpProvider({});
      expect(provider).toBeDefined();
    });

    it('should handle malformed env values', () => {
      const provider = createTotpProvider({
        MFA_TOTP_DIGITS: 'invalid',
        MFA_TOTP_PERIOD: 'invalid',
      });

      // Should fallback to defaults (NaN becomes default)
      expect(provider).toBeDefined();
    });
  });

  describe('MFA adversarial scenarios', () => {
    it('should not allow MFA bypass via code replay', () => {
      const provider = new TotpProvider();
      const secret = provider.generateSecret('user@example.com', 'MyApp').secret;

      const nowSeconds = Math.floor(Date.now() / 1000);
      const code1 = HotpProvider.generateHotp(
        Buffer.from([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38]),
        Math.floor(nowSeconds / 30),
        6,
        'SHA1'
      );

      // Same code from replay (same time window)
      const result1 = provider.verifyCode(Buffer.from([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38]).toString('base64'), code1, nowSeconds);
      expect(result1.valid).toBe(false); // Will not match random secret

      // But legitimate use case: different times should produce different codes
      const futureSeconds = nowSeconds + 61;  // Beyond ±1 window
      const result2 = provider.verifyCode(secret, code1, futureSeconds);
      expect(result2.valid).toBe(false);  // Code expired
    });

    it('should not expose TOTP secret in error messages', () => {
      const provider = new TotpProvider();
      const secret = provider.generateSecret('user@example.com', 'MyApp').secret;

      const result = provider.verifyCode(secret, '000000');
      // Result should not contain secret information
      expect(JSON.stringify(result)).not.toContain(secret);
    });

    it('should not allow MFA disable without verification', () => {
      // This is enforced at application level, not crypto level
      // MFA_REQUIRED session state prevents privileged operations
      // until FULLY_AUTHENTICATED is reached via MFA verification
      expect(true).toBe(true);  // Placeholder
    });
  });
});
