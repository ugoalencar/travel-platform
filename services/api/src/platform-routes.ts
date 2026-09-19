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
  getOrCreateLandingDraft,
  updateLandingDraft,
  listLandingSections,
  createLandingSection,
  updateLandingSection,
  deleteLandingSection,
  publishLanding,
  getPublishedLanding,
  listLandingPublications,
  listBanners,
  listActiveBannersForPlacement,
  createBanner,
  updateBanner,
  deleteBanner,
  listPartners,
  getPartnerById,
  listPublicPartners,
  createPartner,
  updatePartner,
  listReferrals,
  getReferralById,
  createReferral,
  updateReferralStatus,
  listPartnerBenefits,
  createPartnerBenefit,
  updatePartnerBenefitStatus,
  listReferralCredits,
  createReferralCredit,
  updateReferralCreditStatus,
  listPartnerCommissions,
  createPartnerCommission,
  updatePartnerCommissionStatus,
  recordCommercialAudit,
  searchAgencies,
} from './platform-commercial';
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
  startSupportSession,
  endSupportSession,
  listSupportSessions,
  NotFoundOrAlreadyClosedError,
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

  // ==================== PUBLIC LANDING / PARTNERS / BANNERS ====================
  // The ONLY reads the public landing site is allowed to use. Each of
  // these functions independently enforces its own "public" boundary at
  // the query level (published-only, is_public=true, ACTIVE+in-window) --
  // never returns draft content, internal notes, or private contacts.

  // GET /public/landing - published landing content (or null if never published)
  app.get('/public/landing', async () => {
    const landing = await getPublishedLanding(database);
    return { landing };
  });

  // GET /public/partners - public-safe partner directory
  app.get('/public/partners', async () => {
    const partners = await listPublicPartners(database);
    return { partners };
  });

  // GET /public/banners?placement=LANDING - active banners for a placement
  app.get<{ Querystring: { placement?: string } }>('/public/banners', async (request, reply) => {
    const placement = request.query.placement ?? 'LANDING';
    try {
      const banners = await listActiveBannersForPlacement(database, placement);
      return { banners };
    } catch (error) {
      if (error instanceof ValidationError) {
        reply.code(400);
        return { error: error.message };
      }
      throw error;
    }
  });
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

  // ==================== SUPPORT SESSION (audited "view as tenant") ====================
  // Spec: SUPPORT_CENTER.md "Support Session -- sem impersonation
  // invisivel. Sessao temporaria, tenant explicito, motivo, duracao,
  // read-only por padrao e auditoria." supportUserId is taken from the
  // authenticated platform principal (request.platformAuth.sub) -- never
  // from the request body -- so a session can never be opened/audited
  // under someone else's identity.

  // GET /platform/support-sessions - list audited sessions (open + closed)
  app.get('/platform/support-sessions', { preHandler: platformAuthHooks }, async () => {
    const sessions = await listSupportSessions(database);
    return { sessions };
  });

  // POST /platform/support-sessions - open a new audited support session
  app.post<{
    Body: { tenantId: string; reason: string; durationMinutes?: number; readOnly?: boolean };
  }>('/platform/support-sessions', { preHandler: platformAuthHooks }, async (request, reply) => {
    const supportUserId = (request as any).platformAuth?.sub;
    if (!supportUserId) {
      reply.code(401);
      return { error: 'Platform authentication required' };
    }

    const session = await startSupportSession(database, {
      supportUserId,
      tenantId: request.body.tenantId,
      reason: request.body.reason,
      durationMinutes: request.body.durationMinutes,
      readOnly: request.body.readOnly,
      ipAddress: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
    reply.code(201);
    return { session };
  });

  // PATCH /platform/support-sessions/:id/end - close an audited support session
  app.patch<{ Params: { id: string } }>(
    '/platform/support-sessions/:id/end',
    { preHandler: platformAuthHooks },
    async (request, reply) => {
      try {
        const session = await endSupportSession(database, request.params.id);
        return { session };
      } catch (error) {
        if (error instanceof NotFoundOrAlreadyClosedError) {
          reply.code(404);
          return { error: error.message, code: error.code };
        }
        throw error;
      }
    }
  );

  // ==================== COMERCIAL & PARCERIAS (META PÓS-PILOTO 01) ====================
  // Reads: any authenticated platform principal (platformAuthHooks), same
  // posture as every other GET /platform/* route above. Writes: gated
  // inline to PLATFORM_OWNER/PLATFORM_ADMIN only, same convention as the
  // feature-flags toggle above -- "Somente Platform Admin autorizado"
  // (spec section 11). Every mutating action also writes one row to
  // platform_audit_logs via recordCommercialAudit (spec section 10).
  function requireCommercialWriteAccess(request: any): { actorId: string; actorEmail?: string; actorRole?: string } {
    requirePlatformRole(PlatformUserRole.PLATFORM_OWNER, PlatformUserRole.PLATFORM_ADMIN)(request);
    const auth = request.platformAuth;
    if (!auth?.sub) throw new UnauthorizedError('Missing platform principal');
    return { actorId: auth.sub, actorEmail: auth.email, actorRole: auth.role };
  }

  // ---- Landing CMS ----

  app.get('/platform/landing', { preHandler: platformAuthHooks }, async () => {
    const page = await getOrCreateLandingDraft(database);
    const sections = await listLandingSections(database, page.id);
    const publications = await listLandingPublications(database, page.id);
    return { page, sections, publications };
  });

  app.patch<{ Params: { id: string }; Body: any }>(
    '/platform/landing/:id',
    { preHandler: platformAuthHooks },
    async (request) => {
      const actor = requireCommercialWriteAccess(request);
      const page = await updateLandingDraft(database, request.params.id, request.body as any, actor.actorId);
      await recordCommercialAudit(database, actor, 'UPDATED', 'landing_page', page.id, 'landing.draft.updated', request.body as any);
      return { page };
    }
  );

  app.post<{ Params: { id: string }; Body: any }>(
    '/platform/landing/:id/sections',
    { preHandler: platformAuthHooks },
    async (request, reply) => {
      const actor = requireCommercialWriteAccess(request);
      const section = await createLandingSection(database, request.params.id, request.body as any);
      await recordCommercialAudit(database, actor, 'CREATED', 'landing_section', section.id, 'landing.section.created', request.body as any);
      reply.code(201);
      return { section };
    }
  );

  app.patch<{ Params: { id: string }; Body: any }>(
    '/platform/landing/sections/:id',
    { preHandler: platformAuthHooks },
    async (request) => {
      const actor = requireCommercialWriteAccess(request);
      const section = await updateLandingSection(database, request.params.id, request.body as any);
      await recordCommercialAudit(database, actor, 'UPDATED', 'landing_section', section.id, 'landing.section.updated', request.body as any);
      return { section };
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/platform/landing/sections/:id',
    { preHandler: platformAuthHooks },
    async (request, reply) => {
      const actor = requireCommercialWriteAccess(request);
      await deleteLandingSection(database, request.params.id);
      await recordCommercialAudit(database, actor, 'DELETED', 'landing_section', request.params.id, 'landing.section.deleted');
      reply.code(204);
      return null;
    }
  );

  app.post<{ Params: { id: string } }>(
    '/platform/landing/:id/publish',
    { preHandler: platformAuthHooks },
    async (request, reply) => {
      const actor = requireCommercialWriteAccess(request);
      const publication = await publishLanding(database, request.params.id, actor.actorId);
      await recordCommercialAudit(database, actor, 'PUBLISHED', 'landing_page', request.params.id, 'landing.published', {
        publicationId: publication.id,
      });
      reply.code(201);
      return { publication };
    }
  );

  // ---- Banners ----

  app.get<{ Querystring: { placement?: string } }>(
    '/platform/banners',
    { preHandler: platformAuthHooks },
    async (request) => {
      const banners = await listBanners(database, request.query.placement);
      return { banners };
    }
  );

  app.post<{ Body: any }>('/platform/banners', { preHandler: platformAuthHooks }, async (request, reply) => {
    const actor = requireCommercialWriteAccess(request);
    const banner = await createBanner(database, request.body as any, actor.actorId);
    await recordCommercialAudit(database, actor, 'CREATED', 'banner', banner.id, 'banner.created', request.body as any);
    reply.code(201);
    return { banner };
  });

  app.patch<{ Params: { id: string }; Body: any }>(
    '/platform/banners/:id',
    { preHandler: platformAuthHooks },
    async (request) => {
      const actor = requireCommercialWriteAccess(request);
      const banner = await updateBanner(database, request.params.id, request.body as any);
      await recordCommercialAudit(database, actor, 'UPDATED', 'banner', banner.id, 'banner.updated', request.body as any);
      return { banner };
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/platform/banners/:id',
    { preHandler: platformAuthHooks },
    async (request, reply) => {
      const actor = requireCommercialWriteAccess(request);
      await deleteBanner(database, request.params.id);
      await recordCommercialAudit(database, actor, 'DELETED', 'banner', request.params.id, 'banner.deleted');
      reply.code(204);
      return null;
    }
  );

  // ---- Partners ----

  app.get('/platform/partners', { preHandler: platformAuthHooks }, async () => {
    const partners = await listPartners(database);
    return { partners };
  });

  app.get<{ Params: { id: string } }>(
    '/platform/partners/:id',
    { preHandler: platformAuthHooks },
    async (request) => {
      const partner = await getPartnerById(database, request.params.id);
      if (!partner) throw new ValidationError('Partner not found');
      return { partner };
    }
  );

  app.post<{ Body: any }>('/platform/partners', { preHandler: platformAuthHooks }, async (request, reply) => {
    const actor = requireCommercialWriteAccess(request);
    const partner = await createPartner(database, request.body as any, actor.actorId);
    await recordCommercialAudit(database, actor, 'CREATED', 'partner', partner.id, 'partner.created', request.body as any);
    reply.code(201);
    return { partner };
  });

  app.patch<{ Params: { id: string }; Body: any }>(
    '/platform/partners/:id',
    { preHandler: platformAuthHooks },
    async (request) => {
      const actor = requireCommercialWriteAccess(request);
      const partner = await updatePartner(database, request.params.id, request.body as any);
      await recordCommercialAudit(database, actor, 'UPDATED', 'partner', partner.id, 'partner.updated', request.body as any);
      return { partner };
    }
  );

  // ---- Referrals ----

  app.get('/platform/referrals', { preHandler: platformAuthHooks }, async () => {
    const referrals = await listReferrals(database);
    return { referrals };
  });

  app.get<{ Params: { id: string } }>(
    '/platform/referrals/:id',
    { preHandler: platformAuthHooks },
    async (request) => {
      const referral = await getReferralById(database, request.params.id);
      if (!referral) throw new ValidationError('Referral not found');
      return { referral };
    }
  );

  app.post<{ Body: any }>('/platform/referrals', { preHandler: platformAuthHooks }, async (request, reply) => {
    const actor = requireCommercialWriteAccess(request);
    const referral = await createReferral(database, request.body as any);
    await recordCommercialAudit(database, actor, 'CREATED', 'referral', referral.id, 'referral.created', request.body as any);
    reply.code(201);
    return { referral };
  });

  app.patch<{ Params: { id: string }; Body: { status: string; notes?: string } }>(
    '/platform/referrals/:id/status',
    { preHandler: platformAuthHooks },
    async (request) => {
      const actor = requireCommercialWriteAccess(request);
      const referral = await updateReferralStatus(
        database,
        request.params.id,
        request.body.status,
        request.body.notes
      );
      await recordCommercialAudit(database, actor, 'UPDATED', 'referral', referral.id, 'referral.status_changed', {
        status: request.body.status,
      });
      return { referral };
    }
  );

  // ---- Benefícios ----

  app.get<{ Querystring: { partnerId?: string } }>(
    '/platform/partner-benefits',
    { preHandler: platformAuthHooks },
    async (request) => {
      const benefits = await listPartnerBenefits(database, request.query.partnerId);
      return { benefits };
    }
  );

  app.post<{ Body: any }>(
    '/platform/partner-benefits',
    { preHandler: platformAuthHooks },
    async (request, reply) => {
      const actor = requireCommercialWriteAccess(request);
      const benefit = await createPartnerBenefit(database, request.body as any, actor.actorId);
      await recordCommercialAudit(database, actor, 'CREATED', 'partner_benefit', benefit.id, 'partner_benefit.created', request.body as any);
      reply.code(201);
      return { benefit };
    }
  );

  app.patch<{ Params: { id: string }; Body: { status: string } }>(
    '/platform/partner-benefits/:id',
    { preHandler: platformAuthHooks },
    async (request) => {
      const actor = requireCommercialWriteAccess(request);
      const benefit = await updatePartnerBenefitStatus(database, request.params.id, request.body.status);
      await recordCommercialAudit(database, actor, 'UPDATED', 'partner_benefit', benefit.id, 'partner_benefit.status_changed', {
        status: request.body.status,
      });
      return { benefit };
    }
  );

  // ---- Créditos ----

  app.get<{ Querystring: { agencyId?: string } }>(
    '/platform/referral-credits',
    { preHandler: platformAuthHooks },
    async (request) => {
      const credits = await listReferralCredits(database, request.query.agencyId);
      return { credits };
    }
  );

  app.post<{ Body: any }>(
    '/platform/referral-credits',
    { preHandler: platformAuthHooks },
    async (request, reply) => {
      const actor = requireCommercialWriteAccess(request);
      const credit = await createReferralCredit(database, request.body as any, actor.actorId);
      await recordCommercialAudit(database, actor, 'CREATED', 'referral_credit', credit.id, 'referral_credit.created', request.body as any);
      reply.code(201);
      return { credit };
    }
  );

  app.patch<{ Params: { id: string }; Body: { status: string } }>(
    '/platform/referral-credits/:id',
    { preHandler: platformAuthHooks },
    async (request) => {
      const actor = requireCommercialWriteAccess(request);
      const credit = await updateReferralCreditStatus(database, request.params.id, request.body.status);
      await recordCommercialAudit(database, actor, 'UPDATED', 'referral_credit', credit.id, 'referral_credit.status_changed', {
        status: request.body.status,
      });
      return { credit };
    }
  );

  // ---- Comissões ----

  app.get<{ Querystring: { partnerId?: string } }>(
    '/platform/partner-commissions',
    { preHandler: platformAuthHooks },
    async (request) => {
      const commissions = await listPartnerCommissions(database, request.query.partnerId);
      return { commissions };
    }
  );

  app.post<{ Body: any }>(
    '/platform/partner-commissions',
    { preHandler: platformAuthHooks },
    async (request, reply) => {
      const actor = requireCommercialWriteAccess(request);
      const commission = await createPartnerCommission(database, request.body as any);
      await recordCommercialAudit(
        database,
        actor,
        'CREATED',
        'partner_commission',
        commission.id,
        'partner_commission.created',
        request.body as any
      );
      reply.code(201);
      return { commission };
    }
  );

  app.patch<{ Params: { id: string }; Body: { status: string } }>(
    '/platform/partner-commissions/:id',
    { preHandler: platformAuthHooks },
    async (request) => {
      const actor = requireCommercialWriteAccess(request);
      const commission = await updatePartnerCommissionStatus(database, request.params.id, request.body.status);
      await recordCommercialAudit(
        database,
        actor,
        'UPDATED',
        'partner_commission',
        commission.id,
        'partner_commission.status_changed',
        { status: request.body.status }
      );
      return { commission };
    }
  );

  // ---- Busca de agência (seletor da tela de Créditos) ----

  app.get<{ Querystring: { q?: string } }>(
    '/platform/agencies/search',
    { preHandler: platformAuthHooks },
    async (request) => {
      const agencies = await searchAgencies(database, request.query.q ?? '');
      return { agencies };
    }
  );
}

function headerString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
