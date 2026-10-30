/**
 * Dashboard (DASH-01): code catalog of widgets + per-agency layout.
 *
 * The layout is presentation only (order + enabled). Authorization is data:
 * each widget declares `canView`, evaluated by the server on EVERY read for the
 * viewer, and its loader reuses the existing report/summary functions (no second
 * data path). A widget the viewer may not see is omitted entirely -- no key, no
 * title, no "blocked" placeholder. The stored layout never carries filters,
 * queries, permissions or user ids.
 */
import { ForbiddenError, getAgencyId, getTenantContext, getUserId, requireRole } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { requireRoleOrAreaGrant } from './area-grants';
import { assertNotRestricted } from './permission-restrictions';
import { AuditEventType, recordAuditEvent } from './audit-log';
import { getDashboardSummary } from './commercial-cockpit';
import type { DatabaseRuntime } from './database';
import { ConflictError, ValidationError } from './errors';
import { getCashFlowSummary } from './financial';
import {
  getCommissionsProjection,
  getReceivablesProjection,
  getRevenueForecast,
  getSupplierBalances,
  todayCivil,
} from './report-projections-service';

export interface WidgetDefinition {
  key: string;
  title: string;
  /** Returns true if the current viewer may see this widget (same guard as the source endpoint). */
  canView(database: DatabaseRuntime): Promise<boolean>;
  load(database: DatabaseRuntime): Promise<unknown>;
  /** Travel Lite widget key, for future Lite -> Full layout migration; null = no counterpart. */
  liteKey: string | null;
}

const rolePasses = (minRole: UserRole): boolean => {
  try {
    requireRole(minRole);
    return true;
  } catch (error) {
    if (error instanceof ForbiddenError) return false;
    throw error;
  }
};

const monthRange = () => {
  const today = todayCivil();
  const last = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  return { from: new Date(`${today.slice(0, 8)}01T00:00:00.000Z`), to: new Date(`${today.slice(0, 8)}${String(last).padStart(2, '0')}T23:59:59.999Z`) };
};

export const WIDGET_CATALOG: readonly WidgetDefinition[] = [
  {
    key: 'commercial_overview',
    title: 'Visão comercial',
    canView: () => Promise.resolve(rolePasses(UserRole.VIEWER)),
    load: (database) => getDashboardSummary(database, getUserId(), undefined),
    liteKey: 'sales_summary',
  },
  {
    key: 'financial_overview',
    title: 'Fluxo de caixa do mês',
    // Same guard as GET /financial/dashboard (role floor or the FINANCIAL_OVERVIEW area grant).
    canView: async (database) => {
      try {
        await requireRoleOrAreaGrant(database, UserRole.MANAGER, 'FINANCIAL_OVERVIEW');
        const context = getTenantContext();
        await database.withTenantTransaction((client) => assertNotRestricted(client, context.userRole, 'financial', 'view'));
        return true;
      } catch (error) {
        if (error instanceof ForbiddenError) return false;
        throw error;
      }
    },
    load: (database) => getCashFlowSummary(database, monthRange()),
    liteKey: 'cash_flow',
  },
  {
    key: 'receivables_projection',
    title: 'Recebíveis de clientes',
    canView: async (database) => {
      try {
        await requireRoleOrAreaGrant(database, UserRole.MANAGER, 'FINANCIAL_RECEIVABLES');
        return true;
      } catch (error) {
        if (error instanceof ForbiddenError) return false;
        throw error;
      }
    },
    load: (database) => getReceivablesProjection(database, {}),
    liteKey: null,
  },
  {
    key: 'revenue_forecast',
    title: 'Receita da agência (projeção)',
    canView: () => Promise.resolve(rolePasses(UserRole.MANAGER)),
    load: (database) => getRevenueForecast(database, {}),
    liteKey: null,
  },
  {
    key: 'supplier_balances',
    title: 'Saldos com fornecedores',
    canView: () => Promise.resolve(rolePasses(UserRole.MANAGER)),
    load: (database) => getSupplierBalances(database, {}),
    liteKey: null,
  },
  {
    key: 'commissions_projection',
    title: 'Comissões de funcionários',
    canView: async (database) => {
      if (!rolePasses(UserRole.MANAGER)) return false;
      const context = getTenantContext();
      try {
        await database.withTenantTransaction((client) => assertNotRestricted(client, context.userRole, 'employees', 'view'));
        return true;
      } catch (error) {
        if (error instanceof ForbiddenError) return false;
        throw error;
      }
    },
    load: (database) => getCommissionsProjection(database, {}),
    liteKey: null,
  },
];

export interface LayoutEntry {
  key: string;
  enabled: boolean;
}

const defaultLayout = (): LayoutEntry[] => WIDGET_CATALOG.map((widget) => ({ key: widget.key, enabled: true }));

/** Stored layout reconciled with the catalog: unknown keys dropped, missing keys appended enabled. */
function reconcile(stored: LayoutEntry[] | null): LayoutEntry[] {
  const known = new Set(WIDGET_CATALOG.map((widget) => widget.key));
  const kept = (stored ?? []).filter((entry) => known.has(entry.key));
  const present = new Set(kept.map((entry) => entry.key));
  return [...kept, ...WIDGET_CATALOG.filter((widget) => !present.has(widget.key)).map((widget) => ({ key: widget.key, enabled: true }))];
}

