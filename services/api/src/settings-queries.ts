/* eslint-disable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-return */
import type { TenantTransactionClient } from './database';
import { getAgencyId, getUserId, getTenantContext } from '../../../packages/domain/tenant-context';

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
  displayName?: string;
  logoUrl?: string;
  primaryColor?: string;
  onboardingCompletedAt?: string;
  onboardingStep?: string;
}

export interface AgencyBrandingUpdate {
  displayName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

export interface AgencyProfileUpdate {
  name?: string;
  email?: string | null;
  phone?: string | null;
}

export interface Department {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

const hexColorPattern = /^#[0-9a-fA-F]{6}$/;

function assertValidBrandingInput(input: AgencyBrandingUpdate): void {
  if (input.primaryColor !== undefined && input.primaryColor !== null) {
    if (!hexColorPattern.test(input.primaryColor)) {
      throw new Error('primaryColor deve ser um código hexadecimal válido, ex: #1A2B3C');
    }
  }
  if (input.logoUrl !== undefined && input.logoUrl !== null && input.logoUrl.length > 0) {
    try {
      const parsed = new URL(input.logoUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('invalid');
      }
    } catch {
      throw new Error('logoUrl deve ser uma URL http(s) válida');
    }
  }
  if (input.displayName !== undefined && input.displayName !== null && input.displayName.length > 200) {
    throw new Error('displayName deve ter no máximo 200 caracteres');
  }
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
  const context = getTenantContext();

  // Get agency info
  const agencyRows = await client.query<{
    id: string;
    name: string;
    email?: string;
    phone?: string;
    display_name?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
    onboarding_completed_at?: string | null;
    onboarding_step?: string | null;
  }>(
    `
    SELECT id, name, email, phone, display_name, logo_url, primary_color,
           onboarding_completed_at, onboarding_step
    FROM agencies
    WHERE id = $1
    `,
    [agencyId],
  );

  if (agencyRows.rows.length === 0) {
    throw new Error('Agency not found');
  }

  const agency = agencyRows.rows[0] as {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    display_name?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
    onboarding_completed_at?: string | null;
    onboarding_step?: string | null;
  };

  const profile: AgencyProfile = {
    id: agency.id,
    name: agency.name,
  };

  if (agency.email !== undefined) {
    profile.email = agency.email;
  }

  if (agency.phone !== undefined) {
    profile.phone = agency.phone;
  }

  if (agency.display_name) {
    profile.displayName = agency.display_name;
  }

  if (agency.logo_url) {
    profile.logoUrl = agency.logo_url;
  }

  if (agency.primary_color) {
    profile.primaryColor = agency.primary_color;
  }

  if (agency.onboarding_completed_at) {
    profile.onboardingCompletedAt = agency.onboarding_completed_at;
  }

  if (agency.onboarding_step) {
    profile.onboardingStep = agency.onboarding_step;
  }

  return {
    profile,
    userRole: context.userRole || 'VIEWER',
  };
}

/**
 * Update the agency's basic contact profile (name, email, phone) -- distinct
 * from branding (display identity) and departments/team. Caller (route
 * layer) is responsible for RBAC enforcement and audit logging. RLS on
 * `agencies` ensures only the current tenant's row can be affected.
 */
export async function updateAgencyProfile(
  client: TenantTransactionClient,
  input: AgencyProfileUpdate,
): Promise<AgencyProfile> {
  const agencyId = getAgencyId();

  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (input.name !== undefined) {
    if (!input.name.trim()) {
      throw new Error('name must not be empty');
    }
    sets.push(`name = $${idx++}`);
    values.push(input.name.trim());
  }
  if (input.email !== undefined) {
    sets.push(`email = $${idx++}`);
    values.push(input.email);
  }
  if (input.phone !== undefined) {
    sets.push(`phone = $${idx++}`);
    values.push(input.phone);
  }

  if (sets.length === 0) {
    const { profile } = await getAgencyProfile(client);
    return profile;
  }

  values.push(agencyId);

  const result = await client.query<{
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  }>(
    `
    UPDATE agencies
    SET ${sets.join(', ')}, updated_at = now()
    WHERE id = $${idx}
    RETURNING id, name, email, phone
    `,
    values,
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('Agency not found');
  }

  const profile: AgencyProfile = { id: row.id, name: row.name };
  if (row.email !== undefined && row.email !== null) profile.email = row.email;
  if (row.phone !== undefined && row.phone !== null) profile.phone = row.phone;
  return profile;
}

/**
 * Update agency branding (displayName, logoUrl, primaryColor).
 * Caller (route layer) is responsible for RBAC enforcement and audit logging.
 * RLS on `agencies` ensures only the current tenant's row can be affected.
 */
export async function updateAgencyBranding(
  client: TenantTransactionClient,
  input: AgencyBrandingUpdate,
): Promise<AgencyProfile> {
  assertValidBrandingInput(input);
  const agencyId = getAgencyId();

  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (input.displayName !== undefined) {
    sets.push(`display_name = $${idx++}`);
    values.push(input.displayName);
  }
  if (input.logoUrl !== undefined) {
    sets.push(`logo_url = $${idx++}`);
    values.push(input.logoUrl);
  }
  if (input.primaryColor !== undefined) {
    sets.push(`primary_color = $${idx++}`);
    values.push(input.primaryColor);
  }

  if (sets.length === 0) {
    const { profile } = await getAgencyProfile(client);
    return profile;
  }

  values.push(agencyId);

  const result = await client.query<{
    id: string;
    name: string;
    email?: string;
    phone?: string;
    display_name?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
  }>(
    `
    UPDATE agencies
    SET ${sets.join(', ')}, updated_at = now()
    WHERE id = $${idx}
    RETURNING id, name, email, phone, display_name, logo_url, primary_color
    `,
    values,
  );

  if (result.rows.length === 0) {
    throw new Error('Agency not found');
  }

  const row = result.rows[0] as {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    display_name?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
  };

  const profile: AgencyProfile = { id: row.id, name: row.name };
  if (row.email !== undefined) profile.email = row.email;
  if (row.phone !== undefined) profile.phone = row.phone;
  if (row.display_name) profile.displayName = row.display_name;
  if (row.logo_url) profile.logoUrl = row.logo_url;
  if (row.primary_color) profile.primaryColor = row.primary_color;

  return profile;
}

/**
 * Onboarding wizard progress. `step` is a free-form identifier the
 * frontend defines (e.g. 'profile' | 'branding' | 'team' | 'done') --
 * this layer only persists whatever the client says it's currently on,
 * it does not validate a fixed step sequence.
 */
const ONBOARDING_STEPS = ['profile', 'branding', 'team', 'done'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function isValidOnboardingStep(value: unknown): value is OnboardingStep {
  return typeof value === 'string' && (ONBOARDING_STEPS as readonly string[]).includes(value);
}

export async function updateOnboardingStep(
  client: TenantTransactionClient,
  step: OnboardingStep,
): Promise<AgencyProfile> {
  const agencyId = getAgencyId();
  const result = await client.query<{
    id: string;
    name: string;
    onboarding_step: string | null;
    onboarding_completed_at: string | null;
  }>(
    `
    UPDATE agencies
    SET onboarding_step = $1, updated_at = now()
    WHERE id = $2
    RETURNING id, name, onboarding_step, onboarding_completed_at
    `,
    [step, agencyId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Agency not found');
  }
  const profile: AgencyProfile = { id: row.id, name: row.name };
  if (row.onboarding_step) profile.onboardingStep = row.onboarding_step;
  if (row.onboarding_completed_at) profile.onboardingCompletedAt = row.onboarding_completed_at;
  return profile;
}

export async function completeOnboarding(
  client: TenantTransactionClient,
): Promise<AgencyProfile> {
  const agencyId = getAgencyId();
  const result = await client.query<{
    id: string;
    name: string;
    onboarding_step: string | null;
    onboarding_completed_at: string | null;
  }>(
    `
    UPDATE agencies
    SET onboarding_step = 'done', onboarding_completed_at = COALESCE(onboarding_completed_at, now()), updated_at = now()
    WHERE id = $1
    RETURNING id, name, onboarding_step, onboarding_completed_at
    `,
    [agencyId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Agency not found');
  }
  const profile: AgencyProfile = { id: row.id, name: row.name };
  if (row.onboarding_step) profile.onboardingStep = row.onboarding_step;
  if (row.onboarding_completed_at) profile.onboardingCompletedAt = row.onboarding_completed_at;
  return profile;
}

/**
 * Departments (tenant-scoped, RLS-enforced)
 */
export async function listDepartments(client: TenantTransactionClient): Promise<Department[]> {
  getAgencyId();
  const result = await client.query<{
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, name, description, created_at, updated_at
     FROM departments
     ORDER BY name ASC`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function createDepartment(
  client: TenantTransactionClient,
  input: { name: string; description?: string | null },
): Promise<Department> {
  const agencyId = getAgencyId();
  const name = input.name?.trim();
  if (!name) {
    throw new Error('name é obrigatório');
  }
  const result = await client.query<{
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `INSERT INTO departments (agency_id, name, description)
     VALUES ($1, $2, $3)
     RETURNING id, name, description, created_at, updated_at`,
    [agencyId, name, input.description ?? null],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Failed to create department');
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function updateDepartment(
  client: TenantTransactionClient,
  id: string,
  input: { name?: string; description?: string | null },
): Promise<Department | null> {
  getAgencyId();
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) {
      throw new Error('name não pode ser vazio');
    }
    sets.push(`name = $${idx++}`);
    values.push(trimmed);
  }
  if (input.description !== undefined) {
    sets.push(`description = $${idx++}`);
    values.push(input.description);
  }

  if (sets.length === 0) {
    const result = await client.query<{
      id: string;
      name: string;
      description: string | null;
      created_at: string;
      updated_at: string;
    }>(`SELECT id, name, description, created_at, updated_at FROM departments WHERE id = $1`, [id]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  values.push(id);

  const result = await client.query<{
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `UPDATE departments
     SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $${idx}
     RETURNING id, name, description, created_at, updated_at`,
    values,
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function deleteDepartment(client: TenantTransactionClient, id: string): Promise<boolean> {
  getAgencyId();
  const result = await client.query(`DELETE FROM departments WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
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
    SELECT u.id, u.name, u.email, u.role, u.created_at as joined_at
    FROM users u
    WHERE u.agency_id = $1
    ORDER BY u.created_at DESC
    `,
    [agencyId],
  );

  return rows.rows.map((row) => ({
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

  if (rows.rows.length === 0) {
    // Return defaults if no preferences exist
    return {
      emailNotifications: true,
      proposalUpdates: true,
      bookingUpdates: true,
      paymentUpdates: true,
    };
  }

  const prefs = rows.rows[0] as {
    email_notifications: boolean;
    proposal_updates: boolean;
    booking_updates: boolean;
    payment_updates: boolean;
  };
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
  const values: (string | boolean)[] = [userId, agencyId];
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
