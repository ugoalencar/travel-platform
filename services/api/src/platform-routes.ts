import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
  listPlans,
  createPlan,
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
  listAuditLogs,
  createAuditLog,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerPlatformRoutes(
  app: FastifyInstance,
  database: PrismaClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // ==================== AUDIT ====================

  // GET /platform/audit - List audit logs
  app.get('/platform/audit', { preHandler: platformAuthHooks }, async () => {
    const logs = await listAuditLogs(database);
    return { logs };
  });
}
