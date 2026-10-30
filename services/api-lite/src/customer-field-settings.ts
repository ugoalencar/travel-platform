/**
 * Customer registration field configuration (Frente 2, ADR-008) -- Lite side
 * of the contract validated in Full (services/api/src/customer-field-settings.ts).
 *
 * Same portable field keys and rules: no row = enabled and optional; create
 * validates required fields; a disabled field sent with a value is a 422; an
 * edit validates only the fields present; disabling never deletes data;
 * `name` is locked. Lite exposes only the subset of keys it has (DEC-007).
 */
import type { LiteDatabase, TenantClient } from './database';
import { AUDIT_EVENTS, recordAuditEvent } from './audit-log';
import { FormFieldError, ValidationError } from './errors';
import { getTenantContext } from './tenant-context';

export interface RegistryField {
  key: string;
  /** Request/column names of the customers API that carry this field. */
  apiFields: readonly string[];
  label: string;
  group: string;
  locked?: true;
  availableIn: ReadonlyArray<'FULL' | 'LITE'>;
}

const both = ['FULL', 'LITE'] as const;

export const CUSTOMER_FIELD_REGISTRY: readonly RegistryField[] = [
  { key: 'name', apiFields: ['name'], label: 'Nome', group: 'Identificação', locked: true, availableIn: both },
  { key: 'cpf', apiFields: ['cpf'], label: 'CPF', group: 'Documentos', availableIn: both },
  { key: 'birth_date', apiFields: ['birth_date'], label: 'Data de nascimento', group: 'Identificação', availableIn: both },
  { key: 'email', apiFields: ['email'], label: 'E-mail', group: 'Contato', availableIn: both },
  { key: 'phone', apiFields: ['phone'], label: 'Telefone', group: 'Contato', availableIn: both },
  { key: 'whatsapp', apiFields: ['whatsapp'], label: 'WhatsApp', group: 'Contato', availableIn: both },
  {
    key: 'address',
    apiFields: ['zip_code', 'street', 'number', 'complement', 'neighborhood', 'city', 'state'],
    label: 'Endereço',
    group: 'Endereço',
    availableIn: both,
  },
  { key: 'notes', apiFields: ['notes'], label: 'Observações', group: 'Outros', availableIn: both },
];

const BY_KEY = new Map(CUSTOMER_FIELD_REGISTRY.map((field) => [field.key, field]));

export interface FieldSetting {
  enabled: boolean;
  required: boolean;
}

export interface FieldSettingInput extends FieldSetting {
  field_key: string;
}

export function parseFieldSettingsInput(body: unknown): FieldSettingInput[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Corpo inválido');
  if (Object.keys(body).some((key) => key !== 'fields')) throw new ValidationError('Campos não permitidos no corpo');
  const list = (body as { fields?: unknown }).fields;
  if (!Array.isArray(list) || list.length > CUSTOMER_FIELD_REGISTRY.length) {
    throw new ValidationError('fields deve ser uma lista');
  }
  const seen = new Set<string>();
  return list.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ValidationError('Campo inválido');
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).some((key) => !['field_key', 'enabled', 'required'].includes(key))) {
      throw new ValidationError('Propriedades não permitidas');
    }
    const { field_key: key, enabled, required } = item;
    if (typeof key !== 'string' || !BY_KEY.has(key)) throw new ValidationError('Campo desconhecido');
    if (BY_KEY.get(key)?.locked) throw new ValidationError(`O campo "${key}" é fixo e não pode ser alterado`);
    if (typeof enabled !== 'boolean' || typeof required !== 'boolean') {
      throw new ValidationError('enabled e required devem ser booleanos');
    }
    if (required && !enabled) throw new ValidationError('Um campo obrigatório precisa estar habilitado');
    if (seen.has(key)) throw new ValidationError(`Campo duplicado: ${key}`);
    seen.add(key);
    return { field_key: key, enabled, required };
  });
}

