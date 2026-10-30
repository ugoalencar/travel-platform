import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { AuditEventType, recordAuditEvent } from './audit-log';
import {
  AgencyModuleDependencyConflictError,
  AgencyModuleDisabledError,
  AgencyModuleEntitlementRequiredError,
} from './errors';

export type AgencyModuleKey =
  | 'CORE'
  | 'PIPELINE'
  | 'PESCADOR'
  | 'CUSTOMER_INSIGHTS'
  | 'INSURANCE'
  | 'CAMPAIGNS'
  | 'CREATIVE_STUDIO'
  | 'SOCIAL_PUBLISHING'
  | 'SOCIAL_AUTOMATION'
  | 'COMMUNICATIONS'
  | 'SALES_IMPORT'
  | 'TRAVEL_OPERATIONS';

export interface AgencyModuleDefinition {
  key: AgencyModuleKey;
  label: string;
  description: string;
  essential: boolean;
  dependencies: AgencyModuleKey[];
  apiPrefixes: string[];
  uiPrefixes: string[];
  entitlement?: string;
}

export interface AgencyModuleState extends AgencyModuleDefinition {
  enabled: boolean;
  entitled: boolean;
  available: boolean;
}

export const AGENCY_MODULE_CATALOG: AgencyModuleDefinition[] = [
  {
    key: 'CORE', label: 'Essencial', description: 'Acesso, clientes, fornecedores, vendas e financeiro.',
    essential: true, dependencies: [], apiPrefixes: [], uiPrefixes: [],
  },
  {
    key: 'PIPELINE', label: 'Pipeline e prospecção', description: 'Oportunidades, tarefas e etapas comerciais.',
    essential: false, dependencies: ['CORE'], apiPrefixes: ['/commercial/opportunities', '/commercial/tasks', '/commercial/interactions', '/commercial/pipelines'], uiPrefixes: ['/pipeline', '/tasks'],
  },
  {
    key: 'PESCADOR', label: 'Pescador', description: 'Captura e revisão de ofertas externas.',
    essential: false, dependencies: ['CORE'], apiPrefixes: ['/pescador'], uiPrefixes: ['/pescador'], entitlement: 'PESCADOR',
  },
  {
    key: 'CUSTOMER_INSIGHTS', label: 'Inteligência de clientes', description: 'Desejos e segmentação de clientes.',
    essential: false, dependencies: ['CORE'], apiPrefixes: ['/wishes', '/customer-segments'], uiPrefixes: ['/wishes', '/segments'],
  },
  {
    key: 'INSURANCE', label: 'Seguros', description: 'Produtos, apólices e documentos de seguro viagem.',
    essential: false, dependencies: ['CORE'], apiPrefixes: ['/insurance'], uiPrefixes: ['/insurance'],
  },
  {
    key: 'CAMPAIGNS', label: 'Campanhas e cupons', description: 'Campanhas, cupons e concessões promocionais.',
    essential: false, dependencies: ['CORE'], apiPrefixes: ['/campaigns', '/coupons'], uiPrefixes: ['/campaigns', '/coupons'], entitlement: 'CAMPAIGNS',
  },
  {
    key: 'CREATIVE_STUDIO', label: 'Estúdio criativo e mídia', description: 'Ativos criativos e biblioteca de mídia.',
    essential: false, dependencies: ['CORE'], apiPrefixes: ['/assets', '/media-assets'], uiPrefixes: ['/media-library'], entitlement: 'CREATIVE_STUDIO',
  },
  {
    key: 'SOCIAL_PUBLISHING', label: 'Publicação social', description: 'Criação, agendamento e publicação em canais sociais.',
    essential: false, dependencies: ['CAMPAIGNS', 'CREATIVE_STUDIO'], apiPrefixes: ['/publications'], uiPrefixes: ['/publications'], entitlement: 'SOCIAL_PUBLISHING',
  },
  {
    key: 'SOCIAL_AUTOMATION', label: 'Automação social', description: 'Automações, conectores e métricas de engajamento.',
    essential: false, dependencies: ['CAMPAIGNS', 'SOCIAL_PUBLISHING'], apiPrefixes: ['/automations', '/connectors', '/engagements'], uiPrefixes: ['/automations'], entitlement: 'SOCIAL_AUTOMATION',
  },
  {
    key: 'COMMUNICATIONS', label: 'Comunicações', description: 'Comunicações da agência e compartilhamento por WhatsApp.',
    essential: false, dependencies: ['CORE'], apiPrefixes: ['/agency-communications', '/api/whatsapp'], uiPrefixes: ['/communications'],
  },
  {
    key: 'SALES_IMPORT', label: 'Importação de vendas', description: 'Importação e conclusão assistida de vendas.',
    essential: false, dependencies: ['CORE'], apiPrefixes: ['/imports/sales'], uiPrefixes: ['/sales/import'],
  },
  {
    key: 'TRAVEL_OPERATIONS', label: 'Operações de viagem', description: 'Excursões, transporte e execução operacional.',
    essential: false, dependencies: ['CORE'], apiPrefixes: ['/excursions', '/operations', '/transport', '/air-services', '/land-services'], uiPrefixes: ['/excursions', '/operations'],
  },
];

