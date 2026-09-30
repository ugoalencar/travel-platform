import { describe, expect, it } from 'vitest';
import { resolveDatabaseTls } from '../src/database-tls';

const URL_WITH_SSLMODE =
  'postgresql://travel_app_runtime.ref:example-not-a-real-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require&uselibpqcompat=true';
const CA = '-----BEGIN CERTIFICATE-----\nMIIBexampleonly\n-----END CERTIFICATE-----';

describe('resolveDatabaseTls', () => {
  it('keeps the connection string untouched when no CA is configured', () => {
    expect(resolveDatabaseTls(URL_WITH_SSLMODE, {})).toEqual({ connectionString: URL_WITH_SSLMODE });
  });

  it('requires TLS with certificate + hostname validation when DATABASE_SSL_CA is set', () => {
    const config = resolveDatabaseTls(URL_WITH_SSLMODE, { DATABASE_SSL_CA: CA });

    expect(config.ssl).toEqual({
      ca: '-----BEGIN CERTIFICATE-----\nMIIBexampleonly\n-----END CERTIFICATE-----',
      rejectUnauthorized: true,
      servername: 'aws-0-us-east-1.pooler.supabase.com',
    });
  });

  it('strips ssl* URL parameters so they cannot override the validating ssl option', () => {
    const config = resolveDatabaseTls(URL_WITH_SSLMODE, { DATABASE_SSL_CA: CA });

    const url = new URL(config.connectionString!);
    expect(url.searchParams.has('sslmode')).toBe(false);
    expect(url.searchParams.has('uselibpqcompat')).toBe(false);
    expect(url.hostname).toBe('aws-0-us-east-1.pooler.supabase.com');
    expect(url.pathname).toBe('/postgres');
  });

  it('ignores a blank DATABASE_SSL_CA', () => {
    expect(resolveDatabaseTls(URL_WITH_SSLMODE, { DATABASE_SSL_CA: '  ' })).toEqual({ connectionString: URL_WITH_SSLMODE });
  });
});
