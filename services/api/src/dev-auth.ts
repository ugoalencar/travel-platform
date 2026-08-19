import type { IncomingHttpHeaders } from 'node:http';
import type { AuthProvider } from './auth';
import { UserRole } from '../../../packages/domain/types';
import type { ValidateUserAgencyAccess } from '../../../packages/domain/tenant-context';

const devAuthFlag = 'true';
const devAuthEmail = 'dev-local@example.test';

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

      return Promise.resolve({
        userId,
        agencyId,
        role,
        email: devAuthEmail,
      });
    },
  };
}

export function createServerAccessValidator(
  environment: ServerEnvironment = process.env,
): ValidateUserAgencyAccess {
  return function validateDevAccess() {
    return Promise.resolve(isDevAuthEnabled(environment));
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
