/**
 * Travel Lite's own, minimal e-mail delivery for the forgot/reset-password
 * flow. No new dependency: Resend's HTTP API is called directly with
 * `fetch`, the same "no SDK, plain fetch" choice services/api/src/email
 * already made for the same reason.
 *
 * Deliberately separate env vars from the Full platform's email module
 * (LITE_* instead of the ones documented for services/api) so configuring
 * one product's provider never silently wires up the other's, since the
 * two run as separate deployables with separate domains/tenants.
 */

const REAL_EMAIL_REQUIRED_NODE_ENVS = new Set(['production', 'staging']);

export interface PasswordResetEmailInput {
  to: string;
  resetUrl: string;
  tenantName?: string;
}

/**
 * Thrown when the environment requires a real provider (production/staging,
 * or TRAVEL_LITE_EMAIL_REQUIRE_REAL=true) and none is configured. Callers must
 * never catch this and respond as if the e-mail had been sent -- it exists
 * so a misconfigured deployment fails loudly in logs, not silently.
 */
export class LiteEmailNotConfiguredError extends Error {
  readonly code = 'EMAIL_PROVIDER_NOT_CONFIGURED';
  constructor() {
    super('LITE_EMAIL_PROVIDER_NOT_CONFIGURED: no real email provider is configured for Travel Lite');
    this.name = 'LiteEmailNotConfiguredError';
  }
}

function logEmailEvent(fields: Record<string, unknown>): void {
  // Structured, safe fields only -- never the token/link/body, never the API key.
  console.log(JSON.stringify({ level: 30, msg: 'lite_email_event', ...fields, timestamp: new Date().toISOString() }));
}

function renderResetEmailText({ resetUrl, tenantName }: PasswordResetEmailInput): string {
  const agency = tenantName ? ` da agência ${tenantName}` : '';
  return [
    `Recebemos um pedido para redefinir sua senha${agency}.`,
    '',
    'Acesse o link abaixo para criar uma nova senha. Ele expira em 30 minutos e só pode ser usado uma vez:',
    resetUrl,
    '',
    'Se você não pediu isso, ignore este e-mail: sua senha continua a mesma.',
  ].join('\n');
}

function renderResetEmailHtml(input: PasswordResetEmailInput): string {
  return `<p>${renderResetEmailText(input).replace(/\n/g, '<br>')}</p>`;
}

/**
 * Sends the password-reset e-mail. Fails closed in production/staging when
 * no provider is configured (throws); falls back to a dev-only log line
 * everywhere else, which confirms an e-mail WOULD have been sent but never
 * logs the body (it carries the real reset link). Callers must not let a
 * failure here change the public HTTP response -- see routes/auth.ts's
 * forgotPassword, which always answers with the same generic message.
 */
export async function sendPasswordResetEmail(
  input: PasswordResetEmailInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const apiKey = env.TRAVEL_LITE_RESEND_API_KEY?.trim();
  const from = env.TRAVEL_LITE_EMAIL_FROM?.trim();

  if (apiKey && from) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: 'Redefinir sua senha — Travel Lite',
        html: renderResetEmailHtml(input),
        text: renderResetEmailText(input),
      }),
    });
    if (!response.ok) {
      throw new Error(`Resend respondeu ${response.status} ao enviar o e-mail de redefinição`);
    }
    logEmailEvent({ emailType: 'password_reset', result: 'sent', provider: 'resend' });
    return;
  }

  const requiresReal =
    REAL_EMAIL_REQUIRED_NODE_ENVS.has(env.NODE_ENV ?? '') || env.TRAVEL_LITE_EMAIL_REQUIRE_REAL === 'true';
  if (requiresReal) {
    throw new LiteEmailNotConfiguredError();
  }

  logEmailEvent({ emailType: 'password_reset', result: 'dev_log_only', provider: 'dev-log', to: input.to });
}
