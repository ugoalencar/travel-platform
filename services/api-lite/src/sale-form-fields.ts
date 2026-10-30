/**
 * Sale form field registry (ADR-008), Lite copy.
 *
 * Lite is a SUBSET of the Full registry (services/api/src/sale-form-fields.ts):
 * every field here must exist there with the same key, type, storage and lock.
 * tests/sale-form-fields.test.ts guards that parity. The agency's choice of
 * which fields a category shows lives in `sale_category_fields`, by key only.
 */

import { FormFieldError, ValidationError } from './errors';

export type SaleFormFieldType = 'text' | 'date' | 'integer' | 'money' | 'enum' | 'passenger_list' | 'price_components';
export type SaleFormFieldScope = 'customer' | 'sale' | 'sale_passenger';
export type SaleFormFieldClassification = 'LEGAL' | 'MARKET' | 'SUGGESTION';
export type SaleFormProduct = 'FULL' | 'LITE';

export interface SaleFormFieldDefinition {
  key: string;
  scope: SaleFormFieldScope;
  label: string;
  type: SaleFormFieldType;
  group: string;
  /** `column`: first-class sales column. `modality`: key in sales.modality_data. */
  storage: 'column' | 'modality';
  /** Locked fields are not configurable: always enabled, never required by the profile. */
  locked: boolean;
  /** Documentation metadata only: it never changes behavior. */
  classification: SaleFormFieldClassification;
  availableIn: readonly SaleFormProduct[];
  maxLength?: number;
  min?: number;
  max?: number;
}

const BOTH: readonly SaleFormProduct[] = ['FULL', 'LITE'];

export const SALE_FORM_FIELDS: readonly SaleFormFieldDefinition[] = [
  { key: 'sale_date', scope: 'sale', label: 'Data da venda', type: 'date', group: 'Venda', storage: 'column', locked: true, classification: 'MARKET', availableIn: BOTH },
  { key: 'travel_start_date', scope: 'sale', label: 'Data de embarque / ida', type: 'date', group: 'Viagem', storage: 'column', locked: false, classification: 'MARKET', availableIn: BOTH },
  { key: 'travel_end_date', scope: 'sale', label: 'Data de retorno / fim', type: 'date', group: 'Viagem', storage: 'column', locked: false, classification: 'MARKET', availableIn: BOTH },
  { key: 'origin_text', scope: 'sale', label: 'Origem', type: 'text', group: 'Viagem', storage: 'column', locked: false, classification: 'MARKET', availableIn: BOTH, maxLength: 120 },
  { key: 'destination_text', scope: 'sale', label: 'Destino', type: 'text', group: 'Viagem', storage: 'column', locked: false, classification: 'MARKET', availableIn: BOTH, maxLength: 120 },
  { key: 'passenger_count', scope: 'sale', label: 'Quantidade de passageiros', type: 'integer', group: 'Viagem', storage: 'column', locked: false, classification: 'MARKET', availableIn: BOTH, min: 1, max: 999 },
  { key: 'locator', scope: 'sale', label: 'Localizador / PNR', type: 'text', group: 'Reserva', storage: 'modality', locked: false, classification: 'MARKET', availableIn: BOTH, maxLength: 60 },
  { key: 'ticket_number', scope: 'sale', label: 'Número do bilhete', type: 'text', group: 'Reserva', storage: 'modality', locked: false, classification: 'MARKET', availableIn: BOTH, maxLength: 60 },
  { key: 'airline', scope: 'sale', label: 'Companhia aérea', type: 'text', group: 'Reserva', storage: 'modality', locked: false, classification: 'MARKET', availableIn: BOTH, maxLength: 80 },
  { key: 'flight_number', scope: 'sale', label: 'Número do voo', type: 'text', group: 'Reserva', storage: 'modality', locked: false, classification: 'MARKET', availableIn: BOTH, maxLength: 20 },
  { key: 'cabin_class', scope: 'sale', label: 'Classe / cabine', type: 'text', group: 'Reserva', storage: 'modality', locked: false, classification: 'MARKET', availableIn: BOTH, maxLength: 60 },
  { key: 'confirmation_number', scope: 'sale', label: 'Nº de confirmação / voucher', type: 'text', group: 'Reserva', storage: 'modality', locked: false, classification: 'MARKET', availableIn: BOTH, maxLength: 60 },
  { key: 'cancellation_policy', scope: 'sale', label: 'Política de cancelamento informada', type: 'text', group: 'Condições', storage: 'modality', locked: false, classification: 'LEGAL', availableIn: BOTH, maxLength: 500 },
];

/** Keys a sale payload must never carry (rule/commission data is not a form value). */
export const SALE_RULE_KEYS = ['rate', 'base', 'deadline', 'commission'] as const;

const FIELD_BY_KEY = new Map(SALE_FORM_FIELDS.map((field) => [field.key, field]));

export function getSaleFormField(key: string): SaleFormFieldDefinition | undefined {
  return FIELD_BY_KEY.get(key);
}

export function saleFormFieldsFor(product: SaleFormProduct): SaleFormFieldDefinition[] {
  return SALE_FORM_FIELDS.filter((field) => field.availableIn.includes(product));
}

export interface SaleFormRule {
  fieldKey: string;
  enabled: boolean;
  required: boolean;
}

