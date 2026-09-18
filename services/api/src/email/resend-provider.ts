/**
 * Real email delivery via Resend's REST API (https://resend.com/docs/api-reference/emails/send-email).
 * Uses the platform's native fetch (Node 24) -- no SDK dependency, so
 * this stays a single small file to swap if the vendor ever changes.
 *
 * Never logs the API key. Never returns the API key. The only thing
 * logged on success is the provider name and the provider's own
 * message id (not sensitive -- it identifies the send in Resend's own
 * dashboard, nothing else).
 */

import { EmailProviderSendError, type EmailProvider, type SendEmailInput, type SendEmailResult } from './types';

const RESEND_API_URL = 'https://api.resend.com/emails';

export interface ResendEmailProviderOptions {
  apiKey: string;
  from: string;
  replyTo?: string;
}

export class ResendEmailProvider implements EmailProvider {
  private readonly apiKey: string;
  private readonly from: string;
  private readonly replyTo: string | undefined;

  constructor(options: ResendEmailProviderOptions) {
    this.apiKey = options.apiKey;
    this.from = options.from;
    this.replyTo = options.replyTo;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    let response: Response;
    try {
      response = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
          ...(this.replyTo ? { reply_to: this.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error: unknown) {
      // Network failure / timeout -- never the API key in this message.
      const reason = error instanceof Error ? error.name : 'UnknownError';
      throw new EmailProviderSendError(`Resend request failed (network/timeout: ${reason})`, 'resend');
    }

    if (!response.ok) {
      // Resend's error body never contains our own secret; safe to read
      // status text only (avoid echoing arbitrary provider response body
      // into logs upstream).
      throw new EmailProviderSendError(`Resend rejected the send (HTTP ${response.status})`, 'resend');
    }

    const data = (await response.json().catch(() => ({}))) as { id?: string };
    return { provider: 'resend', ...(data.id ? { messageId: data.id } : {}) };
  }
}
