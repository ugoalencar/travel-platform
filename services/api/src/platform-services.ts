/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import type { DatabaseRuntime, TenantTransactionClient } from './database';

type JsonObject = Record<string, unknown>;

interface PlanCreateInput {
  name: string;
  slug?: string;
  description?: string;
  priceAmount?: number;
  priceCurrency?: string;
  billingInterval?: string;
  maxUsers?: number;
  maxCustomers?: number;
  storageGb?: number;
  features?: JsonObject;
  price_monthly?: number | null;
  price_annual?: number | null;
  currency?: string;
  max_users?: number;
  max_customers?: number;
  max_storage_gb?: number;
}

interface LeadCreateInput {
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

interface SubscriptionCreateInput {
  subscriberTenantId: string;
  planId: string;
  billingInterval: string;
  amount: number;
  currency: string;
  status?: string;
}

interface SubscriberTenantCreateInput {
  agencyId: string;
  legalName: string;
  contactEmail: string;
  contactPhone?: string;
}

interface SupportCaseCreateInput {
  subscriberTenantId: string;
  title: string;
  description: string;
  priority?: string;
}

export async function listPlans(database: DatabaseRuntime) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `
        SELECT
          p.id,
          p.name,
          p.slug,
          p.description,
          CASE WHEN p.billing_interval = 'MONTHLY' THEN p.price_amount::float ELSE NULL END AS price_monthly,
          CASE WHEN p.billing_interval = 'YEARLY' THEN p.price_amount::float ELSE NULL END AS price_annual,
          p.price_amount::float AS "priceAmount",
          p.price_currency AS currency,
          p.price_currency AS "priceCurrency",
          p.billing_interval AS "billingInterval",
          p.max_users,
          p.max_users AS "maxUsers",
          p.max_customers,
          p.max_customers AS "maxCustomers",
          p.storage_gb AS max_storage_gb,
          p.storage_gb AS "storageGb",
          p.features,
          p.active,
          p.created_at,
          p.created_at AS "createdAt",
          p.updated_at,
          p.updated_at AS "updatedAt",
          COALESCE(
            json_agg(e ORDER BY e.feature_key) FILTER (WHERE e.id IS NOT NULL),
            '[]'::json
          ) AS entitlements
        FROM plans p
        LEFT JOIN entitlements e ON e.plan_id = p.id
        GROUP BY p.id
        ORDER BY p.price_amount ASC, p.name ASC
      `
    );
    return result.rows;
  });
}

export async function getPlanById(database: DatabaseRuntime, id: string) {
  const plans = await withPlatform(database, async (client) => {
    const result = await client.query(
      `
        SELECT
          p.id,
          p.name,
          p.slug,
          p.description,
          CASE WHEN p.billing_interval = 'MONTHLY' THEN p.price_amount::float ELSE NULL END AS price_monthly,
          CASE WHEN p.billing_interval = 'YEARLY' THEN p.price_amount::float ELSE NULL END AS price_annual,
          p.price_amount::float AS "priceAmount",
          p.price_currency AS currency,
          p.price_currency AS "priceCurrency",
          p.billing_interval AS "billingInterval",
          p.max_users,
          p.max_customers,
          p.storage_gb AS max_storage_gb,
          p.features,
          p.active,
          p.created_at,
          p.updated_at
        FROM plans p
        WHERE p.id = $1
      `,
      [id]
    );
    return result.rows;
  });
  return plans[0] ?? null;
}

