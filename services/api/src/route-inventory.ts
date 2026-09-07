/**
 * Route Security Inventory
 *
 * This file contains the complete inventory of all API routes with their
 * security classification, auth pipeline, role requirements, and entitlements.
 *
 * Generated from app.ts audit. Any new routes must be added here.
 *
 * SECURITY PRINCIPLE: Every route must be explicitly classified.
 * The default is DENY/REQUIRE_AUTH.
 */

import {
  registerRoute,
  RouteClassification,
} from './route-classification';

/**
 * Register all routes with their security metadata.
 * Called once during app initialization.
 */
export function registerAllRoutes(): void {
  // ============================================================
  // PUBLIC ROUTES (no auth required)
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/health',
    classification: RouteClassification.PUBLIC,
    authPipeline: 'none',
    publicJustification: 'Infrastructure health check. No tenant/business data exposed.',
  });

  registerRoute({
    method: 'GET',
    path: '/readiness',
    classification: RouteClassification.PUBLIC,
    authPipeline: 'none',
    publicJustification: 'Infrastructure readiness check. No tenant/business data exposed.',
  });

  // ============================================================
  // CUSTOMER PORTAL (end-customer facing, read-only)
  // Auth pipeline: customerHooks (customerAuthenticate + establishCustomerTenant)
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/customer-api/me',
    classification: RouteClassification.CUSTOMER_SCOPED,
    authPipeline: 'customerHooks',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/customer-api/agency-contact',
    classification: RouteClassification.CUSTOMER_SCOPED,
    authPipeline: 'customerHooks',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/customer-api/trips',
    classification: RouteClassification.CUSTOMER_SCOPED,
    authPipeline: 'customerHooks',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/customer-api/trips/:id',
    classification: RouteClassification.CUSTOMER_SCOPED,
    authPipeline: 'customerHooks',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/customer-api/offers',
    classification: RouteClassification.CUSTOMER_SCOPED,
    authPipeline: 'customerHooks',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/customer-api/offers/:id',
    classification: RouteClassification.CUSTOMER_SCOPED,
    authPipeline: 'customerHooks',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/customer-api/proposals',
    classification: RouteClassification.CUSTOMER_SCOPED,
    authPipeline: 'customerHooks',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/customer-api/proposals/:id',
    classification: RouteClassification.CUSTOMER_SCOPED,
    authPipeline: 'customerHooks',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/customer-api/bookings',
    classification: RouteClassification.CUSTOMER_SCOPED,
    authPipeline: 'customerHooks',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/customer-api/bookings/:id',
    classification: RouteClassification.CUSTOMER_SCOPED,
    authPipeline: 'customerHooks',
    publicJustification: undefined,
  });

  // ============================================================
  // STAFF AUTH ROUTES
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/me',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/tenant-proof',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    publicJustification: undefined,
  });

  // ============================================================
  // CUSTOMERS
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/customers',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/customers/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/customers',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'PATCH',
    path: '/customers/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  // ============================================================
  // WISHES
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/wishes',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/wishes/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/wishes',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'PATCH',
    path: '/wishes/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  // ============================================================
  // TRIPS
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/trips',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/trips/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/trips',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'PATCH',
    path: '/trips/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  // ============================================================
  // OFFERS
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/offers',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/offers/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/offers',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'PATCH',
    path: '/offers/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  // ============================================================
  // PROPOSALS
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/proposals',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/proposals/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/proposals',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'PATCH',
    path: '/proposals/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/proposals/:id/send',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/proposals/:id/cancel',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/proposals/:id/accept',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/proposals/:id/decline',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  // ============================================================
  // TRANSPORT — Routes
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/transport/routes',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/transport/routes/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/transport/routes',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'PATCH',
    path: '/transport/routes/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/transport/routes/:routeId/points',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/transport/routes/:routeId/points',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'PATCH',
    path: '/transport/routes/:routeId/points/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/transport/routes/:routeId/points/reorder',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  // ============================================================
  // TRANSPORT — Suppliers
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/transport/suppliers',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/transport/suppliers/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/transport/suppliers',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'PATCH',
    path: '/transport/suppliers/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  // ============================================================
  // SUPPLIERS (generic alias of the same suppliers entity/table used above)
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/suppliers',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/suppliers/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/suppliers',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'PATCH',
    path: '/suppliers/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'DELETE',
    path: '/suppliers/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  // ============================================================
  // TRANSPORT — Products
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/transport/products',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/transport/products/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/transport/products',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'PATCH',
    path: '/transport/products/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  // ============================================================
  // TRANSPORT — Departures
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/transport/departures',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/transport/departures/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/transport/departures',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'PATCH',
    path: '/transport/departures/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  // ============================================================
  // TRANSPORT — Agenda
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/transport/agenda',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  // ============================================================
  // BOOKINGS
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/bookings',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/bookings/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/bookings',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/bookings/:id/cancel',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  // ============================================================
  // FIELD OPERATIONS
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/operations',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/operational-staff',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/operations/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/operations',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/operations/:id/assignments',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/operations/:id/checkpoints/:checkpointId/arrival',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/operations/:id/checkpoints/:checkpointId/departure',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  // ============================================================
  // COMMERCIAL COCKPIT — Opportunities
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/commercial/opportunities',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/commercial/opportunities/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/commercial/opportunities',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'PATCH',
    path: '/commercial/opportunities/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  // ============================================================
  // COMMERCIAL COCKPIT — Tasks
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/commercial/tasks',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/commercial/tasks/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/commercial/tasks',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'PATCH',
    path: '/commercial/tasks/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  // ============================================================
  // COMMERCIAL COCKPIT — Interactions
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/commercial/interactions',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/commercial/interactions',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  // ============================================================
  // COMMERCIAL COCKPIT — Search & Dashboard
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/commercial/customers/search',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/commercial/travel-search',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/commercial/dashboard',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/commercial/proposals-waiting',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/commercial/post-sale-candidates',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  // ============================================================
  // PIPELINE CONFIG
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/commercial/pipelines',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/commercial/pipelines',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'ADMIN',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/commercial/pipelines/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'PATCH',
    path: '/commercial/pipelines/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'ADMIN',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/commercial/pipelines/:id/stages',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/commercial/pipelines/:id/stages',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'ADMIN',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'PATCH',
    path: '/commercial/pipelines/:id/stages/:stageId',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'ADMIN',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/commercial/pipelines/:id/access',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'ADMIN',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/commercial/pipelines/:id/access',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'ADMIN',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'DELETE',
    path: '/commercial/pipelines/:id/access/:userId',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'ADMIN',
    publicJustification: undefined,
  });

  // ============================================================
  // SALES
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/sales',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/sales/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/sales',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'PATCH',
    path: '/sales/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/sales/:id/confirm',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/sales/:id/cancel',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/sales/:id/mark-paid',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  // ============================================================
  // FINANCIAL — Read
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/financial/receivables',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/financial/payables',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/financial/payments',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/financial/payments/:id/allocations',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/financial/operational-costs',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/financial/allocations',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/financial/sales/:id/margin',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/financial/sales/:id/story',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/financial/dashboard',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/financial/dre',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  // ============================================================
  // FINANCIAL — Write
  // ============================================================

  registerRoute({
    method: 'POST',
    path: '/financial/receivables',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'ADMIN',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/financial/payables',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'ADMIN',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/financial/payments',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'ADMIN',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/financial/payments/:id/allocations',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'ADMIN',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/financial/operational-costs',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'ADMIN',
    publicJustification: undefined,
  });

  // ============================================================
  // PESCADOR (External Offer Captures)
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/pescador/captures',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/pescador/captures',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/pescador/captures/:id/review',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/pescador/captures/:id/approve',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/pescador/captures/:id/reject',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/pescador/captures/:id/publish',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'ADMIN',
    publicJustification: undefined,
  });

  // ============================================================
  // OFFER & GROWTH ENGINE — Assets
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/assets',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    entitlement: 'CREATIVE_STUDIO',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/assets',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    entitlement: 'CREATIVE_STUDIO',
    publicJustification: undefined,
  });

  // ============================================================
  // OFFER & GROWTH ENGINE — Campaigns
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/campaigns',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    entitlement: 'CAMPAIGNS',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/campaigns/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    entitlement: 'CAMPAIGNS',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/campaigns',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    entitlement: 'CAMPAIGNS',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/campaigns/:id/offers',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    entitlement: 'CAMPAIGNS',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/campaigns/:id/status',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    entitlement: 'CAMPAIGNS',
    publicJustification: undefined,
  });

  // ============================================================
  // OFFER & GROWTH ENGINE — Publications
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/publications',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    entitlement: 'SOCIAL_PUBLISHING',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/publications/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    entitlement: 'SOCIAL_PUBLISHING',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/publications',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    entitlement: 'SOCIAL_PUBLISHING',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/publications/:id/snapshot',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    entitlement: 'SOCIAL_PUBLISHING',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/publications/:id/publish',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    entitlement: 'SOCIAL_PUBLISHING',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/publications/:id/status',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    entitlement: 'SOCIAL_PUBLISHING',
    publicJustification: undefined,
  });

  // ============================================================
  // OFFER & GROWTH ENGINE — Engagements
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/engagements',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    entitlement: 'SOCIAL_AUTOMATION',
    publicJustification: undefined,
  });

  // ============================================================
  // OFFER & GROWTH ENGINE — Automations
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/automations',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    entitlement: 'SOCIAL_AUTOMATION',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/automations/:id',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    entitlement: 'SOCIAL_AUTOMATION',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/automations',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    entitlement: 'SOCIAL_AUTOMATION',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/automations/:id/activate',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    entitlement: 'SOCIAL_AUTOMATION',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/automations/:id/pause',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    entitlement: 'SOCIAL_AUTOMATION',
    publicJustification: undefined,
  });

  // ============================================================
  // CONNECTORS (Internal Mock)
  // ============================================================

  registerRoute({
    method: 'POST',
    path: '/connectors/internal-mock/simulate',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    entitlement: 'SOCIAL_AUTOMATION',
    publicJustification: undefined,
  });

  // ============================================================
  // COUPONS
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/coupons',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    entitlement: 'CAMPAIGNS',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/coupons',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    entitlement: 'CAMPAIGNS',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/coupons/grants',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    entitlement: 'CAMPAIGNS',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/coupons/redemptions',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    entitlement: 'CAMPAIGNS',
    publicJustification: undefined,
  });

  // ============================================================
  // ENTITLEMENTS
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/entitlements',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  // ============================================================
  // AUDIT LOG
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/offer-growth/audit-log',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  // ============================================================
  // PLATFORM STOPGAP (documented temporary gap)
  // ============================================================

  registerRoute({
    method: 'POST',
    path: '/platform/entitlements',
    classification: RouteClassification.SYSTEM_INTERNAL,
    authPipeline: 'systemInternal',
    publicJustification: undefined,
  });


  // ============================================================
  // CUSTOMER 360 (Task 4): addresses, dependents, documents,
  // attachments, OCR extraction, verification, document audit trail.
  // All staff-scoped behind protectedHooks; see
  // routes/customer-documents.ts for the handlers.
  // ============================================================

  registerRoute({
    method: 'GET',
    path: '/customers/:customerId/addresses',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/customers/:customerId/addresses/:addressId',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/customers/:customerId/addresses',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'PATCH',
    path: '/customers/:customerId/addresses/:addressId',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'DELETE',
    path: '/customers/:customerId/addresses/:addressId',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/customers/:customerId/dependents',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/customers/:customerId/dependents/:dependentId',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/customers/:customerId/dependents',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'PATCH',
    path: '/customers/:customerId/dependents/:dependentId',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'DELETE',
    path: '/customers/:customerId/dependents/:dependentId',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/customers/:customerId/documents',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/customers/:customerId/documents/:documentId',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/customers/:customerId/documents',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'PATCH',
    path: '/customers/:customerId/documents/:documentId',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'DELETE',
    path: '/customers/:customerId/documents/:documentId',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/documents/:documentId/attachments',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/documents/:documentId/attachments',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'DELETE',
    path: '/documents/:documentId/attachments/:attachmentId',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/documents/:documentId/extract',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/documents/:documentId/extractions',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/documents/:documentId/extraction/:extractionId',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/documents/:documentId/verify',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'AGENT',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/documents/:documentId/verification',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'VIEWER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/documents/:documentId/verification/:verificationId/manual-review',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/customers/:customerId/audit-log',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'GET',
    path: '/documents/:documentId/audit-log',
    classification: RouteClassification.STAFF_SCOPED,
    authPipeline: 'protectedHooks',
    role: 'MANAGER',
    publicJustification: undefined,
  });

  // ============================================================
  // TEST ROUTES (only when exposeTestRoutes === true)
  // ============================================================

  registerRoute({
    method: 'POST',
    path: '/__test/rate-limit-proof',
    classification: RouteClassification.TEST_ONLY,
    authPipeline: 'protectedHooks',
    publicJustification: undefined,
  });

  registerRoute({
    method: 'POST',
    path: '/__test/rollback-proof',
    classification: RouteClassification.TEST_ONLY,
    authPipeline: 'protectedHooks',
    publicJustification: undefined,
  });
}