const catalogByKey = new Map(AGENCY_MODULE_CATALOG.map((module) => [module.key, module]));

export function getAgencyModule(key: AgencyModuleKey): AgencyModuleDefinition {
  const module = catalogByKey.get(key);
  if (!module) throw new Error(`Unknown agency module: ${key}`);
  return module;
}

export function isAgencyModuleEnabled(
  key: AgencyModuleKey,
  overrides: Partial<Record<AgencyModuleKey, boolean>>,
): boolean {
  return overrides[key] ?? true;
}

export function resolveAgencyModuleForPath(path: string): AgencyModuleKey {
  const pathname = path.split('?')[0] ?? path;
  const matches = AGENCY_MODULE_CATALOG.flatMap((module) =>
    module.apiPrefixes.concat(module.uiPrefixes)
      .filter((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
      .map((prefix) => ({ key: module.key, length: prefix.length })),
  ).sort((left, right) => right.length - left.length);
  return matches[0]?.key ?? 'CORE';
}

export function getDisablingBlockers(
  key: AgencyModuleKey,
  enabledKeys: ReadonlySet<AgencyModuleKey>,
): AgencyModuleKey[] {
  const target = getAgencyModule(key);
  if (target.essential) throw new Error(`Essential module cannot be disabled: ${key}`);
  return AGENCY_MODULE_CATALOG
    .filter((module) => module.key !== key && enabledKeys.has(module.key) && module.dependencies.includes(key))
    .map((module) => module.key)
    .sort();
}

export function validateAgencyModuleCatalog(catalog: readonly AgencyModuleDefinition[]): void {
  const byKey = new Map<AgencyModuleKey, AgencyModuleDefinition>();
  for (const module of catalog) {
    if (byKey.has(module.key)) throw new Error(`Duplicate agency module key: ${module.key}`);
    byKey.set(module.key, module);
  }
  for (const module of catalog) {
    if (module.essential && module.dependencies.length > 0) throw new Error(`Essential module cannot depend on optional modules: ${module.key}`);
    for (const dependency of module.dependencies) {
      if (!byKey.has(dependency)) throw new Error(`Unknown dependency ${dependency} for ${module.key}`);
      if (dependency === module.key) throw new Error(`Dependency cycle: ${module.key} depends on itself`);
    }
  }
  for (const field of ['apiPrefixes', 'uiPrefixes'] as const) {
    const owners = new Map<string, AgencyModuleKey>();
    for (const module of catalog) for (const prefix of module[field]) {
      const owner = owners.get(prefix);
      if (owner) throw new Error(`Duplicate route ownership for ${prefix}: ${owner}, ${module.key}`);
      owners.set(prefix, module.key);
    }
  }
  const visiting = new Set<AgencyModuleKey>();
  const visited = new Set<AgencyModuleKey>();
  const visit = (key: AgencyModuleKey): void => {
    if (visiting.has(key)) throw new Error(`Dependency cycle includes ${key}`);
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of byKey.get(key)?.dependencies ?? []) visit(dependency);
    visiting.delete(key);
    visited.add(key);
  };
  for (const key of byKey.keys()) visit(key);
}
export async function getAgencyModules(database: DatabaseRuntime): Promise<AgencyModuleState[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const settings = await client.query<{ module_key: AgencyModuleKey; enabled: boolean }>(
      'SELECT module_key, enabled FROM agency_module_settings WHERE agency_id = $1',
      [agencyId],
    );
    const entitlements = await client.query<{ feature: string; enabled: boolean }>(
      `SELECT feature::text AS feature, enabled FROM agency_entitlements
        WHERE agency_id = $1 AND feature::text = ANY($2::text[])`,
      [agencyId, [...new Set(AGENCY_MODULE_CATALOG.flatMap((module) => module.entitlement ? [module.entitlement] : []))]],
    );
    const overrides = Object.fromEntries(settings.rows.map((row) => [row.module_key, row.enabled])) as Partial<Record<AgencyModuleKey, boolean>>;
    const entitlementState = new Map(entitlements.rows.map((row) => [row.feature, row.enabled]));
    return AGENCY_MODULE_CATALOG.map((module) => {
      const enabled = isAgencyModuleEnabled(module.key, overrides);
      const entitled = module.entitlement === undefined || entitlementState.get(module.entitlement) === true;
      return { ...module, enabled, entitled, available: enabled && entitled };
    });
  });
}

