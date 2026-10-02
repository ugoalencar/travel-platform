export interface LiteSecurityEnvironment {
  NODE_ENV?: string;
  TRAVEL_LITE_CORS_ORIGINS?: string;
  CORS_ALLOWED_ORIGINS?: string;
}

export interface LiteCorsPolicy {
  isProduction: boolean;
  allowedOrigins: string[];
  allowLocalhostAnyPort: boolean;
}

export class LiteSecurityConfigError extends Error {
  readonly code = 'LITE_SECURITY_CONFIG_ERROR';
}

const LOCALHOST_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function resolveLiteCorsPolicy(
  environment: LiteSecurityEnvironment = process.env,
): LiteCorsPolicy {
  const isProduction = environment.NODE_ENV === 'production';
  const raw = environment.TRAVEL_LITE_CORS_ORIGINS ?? environment.CORS_ALLOWED_ORIGINS;

  if (!isProduction && (!raw || raw.trim().length === 0)) {
    return { isProduction: false, allowedOrigins: [], allowLocalhostAnyPort: true };
  }

  if (!raw || raw.trim().length === 0) {
    throw new LiteSecurityConfigError(
      'TRAVEL_LITE_CORS_ORIGINS must be set to explicit origins in production.',
    );
  }

  const allowedOrigins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (allowedOrigins.length === 0) {
    throw new LiteSecurityConfigError('TRAVEL_LITE_CORS_ORIGINS contains no usable origins.');
  }

  for (const origin of allowedOrigins) {
    if (origin === '*') {
      throw new LiteSecurityConfigError('TRAVEL_LITE_CORS_ORIGINS must not contain "*".');
    }
    if (!isValidOrigin(origin)) {
      throw new LiteSecurityConfigError(
        `TRAVEL_LITE_CORS_ORIGINS contains an invalid origin: "${origin}".`,
      );
    }
    if (isProduction && origin.startsWith('http://') && !LOCALHOST_ORIGIN_PATTERN.test(origin)) {
      throw new LiteSecurityConfigError(
        `TRAVEL_LITE_CORS_ORIGINS contains a non-HTTPS production origin: "${origin}".`,
      );
    }
  }

  return { isProduction, allowedOrigins, allowLocalhostAnyPort: false };
}

export function isLiteOriginAllowed(origin: string, policy: LiteCorsPolicy): boolean {
  return (
    policy.allowedOrigins.includes(origin) ||
    (policy.allowLocalhostAnyPort && LOCALHOST_ORIGIN_PATTERN.test(origin))
  );
}

function isValidOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && value === url.origin;
  } catch {
    return false;
  }
}