export async function createPlan(database: DatabaseRuntime, data: PlanCreateInput) {
  const billingInterval =
    data.billingInterval ?? (data.price_annual && !data.price_monthly ? 'YEARLY' : 'MONTHLY');
  const amount = data.priceAmount ?? data.price_monthly ?? data.price_annual ?? 0;
  const slug = data.slug ?? slugify(data.name);

  return withPlatform(database, async (client) => {
    const result = await client.query(
      `
        INSERT INTO plans (
          name, slug, description, price_amount, price_currency, billing_interval,
          max_users, max_customers, storage_gb, features, active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
        RETURNING id
      `,
      [
        data.name,
        slug,
        data.description ?? '',
        amount,
        data.priceCurrency ?? data.currency ?? 'BRL',
        normalizeBillingInterval(billingInterval),
        data.maxUsers ?? data.max_users ?? 10,
        data.maxCustomers ?? data.max_customers ?? 100,
        data.storageGb ?? data.max_storage_gb ?? 100,
        data.features ?? {},
      ]
    );
    return getPlanById(database, String(result.rows[0]?.id));
  });
}

export async function updatePlan(database: DatabaseRuntime, id: string, data: Partial<PlanCreateInput>) {
  return withPlatform(database, async (client) => {
    await client.query(
      `
        UPDATE plans
        SET
          name = COALESCE($2, name),
          description = COALESCE($3, description),
          price_amount = COALESCE($4, price_amount),
          price_currency = COALESCE($5, price_currency),
          max_users = COALESCE($6, max_users),
          max_customers = COALESCE($7, max_customers),
          storage_gb = COALESCE($8, storage_gb),
          features = COALESCE($9, features),
          updated_at = now()
        WHERE id = $1
      `,
      [
        id,
        data.name,
        data.description,
        data.priceAmount ?? data.price_monthly ?? data.price_annual,
        data.priceCurrency ?? data.currency,
        data.maxUsers ?? data.max_users,
        data.maxCustomers ?? data.max_customers,
        data.storageGb ?? data.max_storage_gb,
        data.features,
      ]
    );
    return getPlanById(database, id);
  });
}

export async function deletePlan(database: DatabaseRuntime, id: string) {
  return withPlatform(database, async (client) => {
    await client.query('UPDATE plans SET active = false, updated_at = now() WHERE id = $1', [id]);
    return { id, active: false };
  });
}

export async function listSubscriptions(database: DatabaseRuntime) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `
        SELECT
          s.id,
          st.id AS tenant_id,
          COALESCE(st.trade_name, st.legal_name, st.contact_name) AS tenant_name,
          p.id AS plan_id,
          p.name AS plan_name,
          st.subscription_status AS status,
          s.billing_interval,
          s.amount::float AS amount,
          s.currency,
          s.current_period_start AS started_at,
          st.cancelled_at AS ended_at,
          s.created_at,
          s.updated_at,
          json_build_object('id', p.id, 'name', p.name) AS plan,
          json_build_object('id', st.id, 'legalName', st.legal_name, 'contactName', st.contact_name) AS "subscriberTenant"
        FROM subscriptions s
        JOIN subscriber_tenants st ON st.id = s.subscriber_tenant_id
        JOIN plans p ON p.id = s.plan_id
        ORDER BY s.created_at DESC
      `
    );
    return result.rows;
  });
}

export async function getSubscriptionById(database: DatabaseRuntime, id: string) {
  const subscriptions = await listSubscriptions(database);
  return subscriptions.find((subscription) => subscription.id === id) ?? null;
}

export async function createSubscription(database: DatabaseRuntime, data: SubscriptionCreateInput) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `
        INSERT INTO subscriptions (
          subscriber_tenant_id, plan_id, billing_interval, amount, currency,
          current_period_start, current_period_end, next_billing_date
        )
        VALUES ($1, $2, $3, $4, $5, now(), now() + interval '30 days', now() + interval '30 days')
        RETURNING id
      `,
      [
        data.subscriberTenantId,
        data.planId,
        normalizeBillingInterval(data.billingInterval),
        data.amount,
        data.currency,
      ]
    );
    if (data.status) {
      await updateSubscriptionStatus(database, String(result.rows[0]?.id), data.status);
    }
    return getSubscriptionById(database, String(result.rows[0]?.id));
  });
}

