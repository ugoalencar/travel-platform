import type { FastifyInstance, FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import type { PrismaClient } from '@prisma/client';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerPlatformRoutes(
  app: FastifyInstance,
  _database: PrismaClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  platformAuthHooks: any[]
): void {
  // GET /platform/plans - List all plans
  app.get('/platform/plans', { preHandler: platformAuthHooks }, () => {
    return {
      plans: [
        {
          id: '1',
          name: 'Starter',
          slug: 'starter',
          description: 'For small travel agencies',
          price: '99.00',
          currency: 'BRL',
          billingInterval: 'MONTHLY',
          maxUsers: 10,
          maxCustomers: 100,
          storageGb: 100,
          features: { api_access: true, basic_support: true },
          active: true,
        },
      ],
    };
  });

  // POST /platform/plans - Create a plan
  app.post<{ Body: PlanCreateRequest }>(
    '/platform/plans',
    { preHandler: platformAuthHooks },
    (request) => {
      const body = request.body;
      return {
        plan: {
          id: 'new-plan-id',
          name: body.name,
          slug: body.slug,
          description: body.description,
          priceAmount: body.priceAmount,
          priceCurrency: body.priceCurrency,
          billingInterval: body.billingInterval,
          maxUsers: body.maxUsers,
          maxCustomers: body.maxCustomers,
          storageGb: body.storageGb,
          features: body.features,
          active: true,
        },
      };
    }
  );

  // GET /platform/subscriptions - List all subscriptions
  app.get('/platform/subscriptions', { preHandler: platformAuthHooks }, () => {
    return {
      subscriptions: [
        {
          id: '1',
          subscriber_tenant_id: '1',
          plan_id: '1',
          billing_interval: 'MONTHLY',
          amount: '99.00',
          currency: 'BRL',
          status: 'ACTIVE',
          legal_name: 'Example Agency',
          plan_name: 'Starter',
          created_at: new Date().toISOString(),
        },
      ],
    };
  });

  // GET /platform/leads - List leads
  app.get('/platform/leads', { preHandler: platformAuthHooks }, () => {
    return {
      leads: [
        {
          id: '1',
          name: 'John Doe',
          email: 'john@example.com',
          company_name: 'Example Travel',
          status: 'NEW',
          source: 'website',
          created_at: new Date().toISOString(),
        },
      ],
    };
  });

  // POST /platform/leads - Create a lead
  app.post<{ Body: LeadCreateRequest }>(
    '/platform/leads',
    { preHandler: platformAuthHooks },
    (request) => {
      const body = request.body;
      return {
        lead: {
          id: 'new-lead-id',
          name: body.name,
          email: body.email,
          companyName: body.companyName,
          phone: body.phone,
          status: body.status || 'NEW',
          source: body.source,
          created_at: new Date().toISOString(),
        },
      };
    }
  );

  // GET /platform/financial - Financial dashboard metrics
  app.get('/platform/financial', { preHandler: platformAuthHooks }, () => {
    return {
      metrics: {
        mrr: 28500,
        arr: 342000,
        activeSubscriptions: 42,
        cancelledSubscriptions: 2,
        churnRate: 2.3,
      },
    };
  });

  // GET /platform/subscribers - List subscriber tenants
  app.get('/platform/subscribers', { preHandler: platformAuthHooks }, () => {
    return {
      subscribers: [
        {
          id: '1',
          agency_id: 'agency-1',
          legal_name: 'Example Agency',
          contact_email: 'contact@example.com',
          subscription_status: 'ACTIVE',
          user_count: 10,
          customer_count: 100,
          plan_name: 'Starter',
          created_at: new Date().toISOString(),
        },
      ],
    };
  });
}
