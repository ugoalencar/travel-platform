/**
 * Development-only email "provider" -- never used unless NODE_ENV is
 * explicitly not production/staging AND no real provider is configured.
 * Logs that an email WOULD have been sent and to whom/what subject, but
 * never logs the HTML/text body (which carries the real activation/reset
 * link) -- matches the same "never log the token" rule as the real
 * provider. This exists so local development can exercise the full
 * invite/reset flows without a Resend account, per this round's explicit
 * instruction: a dev-only preview/log mechanism is allowed, but it must
 * never be reachable in production/staging (see factory.ts's fail-closed
 * check) and must never be confused with a real send.
 */

import type { EmailProvider, SendEmailInput, SendEmailResult } from './types';

export class DevLogEmailProvider implements EmailProvider {
  // eslint-disable-next-line @typescript-eslint/require-await -- interface requires a Promise-returning signature
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    console.log(
      JSON.stringify({
        level: 30,
        msg: 'email.dev_provider.would_send',
        emailProvider: 'dev-log',
        to: input.to,
        subject: input.subject,
        note: 'DEVELOPMENT ONLY -- no real email was sent. Body withheld from logs (may contain a real link/token).',
        timestamp: new Date().toISOString(),
      }),
    );
    return { provider: 'dev-log' };
  }
}