export async function updateSubscriptionStatus(database: DatabaseRuntime, id: string, status: string) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `
        UPDATE subscriber_tenants st
        SET
          subscription_status = $2::subscription_status,
          suspended_at = CASE WHEN $2 = 'SUSPENDED' THEN now() ELSE suspended_at END,
          cancelled_at = CASE WHEN $2 = 'CANCELLED' THEN now() ELSE cancelled_at END,
          updated_at = now()
        FROM subscriptions s
        WHERE s.subscriber_tenant_id = st.id AND s.id = $1
        RETURNING s.id
      `,
      [id, status]
    );
    return result.rows.length > 0 ? getSubscriptionById(database, id) : null;
  });
}

export async function listLeads(database: DatabaseRuntime) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `
        SELECT
          id,
          company_name,
          name AS contact_name,
          name,
          email,
          phone,
          status,
          COALESCE(source, 'ORGANIC') AS source,
          created_at,
          updated_at
        FROM leads
        ORDER BY created_at DESC
      `
    );
    return result.rows;
  });
}

export async function getLeadById(database: DatabaseRuntime, id: string) {
  const leads = await listLeads(database);
  return leads.find((lead) => lead.id === id) ?? null;
}

export async function createLead(database: DatabaseRuntime, data: LeadCreateInput) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `
        INSERT INTO leads (
          name, email, company_name, phone, status, source, utm_source, utm_medium, utm_campaign
        )
        VALUES ($1, $2, $3, $4, COALESCE($5, 'NEW')::lead_status, COALESCE($6, 'ORGANIC'), $7, $8, $9)
        RETURNING id
      `,
      [
        data.name,
        data.email,
        data.companyName ?? '',
        data.phone ?? '',
        data.status,
        data.source,
        data.utmSource,
        data.utmMedium,
        data.utmCampaign,
      ]
    );
    return getLeadById(database, String(result.rows[0]?.id));
  });
}

export async function updateLeadStatus(database: DatabaseRuntime, id: string, status: string) {
  return withPlatform(database, async (client) => {
    await client.query(
      'UPDATE leads SET status = $2::lead_status, updated_at = now() WHERE id = $1',
      [id, status]
    );
    return getLeadById(database, id);
  });
}

export async function listSubscriberTenants(database: DatabaseRuntime) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `
        SELECT
          st.id,
          COALESCE(st.trade_name, st.legal_name, st.contact_name) AS name,
          st.contact_email AS email,
          st.contact_phone AS phone,
          '' AS city,
          'BR' AS country,
          CASE
            WHEN st.subscription_status IN ('ACTIVE', 'TRIAL', 'COURTESY') THEN 'ACTIVE'
            WHEN st.subscription_status = 'SUSPENDED' THEN 'SUSPENDED'
            ELSE 'INACTIVE'
          END AS status,
          st.created_at,
          st.updated_at,
          json_build_object(
            'plan_id', p.id,
            'plan_name', p.name,
            'status', st.subscription_status
          ) AS subscription,
          COALESCE(
            json_agg(
              json_build_object('id', s.id, 'plan', json_build_object('id', p.id, 'name', p.name))
            ) FILTER (WHERE s.id IS NOT NULL),
            '[]'::json
          ) AS subscriptions
        FROM subscriber_tenants st
        LEFT JOIN subscriptions s ON s.subscriber_tenant_id = st.id
        LEFT JOIN plans p ON p.id = s.plan_id
        GROUP BY st.id, p.id, p.name
        ORDER BY st.created_at DESC
      `
    );
    return result.rows;
  });
}

export async function getSubscriberTenantById(database: DatabaseRuntime, id: string) {
  const subscribers = await listSubscriberTenants(database);
  return subscribers.find((subscriber) => subscriber.id === id) ?? null;
}

