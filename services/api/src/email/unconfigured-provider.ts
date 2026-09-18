/**
 * Fail-closed provider: used when the environment requires a real email
 * provider (production/staging, or EMAIL_REQUIRE_REAL=true) and none is
 * configured. Every send() call throws -- callers must let this
 * propagate as a real error, never catch it and respond as if the email
 * had been sent (see this round's explicit "não fingir sucesso" rule).
 */

import { EmailProviderNotConfiguredError, type EmailProvider, type SendEmailInput, type SendEmailResult } from './types';

export class UnconfiguredEmailProvider implements EmailProvider {
  // eslint-disable-next-line @typescript-eslint/require-await -- interface requires a Promise-returning signature
  async send(_input: SendEmailInput): Promise<SendEmailResult> {
    throw new EmailProviderNotConfiguredError();
  }
}
