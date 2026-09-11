/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-type-assertion */
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { requirePlatformRole } from './platform-auth';
import { PlatformUserRole } from '../../../packages/domain/types';
import { UnauthorizedError } from '../../../packages/domain/tenant-context';
import { ValidationError } from './errors';
import {
  listFeatureFlags,
  setFeatureFlagEnabled,
} from './feature-flags';
import {
  listPlans,
  createPlan,
  deletePlan,
  getPlanById,
  updatePlan,
  listSubscriptions,
  createSubscription,
  getSubscriptionById,
  updateSubscriptionStatus,
  listLeads,
  createLead,
  getLeadById,
  updateLeadStatus,
  listSubscriberTenants,
  getSubscriberTenantById,
  createSubscriberTenant,
  getFinancialMetrics,
  listInvoices,
  listPayments,
  listAuditLogs,
  getSubscriberGrowth,
  getMrrEvolution,
  getLeadFunnel,
  getPlanDistribution,
  getSettings,
  updateSettings,
  listSupportCases,
  createSupportCase,
  getSupportCaseById,
  updateSupportCase,
} from './platform-services';

interface PlanCreateRequest {
  name: string;
  slug: string;
  description?: string;
  priceAmount: number;
  priceCurrency: string;
  billingInterval: string;
  maxUsers?: number;
  maxCustomers?: number;
  storageGb?: number;
  features?: Record<string, unknown>;
}

interface LeadCreateRequest {
  name: string;
  email: string;
  companyName?: string;
  phone?: string;
  status?: string;
  source?: string;
}

interface SubscriptionCreateRequest {
  subscriberTenantId: string;
  planId: string;
  billingInterval: string;
  amount: number;
  currency: string;
}

export function registerPublicPlatformRoutes(
  app: FastifyInstance,
  database: PrismaClient
): void {
  // ==================== PUBLIC LEADS ====================

  // POST /public/leads - Create a lead (public endpoint, no auth required)
  app.post<{ Body: LeadCreateRequest }>(
    '/public/leads',
    async (request, reply) => {
      try {
        const lead = await createLead(database, request.body);
        reply.code(201);
        return { lead };
      } catch {
        reply.code(400);
        return { error: 'Failed to create lead' };
      }
    }
  );
}

