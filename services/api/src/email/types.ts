/**
 * Email delivery abstraction. The rest of the domain depends only on
 * this interface (and the helpers in index.ts) -- never on a specific
 * vendor SDK/API directly. This is what makes swapping Resend for a
 * different provider later a one-file change (see resend-provider.ts
 * and docs/operations/EMAIL_PROVIDER_RESEND.md "como trocar provider").
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  provider: string;
  /** Provider-assigned message id, when the provider returns one (never a token/secret). */
  messageId?: string;
}

export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

/**
 * Thrown when production/staging requires a real provider and none is
 * configured. Callers must let this propagate as a real failure --
 * never catch it and pretend the email was sent.
 */
export class EmailProviderNotConfiguredError extends Error {
  readonly code = 'EMAIL_PROVIDER_NOT_CONFIGURED';
  constructor() {
    super('EMAIL_PROVIDER_NOT_CONFIGURED: no real email provider is configured for this environment');
    this.name = 'EmailProviderNotConfiguredError';
  }
}

/** Thrown when the configured provider rejects the send (timeout, bad recipient, unverified domain, etc). */
export class EmailProviderSendError extends Error {
  readonly code = 'EMAIL_PROVIDER_SEND_FAILED';
  constructor(
    message: string,
    readonly provider: string,
  ) {
    super(message);
    this.name = 'EmailProviderSendError';
  }
}
