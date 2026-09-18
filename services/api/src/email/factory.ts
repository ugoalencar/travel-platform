import { DevLogEmailProvider } from './dev-log-provider';
import { ResendEmailProvider } from './resend-provider';
import { UnconfiguredEmailProvider } from './unconfigured-provider';
import type { EmailProvider } from './types';

// Environments where a fake/dev provider must never be silently used --
// matches this round's explicit fail-closed requirement. Mirrors the
// same NODE_ENV convention already used elsewhere in services/api
// (e.g. docker-compose.local-staging.yml sets NODE_ENV=production for
// the staging container itself, since it's meant to behave like prod).
const REAL_EMAIL_REQUIRED_NODE_ENVS = new Set(['production', 'staging']);

let cachedProvider: EmailProvider | undefined;

export function getEmailProvider(env: NodeJS.ProcessEnv = process.env): EmailProvider {
  if (!cachedProvider) {
    cachedProvider = createEmailProvider(env);
  }
  return cachedProvider;
}

/** Exposed for tests -- bypasses the module-level cache. */
export function createEmailProvider(env: NodeJS.ProcessEnv = process.env): EmailProvider {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();

  if (apiKey && from) {
    return new ResendEmailProvider({
      apiKey,
      from,
      ...(env.EMAIL_REPLY_TO?.trim() ? { replyTo: env.EMAIL_REPLY_TO.trim() } : {}),
    });
  }

  const requiresReal =
    REAL_EMAIL_REQUIRED_NODE_ENVS.has(env.NODE_ENV ?? '') || env.EMAIL_REQUIRE_REAL === 'true';

  if (requiresReal) {
    return new UnconfiguredEmailProvider();
  }

  return new DevLogEmailProvider();
}

/** Test-only escape hatch to clear the module cache between test cases. */
export function resetEmailProviderCacheForTests(): void {
  cachedProvider = undefined;
}
