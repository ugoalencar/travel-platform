/**
 * High-level, safe-to-call helpers. Domain code (local-auth.ts,
 * customer-local-auth.ts, invitations.ts, customer-portal-access.ts)
 * imports only from here -- never from resend-provider.ts directly.
 *
 * Each helper builds the real link server-side (APP_URL / CUSTOMER_PORTAL_URL
 * -- the same env vars already documented in .env.production.example,
 * not new ad-hoc names), renders the matching template, sends via the
 * configured provider, and logs only safe fields (never the token/link,
 * never the API key).
 */

import { getEmailProvider } from './factory';
import { customerActivationEmail, employeeInvitationEmail, passwordResetEmail } from './templates';
import type { SendEmailResult } from './types';

function logEmailEvent(fields: {
  emailType: string;
  result: 'sent' | 'failed';
  provider?: string;
  messageId?: string;
  errorCode?: string;
}): void {
  // Structured, safe fields only -- no recipient address, no token, no
  // link, no API key. Recipient address is already tenant-scoped PII
  // handled elsewhere (audit_logs); this log exists for email-delivery
  // observability specifically.
  console.log(
    JSON.stringify({
      level: fields.result === 'sent' ? 30 : 50,
      msg: `email.${fields.emailType}.${fields.result}`,
      ...fields,
      timestamp: new Date().toISOString(),
    }),
  );
}

function agencyAppUrl(env: NodeJS.ProcessEnv): string {
  return (env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
}

function customerPortalUrl(env: NodeJS.ProcessEnv): string {
  return (env.CUSTOMER_PORTAL_URL ?? 'http://localhost:5174').replace(/\/$/, '');
}

export async function sendEmployeeInvitationEmail(
  input: { to: string; token: string; agencyName?: string; inviteeName?: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<SendEmailResult> {
  // Same route the existing UI already builds client-side
  // (OnboardingWizardPage.tsx) -- accept-invitation is hosted on the
  // customer-portal origin, not the agency app, matching the existing
  // route registered in apps/customer/src/App.tsx.
  const link = `${customerPortalUrl(env)}/accept-invitation/${input.token}`;
  const { subject, html, text } = employeeInvitationEmail({
    link,
    ...(input.agencyName ? { agencyName: input.agencyName } : {}),
    ...(input.inviteeName ? { inviteeName: input.inviteeName } : {}),
  });
  return sendAndLog('employee_invitation', input.to, subject, html, text, env);
}

export async function sendStaffPasswordResetEmail(
  input: { to: string; token: string; agencyName?: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<SendEmailResult> {
  const link = `${agencyAppUrl(env)}/reset-password?token=${input.token}`;
  const { subject, html, text } = passwordResetEmail({
    link,
    ...(input.agencyName ? { agencyName: input.agencyName } : {}),
  });
  return sendAndLog('staff_password_reset', input.to, subject, html, text, env);
}

export async function sendCustomerPasswordResetEmail(
  input: { to: string; token: string; agencyName?: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<SendEmailResult> {
  const link = `${customerPortalUrl(env)}/customer-portal/reset-password?token=${input.token}`;
  const { subject, html, text } = passwordResetEmail({
    link,
    ...(input.agencyName ? { agencyName: input.agencyName } : {}),
  });
  return sendAndLog('customer_password_reset', input.to, subject, html, text, env);
}

export async function sendCustomerActivationEmail(
  input: { to: string; token: string; agencyName?: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<SendEmailResult> {
  const link = `${customerPortalUrl(env)}/customer-portal/reset-password?token=${input.token}`;
  const { subject, html, text } = customerActivationEmail({
    link,
    ...(input.agencyName ? { agencyName: input.agencyName } : {}),
  });
  return sendAndLog('customer_activation', input.to, subject, html, text, env);
}

async function sendAndLog(
  emailType: string,
  to: string,
  subject: string,
  html: string,
  text: string,
  env: NodeJS.ProcessEnv,
): Promise<SendEmailResult> {
  const provider = getEmailProvider(env);
  try {
    const result = await provider.send({ to, subject, html, text });
    logEmailEvent({
      emailType,
      result: 'sent',
      provider: result.provider,
      ...(result.messageId ? { messageId: result.messageId } : {}),
    });
    return result;
  } catch (error: unknown) {
    const errorCode = error instanceof Error && 'code' in error ? String((error as { code: unknown }).code) : 'UNKNOWN';
    logEmailEvent({ emailType, result: 'failed', errorCode });
    throw error;
  }
}

export { EmailProviderNotConfiguredError, EmailProviderSendError } from './types';
export type { EmailProvider, SendEmailInput, SendEmailResult } from './types';
export { createEmailProvider, resetEmailProviderCacheForTests } from './factory';
