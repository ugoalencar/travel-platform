/**
 * Route Security Classification
 *
 * Every route must belong to exactly one category. The default for
 * business/API routes is DENY/REQUIRE_AUTH. A route becomes accessible
 * only by explicit classification.
 *
 * Categories:
 * - PUBLIC: No auth required, no tenant data (health, readiness)
 * - AUTHENTICATED: Auth required, no specific tenant scope
 * - CUSTOMER_SCOPED: Customer auth pipeline, dual-scoped (agency + customer)
 * - STAFF_SCOPED: Staff auth pipeline, tenant-scoped via agency
 * - SYSTEM_INTERNAL: Platform stopgap, custom auth (documented temporary)
 * - TEST_ONLY: Conditionally mounted, must not exist in production
 */

export enum RouteClassification {
  PUBLIC = 'PUBLIC',
  AUTHENTICATED = 'AUTHENTICATED',
  CUSTOMER_SCOPED = 'CUSTOMER_SCOPED',
  STAFF_SCOPED = 'STAFF_SCOPED',
  SYSTEM_INTERNAL = 'SYSTEM_INTERNAL',
  TEST_ONLY = 'TEST_ONLY',
}

export interface RouteMetadata {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  path: string;
  classification: RouteClassification;
  authPipeline: 'none' | 'protectedHooks' | 'customerHooks' | 'systemInternal' | 'testOnly';
  role?: string;
  entitlement?: string;
  publicJustification?: string | undefined;
}

/**
 * In-memory route registry for security audit and testing.
 * Populated during route registration, queryable for tests.
 */
const routeRegistry: RouteMetadata[] = [];

/**
 * Register a route's security metadata.
 * Called once per route during app initialization.
 */
export function registerRoute(metadata: RouteMetadata): void {
  routeRegistry.push(metadata);
}

/**
 * Get all registered routes.
 * Used for security tests and audit reports.
 */
export function getRegisteredRoutes(): ReadonlyArray<RouteMetadata> {
  return routeRegistry;
}

/**
 * Get routes by classification.
 */
export function getRoutesByClassification(classification: RouteClassification): RouteMetadata[] {
  return routeRegistry.filter(r => r.classification === classification);
}

/**
 * Get unclassified routes (should be empty after full audit).
 */
export function getUnclassifiedRoutes(): RouteMetadata[] {
  return routeRegistry.filter(r => !r.classification);
}

/**
 * Clear registry (for testing only).
 */
export function clearRouteRegistry(): void {
  routeRegistry.length = 0;
}

/**
 * Validate that all routes are classified.
 * Returns array of violations (should be empty).
 */
export function validateRouteClassifications(): string[] {
  const violations: string[] = [];

  for (const route of routeRegistry) {
    if (!route.classification) {
      violations.push(`${route.method} ${route.path} - missing classification`);
    }
    if (!route.authPipeline) {
      violations.push(`${route.method} ${route.path} - missing auth pipeline`);
    }
    if (route.classification === RouteClassification.PUBLIC && !route.publicJustification) {
      violations.push(`${route.method} ${route.path} - PUBLIC route missing justification`);
    }
  }

  return violations;
}

/**
 * SECURITY PRINCIPLE: Deny by default.
 *
 * This function validates that a route has explicit auth configuration.
 * If a route is not classified or has no auth pipeline, it should be
 * rejected during registration.
 */
export function validateSecureDefault(metadata: RouteMetadata): string[] {
  const errors: string[] = [];

  // Every route must have a classification
  if (!metadata.classification) {
    errors.push(`${metadata.method} ${metadata.path} - must have explicit classification`);
  }

  // Only PUBLIC routes can skip auth pipeline
  if (metadata.classification !== RouteClassification.PUBLIC &&
      metadata.classification !== RouteClassification.TEST_ONLY &&
      metadata.authPipeline === 'none') {
    errors.push(`${metadata.method} ${metadata.path} - non-public route must have auth pipeline`);
  }

  // PUBLIC routes must have justification
  if (metadata.classification === RouteClassification.PUBLIC && !metadata.publicJustification) {
    errors.push(`${metadata.method} ${metadata.path} - PUBLIC route must document justification`);
  }

  // TEST_ONLY routes must not exist in production
  if (metadata.classification === RouteClassification.TEST_ONLY) {
    // This is validated at runtime, not registration time
  }

  return errors;
}