export async function createSubscriberTenant(database: DatabaseRuntime, data: SubscriberTenantCreateInput) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `
        INSERT INTO subscriber_tenants (
          agency_id, legal_name, contact_name, contact_email, contact_phone, subscription_status
        )
        VALUES ($1, $2, $2, $3, $4, 'TRIAL')
        RETURNING id
      `,
      [data.agencyId, data.legalName, data.contactEmail, data.contactPhone ?? '']
    );
    return getSubscriberTenantById(database, String(result.rows[0]?.id));
  });
}

export async function getFinancialMetrics(database: DatabaseRuntime) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `
        SELECT
          COALESCE(SUM(
            CASE
              WHEN st.subscription_status IN ('ACTIVE', 'TRIAL', 'COURTESY') AND s.billing_interval = 'MONTHLY'
                THEN s.amount
              WHEN st.subscription_status IN ('ACTIVE', 'TRIAL', 'COURTESY') AND s.billing_interval = 'QUARTERLY'
                THEN s.amount / 3
              WHEN st.subscription_status IN ('ACTIVE', 'TRIAL', 'COURTESY') AND s.billing_interval = 'YEARLY'
                THEN s.amount / 12
              ELSE 0
            END
          ), 0)::float AS mrr,
          COUNT(*) FILTER (WHERE st.subscription_status IN ('ACTIVE', 'TRIAL', 'COURTESY'))::int AS active_subscriptions,
          COUNT(*) FILTER (WHERE st.subscription_status = 'TRIAL')::int AS trial_count,
          COUNT(*) FILTER (WHERE st.subscription_status = 'CANCELLED')::int AS cancelled_subscriptions,
          COUNT(*)::int AS total_subscriptions
        FROM subscriptions s
        JOIN subscriber_tenants st ON st.id = s.subscriber_tenant_id
      `
    );
    const row = result.rows[0] as any;
    const total = Number(row?.total_subscriptions ?? 0);
    const cancelled = Number(row?.cancelled_subscriptions ?? 0);
    const mrr = roundMoney(Number(row?.mrr ?? 0));
    return {
      mrr,
      arr: roundMoney(mrr * 12),
      activeSubscriptions: Number(row?.active_subscriptions ?? 0),
      trialCount: Number(row?.trial_count ?? 0),
      cancelledSubscriptions: cancelled,
      churnRate: total > 0 ? roundMoney((cancelled / total) * 100) : 0,
    };
  });
}

export async function listInvoices(database: DatabaseRuntime) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `
        SELECT
          i.id,
          COALESCE(st.trade_name, st.legal_name, st.contact_name) AS tenant_name,
          i.total_amount::float AS amount,
          i.currency,
          CASE
            WHEN i.status = 'PAID' THEN 'PAID'
            WHEN i.status = 'OVERDUE' THEN 'OVERDUE'
            WHEN i.status = 'REFUNDED' THEN 'REFUNDED'
            ELSE 'OPEN'
          END AS status,
          COALESCE(i.issued_at, i.created_at) AS issued_at,
          COALESCE(i.due_date, i.period_end) AS due_at,
          i.created_at
        FROM billing_invoices i
        JOIN subscriber_tenants st ON st.id = i.subscriber_tenant_id
        ORDER BY i.created_at DESC
      `
    );
    return result.rows;
  });
}

export async function listPayments(database: DatabaseRuntime) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `
        SELECT
          p.id,
          p.invoice_id,
          p.amount::float AS amount,
          CASE
            WHEN p.status = 'SUCCEEDED' THEN 'SUCCESSFUL'
            WHEN p.status = 'REFUNDED' THEN 'REFUNDED'
            ELSE 'FAILED'
          END AS status,
          COALESCE(p.completed_at, p.attempted_at, p.created_at) AS paid_at
        FROM billing_payments p
        ORDER BY COALESCE(p.completed_at, p.created_at) DESC
      `
    );
    return result.rows;
  });
}

