import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProductionAuthProvider,
  parseIdToken,
  validateDevAuthNotInProduction,
  generateOAuth2State,
  generateOAuth2Nonce,
  AuthState,
} from '../src/production-auth';

describe('S1: Production Auth', () => {
  describe('validateDevAuthNotInProduction', () => {
    it('should allow dev-auth in development', () => {
      expect(() => {
        validateDevAuthNotInProduction({
          NODE_ENV: 'development',
          ALLOW_DEV_AUTH: 'true',
        });
      }).not.toThrow();
    });

    it('should reject dev-auth in production', () => {
      expect(() => {
        validateDevAuthNotInProduction({
          NODE_ENV: 'production',
          ALLOW_DEV_AUTH: 'true',
        });
      }).toThrow(/FATAL.*production/);
    });

    it('should allow production without dev-auth flag', () => {
      expect(() => {
        validateDevAuthNotInProduction({
          NODE_ENV: 'production',
        });
      }).not.toThrow();
    });
  });

  describe('parseIdToken', () => {
    it('should parse valid ID token', () => {
      // Minimal valid JWT structure (not cryptographically verified here)
      const header = Buffer.from(JSON.stringify({
        alg: 'RS256',
        typ: 'JWT',
      })).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

      const now = Math.floor(Date.now() / 1000);
      const claims = {
        sub: 'user-123',
        iss: 'https://issuer.example.com',
        aud: 'client-id',
        exp: now + 3600,
        iat: now,
        email: 'user@example.com',
        email_verified: true,
      };

      const payload = Buffer.from(JSON.stringify(claims)).toString('base64')
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const signature = 'fake-signature';

      const token = `${header}.${payload}.${signature}`;
      const parsed = parseIdToken(token);

      expect(parsed.sub).toBe('user-123');
      expect(parsed.email).toBe('user@example.com');
      expect(parsed.iss).toBe('https://issuer.example.com');
    });

    it('should reject token with missing exp', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' }))
        .toString('base64');
      const payload = Buffer.from(JSON.stringify({ sub: 'user-123' }))
        .toString('base64');

      expect(() => {
        parseIdToken(`${header}.${payload}.fake`);
      }).toThrow(/exp.*claim/);
    });

    it('should reject expired token', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' }))
        .toString('base64');
      const now = Math.floor(Date.now() / 1000);
      const payload = Buffer.from(JSON.stringify({
        sub: 'user-123',
        iss: 'https://issuer.example.com',
        aud: 'client-id',
        exp: now - 200,  // 200 seconds ago
        iat: now - 3600,
        email: 'user@example.com',
      })).toString('base64');

      expect(() => {
        parseIdToken(`${header}.${payload}.fake`);
      }).toThrow(/expired/);
    });

    it('should reject token issued too far in future', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' }))
        .toString('base64');
      const now = Math.floor(Date.now() / 1000);
      const payload = Buffer.from(JSON.stringify({
        sub: 'user-123',
        iss: 'https://issuer.example.com',
        aud: 'client-id',
        exp: now + 3600,
        iat: now + 200,  // 200 seconds in future
        email: 'user@example.com',
      })).toString('base64');

      expect(() => {
        parseIdToken(`${header}.${payload}.fake`);
      }).toThrow(/issued in future/);
    });

    it('should reject non-RSA algorithm', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256' }))
        .toString('base64');
      const payload = Buffer.from(JSON.stringify({ sub: 'user-123' }))
        .toString('base64');

      expect(() => {
        parseIdToken(`${header}.${payload}.fake`);
      }).toThrow(/RSA/);
    });

    it('should reject malformed token', () => {
      expect(() => {
        parseIdToken('invalid.token');
      }).toThrow();
    });
  });

  describe('ProductionAuthProvider', () => {
    let provider: ProductionAuthProvider;

    beforeEach(() => {
      provider = new ProductionAuthProvider(
        {
          clientId: 'client-123',
          clientSecret: 'secret',
          redirectUris: ['https://app.example.com/callback'],
          issuer: 'https://issuer.example.com',
          audience: 'api-audience',
          jwksUri: 'https://issuer.example.com/.well-known/jwks.json',
          tokenEndpoint: 'https://issuer.example.com/token',
        },
        { NODE_ENV: 'development' }
      );
    });

    it('should validate redirect URIs', () => {
      expect(() => {
        provider.validateRedirectUri('https://app.example.com/callback');
      }).not.toThrow();
    });

    it('should reject invalid redirect URIs', () => {
      expect(() => {
        provider.validateRedirectUri('https://evil.com/callback');
      }).toThrow(/not in allowlist/);
    });

    it('should validate state and nonce with constant-time comparison', () => {
      const state = 'state-value-123';
      const nonce = 'nonce-value-456';

      expect(() => {
        provider.validateStateAndNonce(state, nonce, state, nonce);
      }).not.toThrow();
    });

    it('should reject invalid state', () => {
      expect(() => {
        provider.validateStateAndNonce('state1', 'nonce', 'state2', 'nonce');
      }).toThrow(/state/);
    });

    it('should reject invalid nonce', () => {
      expect(() => {
        provider.validateStateAndNonce('state', 'nonce1', 'state', 'nonce2');
      }).toThrow(/nonce/);
    });

    it('should determine auth state based on MFA requirement', () => {
      const claims = {
        sub: 'user-123',
        iss: 'https://issuer.example.com',
        aud: 'api-audience',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        email: 'user@example.com',
      };

      const stateWithMfa = provider.validateClaimsAndGetAuthState(claims, true);
      expect(stateWithMfa).toBe(AuthState.MFA_REQUIRED);

      const stateWithoutMfa = provider.validateClaimsAndGetAuthState(claims, false);
      expect(stateWithoutMfa).toBe(AuthState.FULLY_AUTHENTICATED);
    });

    it('should validate issuer claim', () => {
      const claims = {
        sub: 'user-123',
        iss: 'https://wrong-issuer.com',  // Wrong issuer
        aud: 'api-audience',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        email: 'user@example.com',
      };

      expect(() => {
        provider.validateClaimsAndGetAuthState(claims, false);
      }).toThrow(/issuer mismatch/);
    });

    it('should validate audience claim', () => {
      const claims = {
        sub: 'user-123',
        iss: 'https://issuer.example.com',
        aud: 'wrong-audience',  // Wrong audience
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        email: 'user@example.com',
      };

      expect(() => {
        provider.validateClaimsAndGetAuthState(claims, false);
      }).toThrow(/audience mismatch/);
    });
  });

  describe('generateOAuth2State', () => {
    it('should generate unique states', () => {
      const state1 = generateOAuth2State();
      const state2 = generateOAuth2State();

      expect(state1).not.toBe(state2);
      expect(state1).toHaveLength(32);
      expect(state2).toHaveLength(32);
    });

    it('should generate hex-formatted states', () => {
      const state = generateOAuth2State();
      expect(/^[0-9a-f]{32}$/.test(state)).toBe(true);
    });
  });

  describe('generateOAuth2Nonce', () => {
    it('should generate unique nonces', () => {
      const nonce1 = generateOAuth2Nonce();
      const nonce2 = generateOAuth2Nonce();

      expect(nonce1).not.toBe(nonce2);
      expect(nonce1).toHaveLength(32);
      expect(nonce2).toHaveLength(32);
    });

    it('should generate hex-formatted nonces', () => {
      const nonce = generateOAuth2Nonce();
      expect(/^[0-9a-f]{32}$/.test(nonce)).toBe(true);
    });
  });
});