/** Validates a profile submitted by an administrator. 400 on any structural problem. */
export function validateProfileRules(rules: readonly SaleFormRule[]): void {
  const seen = new Set<string>();
  for (const rule of rules) {
    const field = getSaleFormField(rule.fieldKey);
    if (!field || !field.availableIn.includes('LITE')) {
      throw new ValidationError(`Campo de formulário desconhecido: ${rule.fieldKey}`);
    }
    if (seen.has(rule.fieldKey)) {
      throw new ValidationError(`Campo de formulário repetido: ${rule.fieldKey}`);
    }
    seen.add(rule.fieldKey);
    if (rule.required && !rule.enabled) {
      throw new ValidationError(`O campo ${rule.fieldKey} não pode ser obrigatório estando desabilitado`);
    }
    if (field.locked && (!rule.enabled || rule.required)) {
      throw new ValidationError(`O campo ${rule.fieldKey} é fixo e não pode ser desabilitado nem obrigatório`);
    }
  }
}

function isBlank(value: unknown): boolean {
  return value === null || (typeof value === 'string' && value.trim().length === 0);
}

function parseValue(field: SaleFormFieldDefinition, value: unknown): string | number {
  const invalid = (message: string) => new FormFieldError('FIELD_INVALID', field.key, `${field.label}: ${message}`);

  switch (field.type) {
    case 'text': {
      if (typeof value !== 'string') throw invalid('deve ser texto');
      const text = value.trim();
      if (field.maxLength !== undefined && text.length > field.maxLength) {
        throw invalid(`no máximo ${field.maxLength} caracteres`);
      }
      return text;
    }
    case 'date': {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid('use o formato AAAA-MM-DD');
      const [year, month, day] = value.split('-').map(Number) as [number, number, number];
      const parsed = new Date(Date.UTC(year, month - 1, day));
      if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
        throw invalid('data inexistente');
      }
      return value;
    }
    case 'integer': {
      if (typeof value !== 'number' || !Number.isInteger(value)) throw invalid('deve ser um número inteiro');
      if ((field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) {
        throw invalid(`deve estar entre ${field.min ?? '-∞'} e ${field.max ?? '∞'}`);
      }
      return value;
    }
    default:
      throw invalid('tipo de campo ainda não suportado');
  }
}

/**
 * Validates form values (keyed by field_key) against a category profile or the
 * profile snapshotted on the sale. Blank optional values become `null`.
 * create: required+enabled fields must be present. update: only keys sent.
 */
export function validateSaleFormValues(
  rules: readonly SaleFormRule[],
  values: Record<string, unknown>,
  mode: 'create' | 'update',
): Record<string, string | number | null> {
  const ruleByKey = new Map(rules.map((rule) => [rule.fieldKey, rule]));
  const result: Record<string, string | number | null> = {};

  for (const [key, raw] of Object.entries(values)) {
    if (raw === undefined) continue;
    const field = getSaleFormField(key);
    if (!field) throw new FormFieldError('FIELD_UNKNOWN', key, `Campo desconhecido: ${key}`);

    const rule = ruleByKey.get(key);
    if (!field.locked && (!rule || !rule.enabled)) {
      throw new FormFieldError('FIELD_DISABLED', key, `${field.label} não está habilitado para esta categoria`);
    }

    if (isBlank(raw)) {
      if (field.locked || rule?.required) {
        throw new FormFieldError(field.locked ? 'FIELD_INVALID' : 'FIELD_REQUIRED', key, `${field.label} é obrigatório`);
      }
      result[key] = null;
      continue;
    }
    result[key] = parseValue(field, raw);
  }

  if (mode === 'create') {
    for (const rule of rules) {
      if (rule.enabled && rule.required && (result[rule.fieldKey] === undefined || result[rule.fieldKey] === null)) {
        const field = getSaleFormField(rule.fieldKey);
        throw new FormFieldError('FIELD_REQUIRED', rule.fieldKey, `${field?.label ?? rule.fieldKey} é obrigatório`);
      }
    }
  }

  assertTravelDateOrder(result.travel_start_date, result.travel_end_date);
  return result;
}

export function assertTravelDateOrder(start: unknown, end: unknown): void {
  if (typeof start === 'string' && typeof end === 'string' && end < start) {
    throw new FormFieldError('FIELD_INVALID', 'travel_end_date', 'A data de retorno não pode ser anterior à de ida');
  }
}

export interface FormSnapshot {
  categoryId: string;
  categoryName: string;
  formRevision: number;
  capturedAt: string;
  fields: Array<{ fieldKey: string; label: string; enabled: boolean; required: boolean }>;
}

/** Self-contained copy of the profile applied to a sale (survives later profile edits and migration). */
export function buildFormSnapshot(
  category: { id: string; name: string; formRevision: number },
  rules: readonly SaleFormRule[],
  now: Date = new Date(),
): FormSnapshot {
  return {
    categoryId: category.id,
    categoryName: category.name,
    formRevision: category.formRevision,
    capturedAt: now.toISOString(),
    fields: rules.map((rule) => ({
      fieldKey: rule.fieldKey,
      label: getSaleFormField(rule.fieldKey)?.label ?? rule.fieldKey,
      enabled: rule.enabled,
      required: rule.required,
    })),
  };
}
