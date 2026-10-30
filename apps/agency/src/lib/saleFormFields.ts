import type { CreateSaleInput, SaleCategoryFormField } from './api';

// Registry field_key -> sale body property for the first-class report fields
// (ADR-008 item 5). Every other enabled field travels inside `modalityData`.
const COLUMN_PROPS = {
  sale_date: 'saleDate',
  travel_start_date: 'travelStartDate',
  travel_end_date: 'travelEndDate',
  origin_text: 'originText',
  destination_text: 'destinationText',
  passenger_count: 'passengerCount',
} as const;

type ColumnKey = keyof typeof COLUMN_PROPS;

function isColumnKey(key: string): key is ColumnKey {
  return key in COLUMN_PROPS;
}

/** Fields the category form adds beyond the base sale fields (the locked sale date is always shown). */
export function configurableFields(fields: readonly SaleCategoryFormField[]): SaleCategoryFormField[] {
  return fields.filter((field) => field.enabled && !field.locked).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Labels of required, enabled fields left empty. */
export function missingRequired(fields: readonly SaleCategoryFormField[], values: Record<string, string>): string[] {
  return configurableFields(fields)
    .filter((field) => field.required && (values[field.fieldKey] ?? '').trim() === '')
    .map((field) => field.label);
}

/** Builds the sale body fragment for the entered values; empty values are omitted. */
export function buildSaleFormPayload(
  fields: readonly SaleCategoryFormField[],
  values: Record<string, string>,
): Pick<CreateSaleInput, 'saleDate' | 'travelStartDate' | 'travelEndDate' | 'originText' | 'destinationText' | 'passengerCount' | 'modalityData'> {
  const payload: Record<string, string | number | Record<string, string>> = {};
  const modalityData: Record<string, string> = {};

  const saleDate = (values.sale_date ?? '').trim();
  if (saleDate !== '') payload.saleDate = saleDate;

  for (const field of configurableFields(fields)) {
    const raw = (values[field.fieldKey] ?? '').trim();
    if (raw === '') continue;
    if (isColumnKey(field.fieldKey)) {
      payload[COLUMN_PROPS[field.fieldKey]] = field.type === 'integer' ? Number(raw) : raw;
    } else {
      modalityData[field.fieldKey] = raw;
    }
  }
  if (Object.keys(modalityData).length > 0) payload.modalityData = modalityData;
  return payload;
}
