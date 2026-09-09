/**
 * Platform Context Types
 * Defines types for platform-level authentication and authorization
 * Separate from tenant context (agency-based auth)
 */

export type PlatformUserRole =
  | 'PLATFORM_OWNER'
  | 'PLATFORM_ADMIN'
  | 'SUPPORT_ADMIN'
  | 'BILLING_ADMIN'
  | 'MARKETING_ADMIN'
  | 'READ_ONLY_AUDITOR';

/**
 * JWT payload for platform users
 * Distinct from tenant JWT which includes agency_id
 */
export interface PlatformAuthPayload {
  sub: string;              // platform_user_id
  email: string;
  platform_role: PlatformUserRole;
  type: 'platform';         // Distinguish from tenant type: 'tenant'
  exp: number;
  iat: number;
  mfa_verified?: boolean;
}

/**
 * Platform principal: Authenticated platform user context
 */
export interface PlatformPrincipal {
  id: string;               // platform_user_id
  email: string;
  role: PlatformUserRole;
  mfaVerified: boolean;
  loginTime: Date;
}

/**
 * Platform context: Available after auth in request
 */
export interface PlatformContext {
  principal: PlatformPrincipal;
  isAuthenticated: boolean;
}

/**
 * Role permissions: Map roles to required actions
 */
export const RolePermissions: Record<PlatformUserRole, PlatformUserRole[]> = {
  PLATFORM_OWNER: [
    'PLATFORM_OWNER',
    'PLATFORM_ADMIN',
    'SUPPORT_ADMIN',
    'BILLING_ADMIN',
    'MARKETING_ADMIN',
    'READ_ONLY_AUDITOR',
  ],
  PLATFORM_ADMIN: [
    'PLATFORM_ADMIN',
    'SUPPORT_ADMIN',
    'BILLING_ADMIN',
    'MARKETING_ADMIN',
    'READ_ONLY_AUDITOR',
  ],
  SUPPORT_ADMIN: ['SUPPORT_ADMIN', 'READ_ONLY_AUDITOR'],
  BILLING_ADMIN: ['BILLING_ADMIN', 'READ_ONLY_AUDITOR'],
  MARKETING_ADMIN: ['MARKETING_ADMIN', 'READ_ONLY_AUDITOR'],
  READ_ONLY_AUDITOR: ['READ_ONLY_AUDITOR'],
};

/**
 * Check if user has required role
 */
export function hasRole(
  userRole: PlatformUserRole,
  requiredRole: PlatformUserRole,
): boolean {
  return RolePermissions[userRole]?.includes(requiredRole) ?? false;
}

/**
 * Check minimum role level
 */
export function hasMinimumRole(
  userRole: PlatformUserRole,
  minimumRole: PlatformUserRole,
): boolean {
  const roleHierarchy: Record<PlatformUserRole, number> = {
    PLATFORM_OWNER: 6,
    PLATFORM_ADMIN: 5,
    SUPPORT_ADMIN: 4,
    BILLING_ADMIN: 4,
    MARKETING_ADMIN: 4,
    READ_ONLY_AUDITOR: 1,
  };
  return (roleHierarchy[userRole] ?? 0) >= (roleHierarchy[minimumRole] ?? 0);
}

/**
 * Impersonation context: When support team views tenant data
 */
export interface ImpersonationContext {
  supportUserId: string;
  impersonatedTenantId: string;
  reason: string;
  startedAt: Date;
  expiresAt: Date;  // 15 minutes from start
}

/**
 * Combined context: May be platform OR tenant
 */
export interface AuthContext {
  type: 'platform' | 'tenant';
  platform?: PlatformContext;
  tenant?: any;  // TenantContext from existing code
  impersonation?: ImpersonationContext;
}
