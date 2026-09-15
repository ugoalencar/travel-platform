/**
 * Public agency self-service signup (Navigable Pilot Flow track,
 * 2026-09-14). Creates a brand-new tenant (agencies row) and its first
 * OWNER (users row) from an unauthenticated request, then auto-logs the
 * new OWNER in via the existing login() -- issuing the exact same
 * Bearer session token contract as every other login path, never a
 * parallel auth mechanism.
 *
 * RLS note: agencies_insert_tenant's policy (002_rls_policies.sql) is
 * `WITH CHECK (id = current_agency_id())` -- current_agency_id() is just
 * a session GUC read, with no existence check against the agencies table
 * itself. That migration's own comment flags "Bootstrap/onboarding flows
 * require a separate reviewed role/policy before production use" --
 * this file IS that review: it generates the new agency's id up front,
 * calls withAgencyTransaction(thatId, ...) to set tenant context to an
 * id that doesn't exist in the table yet, then inserts the agencies row
 * with that same id, satisfying WITH CHECK without weakening the policy
 * or requiring a new role. Exactly the same primitive every other
 * agency-scoped write in this codebase already uses.
 */

import { randomUUID } from 'node:crypto';
import { ConflictError, ValidationError } from './errors';
import { hashPassword } from './password-hashing';
import type { PlatformDatabaseRuntime } from './database';
import { login, type LoginResult } from './local-auth';

export interface AgencySignUpInput {
  agencyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  country?: string;
  companyIdentifier?: string;
  password: string;
  ip: string;
}

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function randomSlugSuffix(): string {
  return randomUUID().split('-')[0] ?? randomUUID().slice(0, 8);
}

export type AgencySignUpResult = LoginResult & { agencySlug: string };

export async function signUpAgency(
  platformDatabase: PlatformDatabaseRuntime,
  input: AgencySignUpInput,
): Promise<AgencySignUpResult> {
  if (input.password.length < 8) {
    throw new ValidationError('A senha deve ter pelo menos 8 caracteres');
  }

  const agencyId = randomUUID();
  const ownerId = randomUUID();
  const baseSlug = slugify(input.agencyName) || 'agencia';
  const slug = `${baseSlug}-${randomSlugSuffix()}`;
  const passwordHash = await hashPassword(input.password);
  const address = input.country ? { country: input.country } : null;

  try {
    await platformDatabase.withAgencyTransaction(agencyId, ownerId, async (client) => {
      await client.query(
        `INSERT INTO agencies (id, name, slug, cnpj, email, phone, address, plan, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'FREE', 'ACTIVE')`,
        [
          agencyId,
          input.agencyName,
          slug,
          input.companyIdentifier ?? null,
          input.contactEmail,
          input.contactPhone ?? null,
          address ? JSON.stringify(address) : null,
        ],
      );
      await client.query(
        `INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
         VALUES ($1, $2, $3, $4, 'OWNER', $5, 'ACTIVE')`,
        [ownerId, agencyId, input.contactEmail, input.contactName, passwordHash],
      );
      // Every user must be a linked employee (066_user_employee_link.sql) --
      // the owner is no exception, created in the same transaction so the
      // two rows can never drift apart.
      await client.query(
        `INSERT INTO employees (agency_id, name, email, phone, hire_date, employment_type, status, user_id)
         VALUES ($1, $2, $3, $4, CURRENT_DATE, 'PARTNER', 'ACTIVE', $5)`,
        [agencyId, input.contactName, input.contactEmail, input.contactPhone ?? null, ownerId],
      );
    });
  } catch (error: unknown) {
    // Postgres unique_violation
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === '23505') {
      throw new ConflictError('Não foi possível criar a agência. Verifique os dados informados.');
    }
    throw error;
  }

  const result = await login(platformDatabase, {
    agencySlug: slug,
    email: input.contactEmail,
    password: input.password,
    ip: input.ip,
  });
  // The generated slug (base name + random suffix, never chosen by the
  // user) is otherwise never surfaced anywhere -- without this, a user
  // who logs out has no way to know what to type back into the "Agência"
  // field, and every existing screen (Settings, Topbar) shows nothing
  // reflecting it either. Real bug reported directly: "criei conta,
  // saí, e ao entrar de novo disse que não existe."
  return { ...result, agencySlug: slug };
}