export async function requireAgencyModuleEnabled(
  database: DatabaseRuntime,
  key: AgencyModuleKey,
): Promise<void> {
  const agencyId = getAgencyId();
  const module = getAgencyModule(key);
  const enabled = await database.withTenantTransaction(async (client) => {
    const result = await client.query<{ enabled: boolean }>(
      'SELECT enabled FROM agency_module_settings WHERE agency_id = $1 AND module_key = $2',
      [agencyId, key],
    );
    return result.rows[0]?.enabled ?? true;
  });
  if (!enabled) throw new AgencyModuleDisabledError(module.label);
}

export async function setAgencyModuleEnabled(
  database: DatabaseRuntime,
  key: AgencyModuleKey,
  enabled: boolean,
): Promise<void> {
  const agencyId = getAgencyId();
  const module = getAgencyModule(key);
  if (module.essential) throw new AgencyModuleDisabledError(`${module.label} é essencial`);
  await database.withTenantTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`agency-modules:${agencyId}`]);
    const settings = await client.query<{ module_key: AgencyModuleKey; enabled: boolean }>(
      'SELECT module_key, enabled FROM agency_module_settings WHERE agency_id = $1',
      [agencyId],
    );
    const overrides = Object.fromEntries(settings.rows.map((row) => [row.module_key, row.enabled])) as Partial<Record<AgencyModuleKey, boolean>>;
    const enabledKeys = new Set(AGENCY_MODULE_CATALOG.filter((candidate) => isAgencyModuleEnabled(candidate.key, overrides)).map((candidate) => candidate.key));
    const previousEnabled = isAgencyModuleEnabled(key, overrides);

    if (enabled) {
      const missingDependencies = module.dependencies.filter((dependency) => !enabledKeys.has(dependency));
      if (missingDependencies.length > 0) throw new AgencyModuleDependencyConflictError(key, missingDependencies);
      if (module.entitlement) {
        const entitlement = await client.query<{ enabled: boolean }>(
          'SELECT enabled FROM agency_entitlements WHERE agency_id = $1 AND feature::text = $2',
          [agencyId, module.entitlement],
        );
        if (entitlement.rows[0]?.enabled !== true) throw new AgencyModuleEntitlementRequiredError(module.entitlement);
      }
    } else {
      const blockers = getDisablingBlockers(key, enabledKeys);
      if (blockers.length > 0) throw new AgencyModuleDependencyConflictError(key, blockers);
    }

    if (previousEnabled === enabled) return;
    await client.query(
      `INSERT INTO agency_module_settings (agency_id, module_key, enabled, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (agency_id, module_key) DO UPDATE
         SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [agencyId, key, enabled, getUserId()],
    );
    await recordAuditEvent(client, {
      eventType: AuditEventType.AGENCY_MODULE_SETTINGS_CHANGED,
      entityType: 'agency_module_setting',
      entityId: key,
      metadata: { moduleKey: key, previousEnabled, enabled, dependencies: module.dependencies },
      required: true,
    });
  });
}