export async function listAuditLogs(database: DatabaseRuntime, limit = 100) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `
        SELECT
          id,
          COALESCE(actor_email, actor_id) AS actor,
          action,
          resource_type AS "resourceType",
          resource_id AS "resourceId",
          changes,
          created_at AS timestamp
        FROM platform_audit_logs
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [limit]
    );
    return result.rows;
  });
}

export async function getSubscriberGrowth(database: DatabaseRuntime) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `
        SELECT to_char(month_start, 'YYYY-MM') AS month,
               COUNT(st.id)::int AS count
        FROM generate_series(
          date_trunc('month', now()) - interval '11 months',
          date_trunc('month', now()),
          interval '1 month'
        ) month_start
        LEFT JOIN subscriber_tenants st
          ON st.created_at >= month_start
         AND st.created_at < month_start + interval '1 month'
        GROUP BY month_start
        ORDER BY month_start
      `
    );
    return result.rows;
  });
}

export async function getMrrEvolution(database: DatabaseRuntime) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `
        SELECT to_char(month_start, 'YYYY-MM') AS month,
               COALESCE(SUM(
                 CASE
                   WHEN st.subscription_status IN ('ACTIVE', 'TRIAL', 'COURTESY') AND s.billing_interval = 'MONTHLY'
                     THEN s.amount
                   WHEN st.subscription_status IN ('ACTIVE', 'TRIAL', 'COURTESY') AND s.billing_interval = 'QUARTERLY'
                     THEN s.amount / 3
                   WHEN st.subscription_status IN ('ACTIVE', 'TRIAL', 'COURTESY') AND s.billing_interval = 'YEARLY'
                     THEN s.amount / 12
                   ELSE 0
                 END
               ), 0)::float AS mrr
        FROM generate_series(
          date_trunc('month', now()) - interval '11 months',
          date_trunc('month', now()),
          interval '1 month'
        ) month_start
        LEFT JOIN subscriptions s ON s.created_at < month_start + interval '1 month'
        LEFT JOIN subscriber_tenants st ON st.id = s.subscriber_tenant_id
        GROUP BY month_start
        ORDER BY month_start
      `
    );
    return result.rows.map((row: any) => ({ ...row, mrr: roundMoney(Number(row.mrr ?? 0)) }));
  });
}

export async function getLeadFunnel(database: DatabaseRuntime) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `
        SELECT stage.status AS stage,
               COUNT(leads.id)::int AS count
        FROM unnest(enum_range(NULL::lead_status)::text[]) AS stage(status)
        LEFT JOIN leads ON leads.status::text = stage.status
        GROUP BY stage.status
        ORDER BY array_position(enum_range(NULL::lead_status)::text[], stage.status)
      `
    );
    return result.rows;
  });
}

export async function getPlanDistribution(database: DatabaseRuntime) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `
        SELECT p.name AS "planName",
               p.id AS "planId",
               COUNT(s.id)::int AS count
        FROM plans p
        LEFT JOIN subscriptions s ON s.plan_id = p.id
        GROUP BY p.id, p.name
        ORDER BY p.price_amount ASC, p.name ASC
      `
    );
    return result.rows;
  });
}

export async function getSettings(database: DatabaseRuntime) {
  return withPlatform(database, async (client) => {
    const existing = await client.query('SELECT * FROM platform_settings LIMIT 1');
    if (existing.rows[0]) {
      return mapSettings(existing.rows[0] as any);
    }

    const created = await client.query(
      `
        INSERT INTO platform_settings (
          enable_trials, trial_duration_days, auto_suspend_past_due, suspend_after_days_past_due,
          require_mfa_for_platform, max_storage_gb_default, max_users_default, max_customers_default
        )
        VALUES (true, 14, true, 30, false, 100, 10, 100)
        RETURNING *
      `
    );
    return mapSettings(created.rows[0] as any);
  });
}

export async function updateSettings(database: DatabaseRuntime, data: JsonObject) {
  return withPlatform(database, async (client) => {
    const current = await getSettings(database);
    const result = await client.query(
      `
        UPDATE platform_settings
        SET
          enable_trials = COALESCE($2, enable_trials),
          trial_duration_days = COALESCE($3, trial_duration_days),
          auto_suspend_past_due = COALESCE($4, auto_suspend_past_due),
          suspend_after_days_past_due = COALESCE($5, suspend_after_days_past_due),
          require_mfa_for_platform = COALESCE($6, require_mfa_for_platform),
          max_storage_gb_default = COALESCE($7, max_storage_gb_default),
          max_users_default = COALESCE($8, max_users_default),
          max_customers_default = COALESCE($9, max_customers_default),
          updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [
        current.id,
        data.enableTrials,
        data.trialDurationDays,
        data.autoSuspendPastDue,
        data.suspendAfterDaysPastDue,
        data.requireMfaForPlatform,
        data.maxStorageGbDefault,
        data.maxUsersDefault,
        data.maxCustomersDefault,
      ]
    );
    return mapSettings(result.rows[0] as any);
  });
}

