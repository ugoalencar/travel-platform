import type { PrismaClient } from '@prisma/client';

// ==================== PLANS ====================

export async function listPlans(database: PrismaClient) {
  return database.plans.findMany({
    include: { entitlements: true },
    orderBy: { priceAmount: 'asc' },
  });
}

export async function getPlanById(database: PrismaClient, id: string) {
  return database.plans.findUnique({
    where: { id },
    include: { entitlements: true },
  });
}

export async function createPlan(
  database: PrismaClient,
  data: {
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
) {
  return database.plans.create({
    data: {
      name: data.name,
      slug: data.slug,
      description: data.description || '',
      priceAmount: data.priceAmount,
      priceCurrency: data.priceCurrency,
      billingInterval: data.billingInterval,
      maxUsers: data.maxUsers || 10,
      maxCustomers: data.maxCustomers || 100,
      storageGb: data.storageGb || 100,
      features: data.features || {},
      active: true,
    },
    include: { entitlements: true },
  });
}

export async function updatePlan(
  database: PrismaClient,
  id: string,
  data: Partial<{
    name: string;
    description: string;
    priceAmount: number;
    priceCurrency: string;
    maxUsers: number;
    maxCustomers: number;
    storageGb: number;
    features: Record<string, unknown>;
  }>
) {
  return database.plans.update({
    where: { id },
    data,
    include: { entitlements: true },
  });
}

// ==================== SUBSCRIPTIONS ====================

export async function listSubscriptions(database: PrismaClient) {
  return database.subscriptions.findMany({
    include: {
      plan: true,
      subscriberTenant: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getSubscriptionById(database: PrismaClient, id: string) {
  return database.subscriptions.findUnique({
    where: { id },
    include: {
      plan: true,
      subscriberTenant: true,
    },
  });
}

export async function createSubscription(
  database: PrismaClient,
  data: {
    subscriberTenantId: string;
    planId: string;
    billingInterval: string;
    amount: number;
    currency: string;
    status?: string;
  }
) {
  return database.subscriptions.create({
    data: {
      subscriberTenantId: data.subscriberTenantId,
      planId: data.planId,
      billingInterval: data.billingInterval,
      amount: data.amount,
      currency: data.currency,
      status: data.status || 'ACTIVE',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
    include: {
      plan: true,
      subscriberTenant: true,
    },
  });
}

export async function updateSubscriptionStatus(
  database: PrismaClient,
  id: string,
  status: string
) {
  return database.subscriptions.update({
    where: { id },
    data: { status },
    include: {
      plan: true,
      subscriberTenant: true,
    },
  });
}

// ==================== LEADS ====================

export async function listLeads(database: PrismaClient) {
  return database.leads.findMany({
    orderBy: { createdAt: 'desc' },
  });
}

export async function getLeadById(database: PrismaClient, id: string) {
  return database.leads.findUnique({
    where: { id },
  });
}

export async function createLead(
  database: PrismaClient,
  data: {
    name: string;
    email: string;
    companyName?: string;
    phone?: string;
    status?: string;
    source?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  }
) {
  return database.leads.create({
    data: {
      name: data.name,
      email: data.email,
      companyName: data.companyName || '',
      phone: data.phone || '',
      status: data.status || 'NEW',
      source: data.source || 'ORGANIC',
      utmSource: data.utmSource || null,
      utmMedium: data.utmMedium || null,
      utmCampaign: data.utmCampaign || null,
    },
  });
}

export async function updateLeadStatus(
  database: PrismaClient,
  id: string,
  status: string
) {
  return database.leads.update({
    where: { id },
    data: { status },
  });
}

// ==================== SUBSCRIBER TENANTS ====================

export async function listSubscriberTenants(database: PrismaClient) {
  return database.subscriberTenants.findMany({
    include: {
      subscriptions: {
        include: { plan: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getSubscriberTenantById(database: PrismaClient, id: string) {
  return database.subscriberTenants.findUnique({
    where: { id },
    include: {
      subscriptions: {
        include: { plan: true },
      },
    },
  });
}

export async function createSubscriberTenant(
  database: PrismaClient,
  data: {
    agencyId: string;
    legalName: string;
    contactEmail: string;
    contactPhone?: string;
    countryCode?: string;
  }
) {
  return database.subscriberTenants.create({
    data: {
      agencyId: data.agencyId,
      legalName: data.legalName,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone || '',
      countryCode: data.countryCode || 'BR',
      subscriptionStatus: 'TRIAL',
    },
    include: {
      subscriptions: {
        include: { plan: true },
      },
    },
  });
}

// ==================== FINANCIAL METRICS ====================

export async function getFinancialMetrics(database: PrismaClient) {
  const activeSubscriptions = await database.subscriptions.findMany({
    where: {
      status: { in: ['ACTIVE', 'TRIAL'] },
    },
    include: { plan: true },
  });

  const cancelledCount = await database.subscriptions.count({
    where: { status: 'CANCELLED' },
  });

  const totalCount = await database.subscriptions.count();

  const mrr = activeSubscriptions
    .filter((sub: any) => sub.billingInterval === 'MONTHLY')
    .reduce((sum: number, sub: any) => sum + sub.amount, 0);

  const arr = activeSubscriptions
    .filter((sub: any) => sub.billingInterval === 'ANNUAL')
    .reduce((sum: number, sub: any) => sum + sub.amount, 0) + mrr * 12;

  const churnRate = totalCount > 0 ? (cancelledCount / totalCount) * 100 : 0;

  return {
    mrr: Math.round(mrr * 100) / 100,
    arr: Math.round(arr * 100) / 100,
    activeSubscriptions: activeSubscriptions.length,
    trialCount: activeSubscriptions.filter((s: any) => s.status === 'TRIAL').length,
    cancelledSubscriptions: cancelledCount,
    churnRate: Math.round(churnRate * 100) / 100,
  };
}

// ==================== INVOICES ====================

export async function listInvoices(database: PrismaClient) {
  return database.billingInvoices.findMany({
    include: { subscription: { include: { plan: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getInvoiceById(database: PrismaClient, id: string) {
  return database.billingInvoices.findUnique({
    where: { id },
    include: { subscription: { include: { plan: true } } },
  });
}

// ==================== AUDIT LOGS ====================

export async function listAuditLogs(database: PrismaClient, limit = 100) {
  return database.platformAuditLogs.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function createAuditLog(
  database: PrismaClient,
  data: {
    platformUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    changes?: Record<string, unknown>;
    reason?: string;
  }
) {
  return database.platformAuditLogs.create({
    data: {
      platformUserId: data.platformUserId,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      changes: data.changes || {},
      reason: data.reason || null,
    },
  });
}