async function loadLayout(database: DatabaseRuntime): Promise<{ widgets: LayoutEntry[]; version: number }> {
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{ widgets: LayoutEntry[]; version: number }>(
      `SELECT widgets, version FROM dashboard_layouts WHERE agency_id = $1`,
      [getAgencyId()],
    );
    const row = result.rows[0];
    return row ? { widgets: reconcile(row.widgets), version: row.version } : { widgets: defaultLayout(), version: 0 };
  });
}

/** The viewer's dashboard: enabled widgets in order, only those the viewer may see, each with its data. */
export async function getViewerDashboard(database: DatabaseRuntime) {
  requireRole(UserRole.VIEWER);
  const layout = await loadLayout(database);
  const byKey = new Map(WIDGET_CATALOG.map((widget) => [widget.key, widget]));
  const widgets: Array<{ key: string; title: string; data: unknown }> = [];
  for (const entry of layout.widgets) {
    if (!entry.enabled) continue;
    const definition = byKey.get(entry.key);
    if (!definition || !(await definition.canView(database))) continue;
    try {
      widgets.push({ key: definition.key, title: definition.title, data: await definition.load(database) });
    } catch (error) {
      // A widget that cannot be computed (e.g. too many rows) must not take the whole dashboard down.
      if (!(error instanceof ValidationError)) throw error;
      widgets.push({ key: definition.key, title: definition.title, data: { unavailable: 'TOO_MANY_ROWS' } });
    }
  }
  return { widgets };
}

/** Administrator view: the whole catalog (metadata only, no data) with enabled flags, order and version. */
export async function getDashboardSettings(database: DatabaseRuntime) {
  requireRole(UserRole.ADMIN);
  const layout = await loadLayout(database);
  const byKey = new Map(WIDGET_CATALOG.map((widget) => [widget.key, widget]));
  return {
    version: layout.version,
    widgets: layout.widgets.map((entry) => ({ key: entry.key, title: byKey.get(entry.key)?.title ?? entry.key, enabled: entry.enabled })),
  };
}

export function parseDashboardInput(body: unknown): { version: number; widgets: LayoutEntry[] } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Request body must be an object');
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => !['version', 'widgets'].includes(key))) throw new ValidationError('Unknown field in request body');
  if (!Number.isInteger(record.version) || (record.version as number) < 0) throw new ValidationError('Field "version" is invalid');
  if (!Array.isArray(record.widgets)) throw new ValidationError('Field "widgets" must be a list');
  const known = new Set(WIDGET_CATALOG.map((widget) => widget.key));
  const seen = new Set<string>();
  const widgets = record.widgets.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ValidationError('Invalid widget entry');
    const entry = raw as Record<string, unknown>;
    if (Object.keys(entry).some((key) => !['key', 'enabled'].includes(key))) throw new ValidationError('Widgets only carry key and enabled');
    if (typeof entry.key !== 'string' || !known.has(entry.key)) throw new ValidationError('Unknown widget');
    if (typeof entry.enabled !== 'boolean') throw new ValidationError('Field "enabled" must be boolean');
    if (seen.has(entry.key)) throw new ValidationError('Duplicate widget');
    seen.add(entry.key);
    return { key: entry.key, enabled: entry.enabled };
  });
  if (seen.size !== known.size) throw new ValidationError('Every catalog widget must be listed exactly once');
  return { version: record.version as number, widgets };
}

export async function saveDashboardSettings(database: DatabaseRuntime, input: { version: number; widgets: LayoutEntry[] }) {
  requireRole(UserRole.ADMIN);
  getTenantContext();
  await database.withTenantTransaction(async (client) => {
    const current = await client.query<{ version: number }>(
      `SELECT version FROM dashboard_layouts WHERE agency_id = $1 FOR UPDATE`,
      [getAgencyId()],
    );
    const currentVersion = current.rows[0]?.version ?? 0;
    if (currentVersion !== input.version) throw new ConflictError('The dashboard layout was changed by someone else; reload and try again');
    if (current.rows[0]) {
      await client.query(
        `UPDATE dashboard_layouts SET widgets = $2::jsonb, version = version + 1, updated_by_user_id = $3, updated_at = now() WHERE agency_id = $1`,
        [getAgencyId(), JSON.stringify(input.widgets), getUserId()],
      );
    } else {
      // FOR UPDATE cannot lock a row that does not exist yet: the loser of a first-save race inserts nothing.
      const inserted = await client.query(
        `INSERT INTO dashboard_layouts (agency_id, widgets, version, updated_by_user_id) VALUES ($1, $2::jsonb, 1, $3)
         ON CONFLICT (agency_id) DO NOTHING`,
        [getAgencyId(), JSON.stringify(input.widgets), getUserId()],
      );
      if (inserted.rowCount === 0) throw new ConflictError('The dashboard layout was changed by someone else; reload and try again');
    }
    await recordAuditEvent(client, {
      eventType: AuditEventType.DASHBOARD_CONFIGURED,
      entityType: 'dashboard_layout',
      required: true,
      metadata: { fieldsChanged: input.widgets.filter((entry) => entry.enabled).map((entry) => entry.key), toStatus: `v${currentVersion + 1}` },
    });
  });
  return getDashboardSettings(database);
}