export async function listSupportCases(database: DatabaseRuntime) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `
        SELECT
          c.id,
          c.subscriber_tenant_id AS "subscriberTenantId",
          COALESCE(st.contact_name, st.legal_name) AS "subscriberTenantName",
          c.title,
          c.description,
          c.status,
          c.priority,
          c.assigned_to_id AS "assignedToId",
          u.email AS "assignedToEmail",
          c.created_at AS "createdAt",
          c.updated_at AS "updatedAt"
        FROM support_cases c
        JOIN subscriber_tenants st ON st.id = c.subscriber_tenant_id
        LEFT JOIN platform_users u ON u.id = c.assigned_to_id
        ORDER BY c.created_at DESC
      `
    );
    return result.rows.map(normalizeSupportCase);
  });
}

export async function createSupportCase(database: DatabaseRuntime, data: SupportCaseCreateInput) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `
        INSERT INTO support_cases (subscriber_tenant_id, title, description, priority, status)
        VALUES ($1, $2, $3, COALESCE($4, 'MEDIUM'), 'OPEN')
        RETURNING id
      `,
      [data.subscriberTenantId, data.title, data.description, data.priority]
    );
    return getSupportCaseById(database, String(result.rows[0]?.id));
  });
}

export async function getSupportCaseById(database: DatabaseRuntime, id: string) {
  const cases = await listSupportCases(database);
  return cases.find((supportCase) => supportCase.id === id) ?? null;
}

export async function updateSupportCase(database: DatabaseRuntime, id: string, data: JsonObject) {
  return withPlatform(database, async (client) => {
    await client.query(
      `
        UPDATE support_cases
        SET
          status = COALESCE($2, status),
          priority = COALESCE($3, priority),
          assigned_to_id = COALESCE($4, assigned_to_id),
          updated_at = now()
        WHERE id = $1
      `,
      [id, data.status, data.priority, data.assignedToId]
    );
    return getSupportCaseById(database, id);
  });
}

function withPlatform<T>(
  database: DatabaseRuntime,
  operation: (client: TenantTransactionClient) => Promise<T>
): Promise<T> {
  return database.withPlatformTransaction(operation);
}

function mapSettings(row: any) {
  return {
    id: row.id,
    enableTrials: row.enable_trials,
    trialDurationDays: row.trial_duration_days,
    autoSuspendPastDue: row.auto_suspend_past_due,
    suspendAfterDaysPastDue: row.suspend_after_days_past_due,
    requireMfaForPlatform: row.require_mfa_for_platform,
    maxStorageGbDefault: row.max_storage_gb_default,
    maxUsersDefault: row.max_users_default,
    maxCustomersDefault: row.max_customers_default,
    updatedAt: iso(row.updated_at),
  };
}

function normalizeSupportCase(row: any) {
  return {
    ...row,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function normalizeBillingInterval(value: string): string {
  return value === 'ANNUAL' ? 'YEARLY' : value;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
