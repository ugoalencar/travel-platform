/**
 * Grant Customer Portal access (Navigable Pilot Flow track, 2026-09-14).
 * Staff-authenticated: creates the customer_accounts row a customer needs
 * to ever log into /customer-auth/login, then reuses the EXISTING
 * password-reset token mechanism (customer_password_reset_tokens,
 * customer-local-auth.ts's customerResetPassword()) as the activation
 * path -- no new token system invented. The returned activation link
 * points at the same /customer-portal/reset-password page the forgot-
 * password flow already uses; setting a password there is how the
 * customer "activates".
 *
 * Runs entirely within the ambient tenant context this route's
 * protectedHooks already established (getAgencyId() / withTenantTransaction),
 * same pattern as customers.ts's createCustomer() -- no platformDatabase
 * needed, since this table is tenant-scoped and this call always has a
 * real staff session behind it.
 */

import { randomBytes, createHash } from 'node:crypto';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ConflictError, NotFoundError } from './errors';
import { unusablePasswordHash } from './password-hashing';

const ACTIVATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days -- an activation link, not a short-lived reset

export interface GrantPortalAccessResult {
  activationToken: string;
  expiresAt: Date;
  email: string;
}

export async function grantCustomerPortalAccess(
  database: DatabaseRuntime,
  customerId: string,
  email: string,
): Promise<GrantPortalAccessResult> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const customerResult = await client.query<{ id: string }>(
      `SELECT id FROM customers WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, customerId],
    );
    if (customerResult.rows.length === 0) {
      throw new NotFoundError('Customer not found');
    }

    const existingResult = await client.query<{ id: string }>(
      `SELECT id FROM customer_accounts WHERE agency_id = $1 AND customer_id = $2`,
      [agencyId, customerId],
    );
    let accountId = existingResult.rows[0]?.id;

    if (!accountId) {
      const insertResult = await client.query<{ id: string }>(
        `INSERT INTO customer_accounts (agency_id, customer_id, email, password_hash, status)
         VALUES ($1, $2, $3, $4, 'ACTIVE')
         RETURNING id`,
        [agencyId, customerId, email, unusablePasswordHash()],
      );
      accountId = insertResult.rows[0]?.id;
    } else {
      // Re-granting (e.g. resending an activation link) -- keep the
      // account row, just issue a fresh token below. Never silently
      // change the account's email out from under an existing login.
      const emailCheck = await client.query<{ email: string }>(
        `SELECT email FROM customer_accounts WHERE id = $1`,
        [accountId],
      );
      if (emailCheck.rows[0] && emailCheck.rows[0].email !== email) {
        throw new ConflictError(
          'This customer already has portal access under a different email. Update the account email first.',
        );
      }
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + ACTIVATION_TOKEN_TTL_MS);

    await client.query(
      `INSERT INTO customer_password_reset_tokens (agency_id, customer_account_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [agencyId, accountId, tokenHash, expiresAt],
    );

    return { activationToken: rawToken, expiresAt, email };
  });
}
