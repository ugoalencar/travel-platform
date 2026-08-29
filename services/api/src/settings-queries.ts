import type { TenantTransactionClient } from './database';
import { getAgencyId, getUserId, getTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';

// ============================================================
// SETTINGS QUERIES
// All queries are tenant-scoped using getAgencyId()
// RBAC is enforced at the route level
// ============================================================

interface AgencyProfile {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'AGENT' | 'VIEWER';
  joinedAt: string;
}

interface NotificationSettings {
  emailNotifications: boolean;
  proposalUpdates: boolean;
  bookingUpdates: boolean;
  paymentUpdates: boolean;
}

/**
 * Get agency profile
 * Accessible by all authenticated users for their own agency
 */
export async function getAgencyProfile(
  client: TenantTransactionClient,
): Promise<{ profile: AgencyProfile; userRole: string }> {
  const agencyId = getAgencyId();
  const userId = getUserId();
  const context = getTenantContext();

  // Get agency info
  const agencyRows = await client.query<{
    id: string;
    name: string;
    email?: string;
    phone?: string;
  }>(
    `
    SELECT id, name, email, phone
    FROM agencies
    WHERE id = $1
    `,
    [agencyId],
  );

  if (agencyRows.length === 0) {
    throw new Error('Agency not found');
  }

  const agency = agencyRows[0];

  return {
    profile: {
      id: agency.id,
      name: agency.name,
      email: agency.email,
      phone: agency.phone,
    },
    userRole: context.userRole || 'VIEWER',
  };
}

/**
 * Get team members
 * Accessible by all authenticated users for their agency
 * Only shows members of the same agency (tenant isolation)
 */
export async function getTeamMembers(client: TenantTransactionClient): Promise<TeamMember[]> {
  const agencyId = getAgencyId();

  const rows = await client.query<
    { id: string; name: string; email: string; role: string; joined_at: string }
  >(
    `
    SELECT u.id, u.name, u.email, a.role, a.created_at as joined_at
    FROM user_agencies a
    INNER JOIN users u ON a.user_id = u.id
    WHERE a.agency_id = $1
    ORDER BY a.created_at DESC
    `,
    [agencyId],
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as 'OWNER' | 'ADMIN' | 'MANAGER' | 'AGENT' | 'VIEWER',
    joinedAt: row.joined_at,
  }));
}

/**
 * Get notification settings for current user
 * Each user has their own notification preferences
 */
export async function getNotificationSettings(
  client: TenantTransactionClient,
): Promise<NotificationSettings> {
  const userId = getUserId();
  const agencyId = getAgencyId();

  const rows = await client.query<{
    email_notifications: boolean;
    proposal_updates: boolean;
    booking_updates: boolean;
    payment_updates: boolean;
  }>(
    `
    SELECT COALESCE(email_notifications, true) as email_notifications,
           COALESCE(proposal_updates, true) as proposal_updates,
           COALESCE(booking_updates, true) as booking_updates,
           COALESCE(payment_updates, true) as payment_updates
    FROM notification_preferences
    WHERE user_id = $1 AND agency_id = $2
    `,
    [userId, agencyId],
  );

  if (rows.length === 0) {
    // Return defaults if no preferences exist
    return {
      emailNotifications: true,
      proposalUpdates: true,
      bookingUpdates: true,
      paymentUpdates: true,
    };
  }

  const prefs = rows[0];
  return {
    emailNotifications: prefs.email_notifications,
    proposalUpdates: prefs.proposal_updates,
    bookingUpdates: prefs.booking_updates,
    paymentUpdates: prefs.payment_updates,
  };
}

/**
 * Update notification settings for current user
 * RBAC: All authenticated users can update their own preferences
 */
export async function updateNotificationSettings(
  client: TenantTransactionClient,
  settings: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  const userId = getUserId();
  const agencyId = getAgencyId();

  // Ensure preferences record exists
  await client.query(
    `
    INSERT INTO notification_preferences (user_id, agency_id)
    VALUES ($1, $2)
    ON CONFLICT (user_id, agency_id) DO NOTHING
    `,
    [userId, agencyId],
  );

  // Update only provided fields
  const updates: string[] = [];
  const values: any[] = [userId, agencyId];
  let paramIndex = 3;

  if (settings.emailNotifications !== undefined) {
    updates.push(`email_notifications = $${paramIndex}`);
    values.splice(2, 0, settings.emailNotifications);
    paramIndex++;
  }
  if (settings.proposalUpdates !== undefined) {
    updates.push(`proposal_updates = $${paramIndex}`);
    values.splice(2, 0, settings.proposalUpdates);
    paramIndex++;
  }
  if (settings.bookingUpdates !== undefined) {
    updates.push(`booking_updates = $${paramIndex}`);
    values.splice(2, 0, settings.bookingUpdates);
    paramIndex++;
  }
  if (settings.paymentUpdates !== undefined) {
    updates.push(`payment_updates = $${paramIndex}`);
    values.splice(2, 0, settings.paymentUpdates);
    paramIndex++;
  }

  if (updates.length > 0) {
    await client.query(
      `
      UPDATE notification_preferences
      SET ${updates.join(', ')}
      WHERE user_id = $1 AND agency_id = $2
      `,
      values,
    );
  }

  return getNotificationSettings(client);
}

export type { AgencyProfile, TeamMember, NotificationSettings };
