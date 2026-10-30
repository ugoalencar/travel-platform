/**
 * Customer registration field configuration (Frente 2, ADR-008).
 *
 * The code registry lists every configurable field; `customer_field_settings`
 * stores only what the agency changed (no row = enabled, optional). The
 * server is the authority: create validates required fields, a disabled
 * field sent with a value is a 422, and an edit validates only the fields
 * present in the patch so legacy customers stay editable. Disabling never
 * deletes stored data. `name` is locked (always enabled and required).
 */
import { getAgencyId, getUserId, requireRole } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { AuditEventType, recordAuditEvent } from './audit-log';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { FormFieldError, ValidationError } from './errors';
import { requireCapability } from './user-permission-overrides';

export interface RegistryField {
  /** Portable snake_case key (same in Lite). */
  key: string;
  /** Field name used by the customers API. */
  apiField: string;
  label: string;
  group: 'Identificação' | 'Contato' | 'Documentos' | 'Emergência' | 'Endereço' | 'Outros';
  locked?: true;
  availableIn: ReadonlyArray<'FULL' | 'LITE'>;
}

const both = ['FULL', 'LITE'] as const;
const fullOnly = ['FULL'] as const;

export const CUSTOMER_FIELD_REGISTRY: readonly RegistryField[] = [
  { key: 'name', apiField: 'name', label: 'Nome', group: 'Identificação', locked: true, availableIn: both },
  { key: 'social_name', apiField: 'socialName', label: 'Nome social', group: 'Identificação', availableIn: fullOnly },
  { key: 'cpf', apiField: 'cpf', label: 'CPF', group: 'Documentos', availableIn: both },
  { key: 'rg', apiField: 'rg', label: 'RG', group: 'Documentos', availableIn: fullOnly },
  { key: 'national_id_type', apiField: 'nationalIdType', label: 'Tipo de documento', group: 'Documentos', availableIn: fullOnly },
  { key: 'id_issuing_authority', apiField: 'idIssuingAuthority', label: 'Órgão emissor', group: 'Documentos', availableIn: fullOnly },
  { key: 'id_issued_date', apiField: 'idIssuedDate', label: 'Data de emissão', group: 'Documentos', availableIn: fullOnly },
  { key: 'passport', apiField: 'passport', label: 'Passaporte', group: 'Documentos', availableIn: fullOnly },
  { key: 'birth_date', apiField: 'birthDate', label: 'Data de nascimento', group: 'Identificação', availableIn: both },
  { key: 'nationality', apiField: 'nationality', label: 'Nacionalidade', group: 'Identificação', availableIn: fullOnly },
  { key: 'marital_status', apiField: 'maritalStatus', label: 'Estado civil', group: 'Identificação', availableIn: fullOnly },
  { key: 'profession', apiField: 'profession', label: 'Profissão', group: 'Identificação', availableIn: fullOnly },
  { key: 'email', apiField: 'email', label: 'E-mail', group: 'Contato', availableIn: both },
  { key: 'phone', apiField: 'phone', label: 'Telefone', group: 'Contato', availableIn: both },
  { key: 'whatsapp', apiField: 'whatsapp', label: 'WhatsApp', group: 'Contato', availableIn: both },
  { key: 'emergency_contact_name', apiField: 'emergencyContactName', label: 'Contato de emergência: nome', group: 'Emergência', availableIn: fullOnly },
  { key: 'emergency_contact_relationship', apiField: 'emergencyContactRelationship', label: 'Contato de emergência: parentesco', group: 'Emergência', availableIn: fullOnly },
  { key: 'emergency_contact_phone', apiField: 'emergencyContactPhone', label: 'Contato de emergência: telefone', group: 'Emergência', availableIn: fullOnly },
  { key: 'emergency_contact_whatsapp', apiField: 'emergencyContactWhatsapp', label: 'Contato de emergência: WhatsApp', group: 'Emergência', availableIn: fullOnly },
  { key: 'emergency_contact_email', apiField: 'emergencyContactEmail', label: 'Contato de emergência: e-mail', group: 'Emergência', availableIn: fullOnly },
  { key: 'emergency_contact_notes', apiField: 'emergencyContactNotes', label: 'Contato de emergência: observações', group: 'Emergência', availableIn: fullOnly },
  { key: 'address', apiField: 'address', label: 'Endereço', group: 'Endereço', availableIn: both },
  { key: 'notes', apiField: 'notes', label: 'Observações', group: 'Outros', availableIn: both },
];

const BY_KEY = new Map(CUSTOMER_FIELD_REGISTRY.map((field) => [field.key, field]));

export interface FieldSetting {
  enabled: boolean;
  required: boolean;
}

export interface FieldSettingInput extends FieldSetting {
  fieldKey: string;
}