export function registerPlatformRoutes(
  app: FastifyInstance,
  database: PrismaClient,
  platformAuthHooks: any[]
): void {
  // ==================== PLANS ====================

  // GET /platform/plans - List all plans
  app.get('/platform/plans', { preHandler: platformAuthHooks }, async () => {
    const plans = await listPlans(database);
    return { plans };
  });

  // POST /platform/plans - Create a plan
  app.post<{ Body: PlanCreateRequest }>(
    '/platform/plans',
    { preHandler: platformAuthHooks },
    async (request) => {
      const plan = await createPlan(database, request.body);
      return { plan };
    }
  );

  // GET /platform/plans/:id - Get plan detail
  app.get<{ Params: { id: string } }>(
    '/platform/plans/:id',
    { preHandler: platformAuthHooks },
    async (request) => {
      const plan = await getPlanById(database, request.params.id);
      if (!plan) {
        throw new Error('Plan not found');
      }
      return { plan };
    }
  );

  // PATCH /platform/plans/:id - Update plan
  app.patch<{ Params: { id: string }; Body: Partial<PlanCreateRequest> }>(
    '/platform/plans/:id',
    { preHandler: platformAuthHooks },
    async (request) => {
      const plan = await updatePlan(database, request.params.id, request.body as any);
      return { plan };
    }
  );

  // DELETE /platform/plans/:id - Soft-delete a plan from admin listings
  app.delete<{ Params: { id: string } }>(
    '/platform/plans/:id',
    { preHandler: platformAuthHooks },
    async (request) => {
      const plan = await deletePlan(database, request.params.id);
      return { plan };
    }
  );

  // ==================== SUBSCRIPTIONS ====================

  // GET /platform/subscriptions - List all subscriptions
  app.get('/platform/subscriptions', { preHandler: platformAuthHooks }, async () => {
    const subscriptions = await listSubscriptions(database);
    return { subscriptions };
  });

  // POST /platform/subscriptions - Create subscription
  app.post<{ Body: SubscriptionCreateRequest }>(
    '/platform/subscriptions',
    { preHandler: platformAuthHooks },
    async (request) => {
      const subscription = await createSubscription(database, request.body);
      return { subscription };
    }
  );

  // GET /platform/subscriptions/:id - Get subscription detail
  app.get<{ Params: { id: string } }>(
    '/platform/subscriptions/:id',
    { preHandler: platformAuthHooks },
    async (request) => {
      const subscription = await getSubscriptionById(database, request.params.id);
      if (!subscription) {
        throw new Error('Subscription not found');
      }
      return { subscription };
    }
  );

  // PATCH /platform/subscriptions/:id/status - Update subscription status
  app.patch<{ Params: { id: string }; Body: { status: string } }>(
    '/platform/subscriptions/:id/status',
    { preHandler: platformAuthHooks },
    async (request) => {
      const subscription = await updateSubscriptionStatus(
        database,
        request.params.id,
        request.body.status
      );
      return { subscription };
    }
  );

  // ==================== LEADS ====================

  // GET /platform/leads - List leads
  app.get('/platform/leads', { preHandler: platformAuthHooks }, async () => {
    const leads = await listLeads(database);
    return { leads };
  });

  // POST /platform/leads - Create a lead
  app.post<{ Body: LeadCreateRequest }>(
    '/platform/leads',
    { preHandler: platformAuthHooks },
    async (request) => {
      const lead = await createLead(database, request.body);
      return { lead };
    }
  );

  // GET /platform/leads/:id - Get lead detail
  app.get<{ Params: { id: string } }>(
    '/platform/leads/:id',
    { preHandler: platformAuthHooks },
    async (request) => {
      const lead = await getLeadById(database, request.params.id);
      if (!lead) {
        throw new Error('Lead not found');
      }
      return { lead };
    }
  );

  // PATCH /platform/leads/:id/status - Update lead status
  app.patch<{ Params: { id: string }; Body: { status: string } }>(
    '/platform/leads/:id/status',
    { preHandler: platformAuthHooks },
    async (request) => {
      const lead = await updateLeadStatus(database, request.params.id, request.body.status);
      return { lead };
    }
  );

  // ==================== SUBSCRIBERS ====================

  // GET /platform/subscribers - List subscriber tenants
  app.get('/platform/subscribers', { preHandler: platformAuthHooks }, async () => {
    const subscribers = await listSubscriberTenants(database);
    return { subscribers };
  });

  // POST /platform/subscribers - Create subscriber tenant
  app.post<{ Body: any }>(
    '/platform/subscribers',
    { preHandler: platformAuthHooks },
    async (request) => {
      const subscriber = await createSubscriberTenant(database, request.body as any);
      return { subscriber };
    }
  );

  // GET /platform/subscribers/:id - Get subscriber detail
  app.get<{ Params: { id: string } }>(
    '/platform/subscribers/:id',
    { preHandler: platformAuthHooks },
    async (request) => {
      const subscriber = await getSubscriberTenantById(database, request.params.id);
      if (!subscriber) {
        throw new Error('Subscriber not found');
      }
      return { subscriber };
    }
  );

  // ==================== FINANCIAL ====================

  // GET /platform/financial - Financial dashboard metrics
  app.get('/platform/financial', { preHandler: platformAuthHooks }, async () => {
    const metrics = await getFinancialMetrics(database);
    return { metrics };
  });

  // ==================== INVOICES ====================

  // GET /platform/invoices - List invoices
  app.get('/platform/invoices', { preHandler: platformAuthHooks }, async () => {
    const invoices = await listInvoices(database);
    return { invoices };
  });

  // GET /platform/payments - List billing payments
  app.get('/platform/payments', { preHandler: platformAuthHooks }, async () => {
    const payments = await listPayments(database);
    return { payments };
  });

  // ==================== AUDIT ====================

  // GET /platform/audit - List audit logs
  app.get('/platform/audit', { preHandler: platformAuthHooks }, async () => {
    const logs = await listAuditLogs(database);
    return { logs };
  });

  // ==================== ANALYTICS ====================

  // GET /platform/analytics/subscriber-growth - 12-month subscriber growth
  app.get('/platform/analytics/subscriber-growth', { preHandler: platformAuthHooks }, async () => {
    const data = await getSubscriberGrowth(database);
    return { data };
  });

  // GET /platform/analytics/mrr-evolution - 12-month MRR evolution
  app.get('/platform/analytics/mrr-evolution', { preHandler: platformAuthHooks }, async () => {
    const data = await getMrrEvolution(database);
    return { data };
  });

  // GET /platform/analytics/lead-funnel - Lead funnel by stage
  app.get('/platform/analytics/lead-funnel', { preHandler: platformAuthHooks }, async () => {
    const data = await getLeadFunnel(database);
    return { data };
  });

  // GET /platform/analytics/plan-distribution - Subscriptions by plan
  app.get('/platform/analytics/plan-distribution', { preHandler: platformAuthHooks }, async () => {
    const data = await getPlanDistribution(database);
    return { data };
  });

  // ==================== SETTINGS ====================

  // GET /platform/settings - Retrieve platform settings
  app.get('/platform/settings', { preHandler: platformAuthHooks }, async () => {
    const settings = await getSettings(database);
    return { settings };
  });

  // POST /platform/settings - Create default settings (if not exists)
  app.post<{ Body: any }>(
    '/platform/settings',
    { preHandler: platformAuthHooks },
    async (request) => {
      const settings = await updateSettings(database, request.body as any);
      return { settings };
    }
  );

  // PATCH /platform/settings - Update settings
  app.patch<{ Body: any }>(
    '/platform/settings',
    { preHandler: platformAuthHooks },
    async (request) => {
      const settings = await updateSettings(database, request.body as any);
      return { settings };
    }
  );

  // ==================== SUPPORT CASES ====================

  // GET /platform/support - List all support cases
  app.get('/platform/support', { preHandler: platformAuthHooks }, async () => {
    const cases = await listSupportCases(database);
    return { cases };
  });

  // POST /platform/support - Create support case
  app.post<{ Body: any }>(
    '/platform/support',
    { preHandler: platformAuthHooks },
    async (request) => {
      const supportCase = await createSupportCase(database, request.body as any);
      return { supportCase };
    }
  );

  // GET /platform/support/:id - Get support case detail
  app.get<{ Params: { id: string } }>(
    '/platform/support/:id',
    { preHandler: platformAuthHooks },
    async (request) => {
      const supportCase = await getSupportCaseById(database, request.params.id);
      if (!supportCase) {
        throw new Error('Support case not found');
      }
      return { supportCase };
    }
  );

  // PATCH /platform/support/:id - Update support case
  app.patch<{ Params: { id: string }; Body: any }>(
    '/platform/support/:id',
    { preHandler: platformAuthHooks },
    async (request) => {
      const supportCase = await updateSupportCase(database, request.params.id, request.body as any);
      return { supportCase };
    }
  );

  // ==================== FEATURE FLAGS ====================
  // Kill switches, not an authorization mechanism -- see feature-flags.ts
  // header comment. Read is available to any authenticated platform
  // principal (same posture as the other GET /platform/* list routes
  // above); the toggle is gated to PLATFORM_OWNER/PLATFORM_ADMIN only,
  // per the pack's "admin-only route to toggle it" requirement.

  // GET /platform/feature-flags - List all feature flags
  app.get('/platform/feature-flags', { preHandler: platformAuthHooks }, async () => {
    const flags = await listFeatureFlags(database as any);
    return { flags };
  });

  // POST /platform/feature-flags/:name/toggle - Admin-only kill switch
  app.post<{ Params: { name: string }; Body: { enabled?: unknown } }>(
    '/platform/feature-flags/:name/toggle',
    { preHandler: platformAuthHooks },
    async (request) => {
      requirePlatformRole(PlatformUserRole.PLATFORM_OWNER, PlatformUserRole.PLATFORM_ADMIN)(request);

      if (typeof request.body?.enabled !== 'boolean') {
        throw new ValidationError('Body must include a boolean "enabled" field');
      }

      const changedBy = request.platformAuth?.sub;
      if (!changedBy) {
        throw new UnauthorizedError('Missing platform principal');
      }

      const flag = await setFeatureFlagEnabled(database as any, request.params.name, {
        enabled: request.body.enabled,
        changedBy,
      });
      return { flag };
    }
  );
}
