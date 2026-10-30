import { useEffect, useRef, useState } from 'react';
import { api } from './api';

/** One entry of GET /categories/:id/form (registry merged with the category profile). */
export interface SaleFormField {
  field_key: string;
  label: string;
  type: 'text' | 'date' | 'integer' | 'money' | 'enum' | 'passenger_list' | 'price_components';
  group: string;
  storage: 'column' | 'modality';
  locked: boolean;
  enabled: boolean;
  required: boolean;
  sort_order: number;
}

export type SaleFormState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; fields: SaleFormField[] };

/** Fields a category adds to the sale form: enabled and configurable (the sale date is always shown). */
export function configurableFields(fields: readonly SaleFormField[]): SaleFormField[] {
  return fields.filter((field) => field.enabled && !field.locked).sort((a, b) => a.sort_order - b.sort_order);
}

/** Labels of required fields left empty. */
export function missingRequired(fields: readonly SaleFormField[], values: Record<string, string>): string[] {
  return configurableFields(fields)
    .filter((field) => field.required && (values[field.field_key] ?? '').trim() === '')
    .map((field) => field.label);
}

/** Sale body fragment for the typed values; empty values are omitted. */
export function buildFormPayload(
  fields: readonly SaleFormField[],
  values: Record<string, string>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const modality: Record<string, string> = {};
  for (const field of configurableFields(fields)) {
    const raw = (values[field.field_key] ?? '').trim();
    if (raw === '') continue;
    if (field.storage === 'column') payload[field.field_key] = field.type === 'integer' ? Number(raw) : raw;
    else modality[field.field_key] = raw;
  }
  if (Object.keys(modality).length > 0) payload.modality_data = modality;
  return payload;
}

/** Loads the form profile of the selected category; a late answer for a previous category is ignored. */
export function useSaleCategoryForm(categoryId: string): SaleFormState {
  const [state, setState] = useState<SaleFormState>({ status: 'none' });
  const latest = useRef(0);

  useEffect(() => {
    const requestId = ++latest.current;
    if (categoryId === '') {
      setState({ status: 'none' });
      return;
    }
    setState({ status: 'loading' });
    api<{ form: { fields: SaleFormField[] } }>(`/categories/${categoryId}/form`)
      .then((response) => {
        if (latest.current === requestId) setState({ status: 'ready', fields: response.form.fields });
      })
      .catch((err: unknown) => {
        if (latest.current !== requestId) return;
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Falha ao carregar o formulário da categoria',
        });
      });
  }, [categoryId]);

  return state;
}

/** Accepts "2300", "2300,50", "2.300,50" or "2300.50"; anything else is null (never guessed). */
export function parseMoneyInput(raw: string): number | null {
  const text = raw.trim();
  if (text === '') return null;
  let normalized: string;
  if (text.includes(',')) {
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(text)) return null;
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else {
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
    normalized = text;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