export function parseFieldSettingsInput(body: unknown): FieldSettingInput[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Corpo inválido');
  }
  if (Object.keys(body).some((key) => key !== 'fields')) {
    throw new ValidationError('Campos não permitidos no corpo');
  }
  const list = (body as { fields?: unknown }).fields;
  if (!Array.isArray(list) || list.length > CUSTOMER_FIELD_REGISTRY.length) {
    throw new ValidationError('fields deve ser uma lista');
  }
  const seen = new Set<string>();
  return list.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ValidationError('Campo inválido');
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).some((key) => !['fieldKey', 'enabled', 'required'].includes(key))) {
      throw new ValidationError('Propriedades não permitidas');
    }
    const { fieldKey, enabled, required } = item;
    if (typeof fieldKey !== 'string' || !BY_KEY.has(fieldKey)) {
      throw new ValidationError('Campo desconhecido');
    }
    if (BY_KEY.get(fieldKey)?.locked) throw new ValidationError(`O campo "${fieldKey}" é fixo e não pode ser alterado`);
    if (typeof enabled !== 'boolean' || typeof required !== 'boolean') {
      throw new ValidationError('enabled e required devem ser booleanos');
    }
    if (required && !enabled) throw new ValidationError('Um campo obrigatório precisa estar habilitado');
    if (seen.has(fieldKey)) throw new ValidationError(`Campo duplicado: ${fieldKey}`);
    seen.add(fieldKey);
    return { fieldKey, enabled, required };
  });
}

const hasValue = (value: unknown): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(hasValue);
  }
  return true;
};

export function evaluateCustomerFieldRules(
  settings: ReadonlyMap<string, FieldSetting>,
  data: Record<string, unknown>,
  mode: 'create' | 'update',
): void {
  for (const field of CUSTOMER_FIELD_REGISTRY) {
    if (field.locked) continue;
    const setting = settings.get(field.key);
    if (!setting) continue;
    const present = Object.prototype.hasOwnProperty.call(data, field.apiField) && data[field.apiField] !== undefined;
    const value = data[field.apiField];
    if (!setting.enabled) {
      // Any write to a disabled field is refused (even blank), so stored data is never wiped silently.
      if (present) {
        throw new FormFieldError('FIELD_DISABLED', field.key, `O campo "${field.label}" está desabilitado para esta agência`);
      }
      continue;
    }
    if (setting.required && (mode === 'create' || present) && !hasValue(value)) {
      throw new FormFieldError('FIELD_REQUIRED', field.key, `O campo "${field.label}" é obrigatório`);
    }
  }
}

async function loadSettings(client: TenantTransactionClient): Promise<Map<string, FieldSetting>> {
  const result = await client.query<{ field_key: string; enabled: boolean; required: boolean }>(
    `SELECT field_key, enabled, required FROM customer_field_settings WHERE agency_id = $1`,
    [getAgencyId()],
  );
  return new Map(result.rows.map((row) => [row.field_key, { enabled: row.enabled, required: row.required }]));
}

export async function assertCustomerFieldRules(
  database: DatabaseRuntime,
  data: Record<string, unknown>,
  mode: 'create' | 'update',
): Promise<void> {
  const settings = await database.withTenantTransaction((client) => loadSettings(client));
  evaluateCustomerFieldRules(settings, data, mode);
}

export interface FieldSettingView extends FieldSetting {
  fieldKey: string;
  /** Name used by the customers API (lets a form send a required field it does not know). */
  apiField: string;
  label: string;
  group: string;
  locked: boolean;
}

export async function listCustomerFieldSettings(database: DatabaseRuntime): Promise<FieldSettingView[]> {
  requireRole(UserRole.VIEWER);
  const settings = await database.withTenantTransaction((client) => loadSettings(client));
  return CUSTOMER_FIELD_REGISTRY.map((field) => ({
    fieldKey: field.key,
    apiField: field.apiField,
    label: field.label,
    group: field.group,
    locked: field.locked === true,
    enabled: field.locked ? true : (settings.get(field.key)?.enabled ?? true),
    required: field.locked ? true : (settings.get(field.key)?.required ?? false),
  }));
}

export async function saveCustomerFieldSettings(
  database: DatabaseRuntime,
  inputs: FieldSettingInput[],
): Promise<FieldSettingView[]> {
  requireRole(UserRole.ADMIN);
  await requireCapability(database, 'customers', 'fields_manage', UserRole.ADMIN);
  await database.withTenantTransaction(async (client) => {
    const before = await loadSettings(client);
    const changed: string[] = [];
    for (const input of inputs) {
      const prior = before.get(input.fieldKey) ?? { enabled: true, required: false };
      if (prior.enabled === input.enabled && prior.required === input.required) continue;
      await client.query(
        `INSERT INTO customer_field_settings (agency_id, field_key, enabled, required, updated_by_user_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (agency_id, field_key)
         DO UPDATE SET enabled = EXCLUDED.enabled, required = EXCLUDED.required,
                       updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now()`,
        [getAgencyId(), input.fieldKey, input.enabled, input.required, getUserId()],
      );
      changed.push(`${input.fieldKey}:${input.enabled ? 'on' : 'off'}:${input.required ? 'req' : 'opt'}`);
    }
    // One event per changed field: the audit sanitizer caps list size, and nothing may be truncated.
    for (const change of changed) {
      await recordAuditEvent(client, {
        eventType: AuditEventType.CUSTOMER_FIELD_SETTINGS_CHANGED,
        entityType: 'customer_field_settings',
        required: true,
        metadata: { fieldsChanged: [change] },
      });
    }
  });
  return listCustomerFieldSettings(database);
}