const hasValue = (value: unknown): boolean =>
  value !== undefined && value !== null && (typeof value !== 'string' || value.trim().length > 0);

export function evaluateCustomerFieldRules(
  settings: ReadonlyMap<string, FieldSetting>,
  data: Record<string, unknown>,
  mode: 'create' | 'update',
): void {
  for (const field of CUSTOMER_FIELD_REGISTRY) {
    if (field.locked) continue;
    const setting = settings.get(field.key);
    if (!setting) continue;
    const present = field.apiFields.some((name) => data[name] !== undefined);
    const filled = field.apiFields.some((name) => hasValue(data[name]));
    if (!setting.enabled) {
      // Any write to a disabled field is refused (even blank or null), so stored data is never wiped silently.
      if (present) {
        throw new FormFieldError('FIELD_DISABLED', field.key, `O campo "${field.label}" está desabilitado para esta agência`);
      }
      continue;
    }
    if (setting.required && (mode === 'create' || present) && !filled) {
      throw new FormFieldError('FIELD_REQUIRED', field.key, `O campo "${field.label}" é obrigatório`);
    }
  }
}

async function loadSettings(client: TenantClient, tenantId: string): Promise<Map<string, FieldSetting>> {
  const result = await client.query<{ field_key: string; enabled: boolean; required: boolean }>(
    `SELECT field_key, enabled, required FROM customer_field_settings WHERE tenant_id = $1`,
    [tenantId],
  );
  return new Map(result.rows.map((row) => [row.field_key, { enabled: row.enabled, required: row.required }]));
}

/** Runs inside the caller's tenant transaction so a create/patch sees one consistent configuration. */
export async function assertCustomerFieldRules(
  client: TenantClient,
  tenantId: string,
  data: Record<string, unknown>,
  mode: 'create' | 'update',
): Promise<void> {
  evaluateCustomerFieldRules(await loadSettings(client, tenantId), data, mode);
}

export interface FieldSettingView extends FieldSetting {
  field_key: string;
  label: string;
  group: string;
  locked: boolean;
}

export async function listCustomerFieldSettings(database: LiteDatabase): Promise<FieldSettingView[]> {
  const { tenantId } = getTenantContext();
  const settings = await database.withTenantTransaction((client) => loadSettings(client, tenantId));
  return CUSTOMER_FIELD_REGISTRY.map((field) => ({
    field_key: field.key,
    label: field.label,
    group: field.group,
    locked: field.locked === true,
    enabled: field.locked ? true : (settings.get(field.key)?.enabled ?? true),
    required: field.locked ? true : (settings.get(field.key)?.required ?? false),
  }));
}

export async function saveCustomerFieldSettings(
  database: LiteDatabase,
  inputs: FieldSettingInput[],
): Promise<FieldSettingView[]> {
  const { tenantId, userId } = getTenantContext();
  await database.withTenantTransaction(async (client) => {
    const before = await loadSettings(client, tenantId);
    const changed: string[] = [];
    for (const input of inputs) {
      const prior = before.get(input.field_key) ?? { enabled: true, required: false };
      if (prior.enabled === input.enabled && prior.required === input.required) continue;
      await client.query(
        `INSERT INTO customer_field_settings (tenant_id, field_key, enabled, required, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, field_key)
         DO UPDATE SET enabled = EXCLUDED.enabled, required = EXCLUDED.required,
                       updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [tenantId, input.field_key, input.enabled, input.required, userId || null],
      );
      changed.push(`${input.field_key}:${input.enabled ? 'on' : 'off'}:${input.required ? 'req' : 'opt'}`);
    }
    // One event per changed field so nothing is truncated; the event is fail-closed (REQUIRED_AUDIT_EVENTS).
    for (const change of changed) {
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.CUSTOMER_FIELD_SETTINGS_CHANGED,
        entityType: 'customer_field_settings',
        metadata: { fields_changed: change },
      });
    }
  });
  return listCustomerFieldSettings(database);
}
