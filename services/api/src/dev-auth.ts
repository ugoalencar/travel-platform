import type { IncomingHttpHeaders } from 'node:http';
import type { AuthProvider } from './auth';
import type { CustomerAuthProvider } from './customer-auth';
import { UserRole } from '../../../packages/domain/types';
import type { ValidateUserAgencyAccess } from '../../../packages/domain/tenant-context';

const devAuthFlag = 'true';
const devAuthEmail = 'dev-local@example.test';
const authorizedDevPrincipals = [
  {
    userId: '11000000-0000-4000-8000-000000000001',
    agencyId: '10000000-0000-4000-8000-000000000001',
    role: UserRole.ADMIN,
  },
  {
    userId: '21000000-0000-4000-8000-000000000001',
    agencyId: '20000000-0000-4000-8000-000000000001',
    role: UserRole.ADMIN,
  },
] as const;

// Dev-only demo CUSTOMER identities (distinct from the staff principals
// above). Gated by the exact same isDevAuthEnabled() dual-gate. These
// customer ids must match the "Cliente Demo" rows created by
// scripts/seed-demo-data.cjs for each demo agency -- if the seed script
// changes these ids, update here too. Selected via a different header
// scheme (x-dev-customer) so a customer dev-token can never be confused
// with, or escalate into, a staff x-dev-user token.
const authorizedDevCustomerPrincipals = [
  {
    agencyKey: 'agency-a',
    agencyId: '10000000-0000-4000-8000-000000000001',
    customerId: '31000000-0000-4000-8000-000000000001',
  },
  {
    agencyKey: 'agency-b',
    agencyId: '20000000-0000-4000-8000-000000000001',
    customerId: '41000000-0000-4000-8000-000000000001',
  },
] as const;

export type ServerEnvironment = Partial<Record<string, string | undefined>>;

export function isDevAuthEnabled(environment: ServerEnvironment): boolean {
  return environment.ALLOW_DEV_AUTH === devAuthFlag && environment.NODE_ENV !== 'production';
}

export function createServerAuthProvider(
  environment: ServerEnvironment = process.env,
): AuthProvider {
  if (!isDevAuthEnabled(environment)) {
    return {
      authenticate() {
        return Promise.resolve(null);
      },
    };
  }

  return {
    authenticate(request) {
      const userId = readHeader(request.headers, 'x-dev-user-id');
      const agencyId = readHeader(request.headers, 'x-dev-agency-id');
      const role = readRole(request.headers);

      if (!isNonEmptyString(userId) || !isNonEmptyString(agencyId) || !role) {
        return Promise.resolve(null);
      }

      const principal = findAuthorizedDevPrincipal(userId, agencyId, role);

      if (!principal) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        userId: principal.userId,
        agencyId: principal.agencyId,
        role: principal.role,
        email: devAuthEmail,
      });
    },
  };
}

export function createServerAccessValidator(
  environment: ServerEnvironment = process.env,
): ValidateUserAgencyAccess {
  return function validateDevAccess(userId, agencyId) {
    return Promise.resolve(
      isDevAuthEnabled(environment) && hasAuthorizedDevPrincipal(userId, agencyId),
    );
  };
}

function readRole(headers: IncomingHttpHeaders): UserRole | undefined {
  const role = readHeader(headers, 'x-dev-role');
  return isUserRole(role) ? role : undefined;
}

function readHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function isUserRole(value: string | undefined): value is UserRole {
  return Object.values(UserRole).includes(value as UserRole);
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function findAuthorizedDevPrincipal(
  userId: string,
  agencyId: string,
  role: UserRole,
): (typeof authorizedDevPrincipals)[number] | undefined {
  return authorizedDevPrincipals.find(
    (principal) =>
      principal.userId === userId &&
      principal.agencyId === agencyId &&
      principal.role === role,
  );
}

function hasAuthorizedDevPrincipal(userId: string, agencyId: string): boolean {
  return authorizedDevPrincipals.some(
    (principal) => principal.userId === userId && principal.agencyId === agencyId,
  );
}

// ============================================================
// CUSTOMER PORTAL DEV AUTH
// Separate header scheme (x-dev-customer) and separate provider type
// (CustomerAuthProvider) from the staff dev auth above. Gated by the
// exact same isDevAuthEnabled() dual-gate -- no new env var, no path
// that can default open in production.
// ============================================================

export function createServerCustomerAuthProvider(
  environment: ServerEnvironment = process.env,
): CustomerAuthProvider {
  if (!isDevAuthEnabled(environment)) {
    return {
      authenticateCustomer() {
        return Promise.resolve(null);
      },
    };
  }

  return {
    authenticateCustomer(request) {
      const key = readHeader(request.headers, 'x-dev-customer');
      const principal = authorizedDevCustomerPrincipals.find((p) => p.agencyKey === key);

      if (!principal) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        agencyId: principal.agencyId,
        customerId: principal.customerId,
      });
    },
  };
}
