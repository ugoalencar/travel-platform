import { configurableFields, type SaleFormState } from './saleForm';

interface Props {
  state: SaleFormState;
  values: Record<string, string>;
  onChange: (fieldKey: string, value: string) => void;
}

/** Extra sale-form inputs configured for the selected category (ADR-008). */
export function SaleCategoryFormFields({ state, values, onChange }: Props) {
  if (state.status === 'loading') return <p className="lite-muted">Carregando campos da categoria…</p>;
  if (state.status === 'error') return <p role="alert" className="lite-error">{state.message}</p>;
  if (state.status !== 'ready') return null;

  const fields = configurableFields(state.fields);
  if (fields.length === 0) return null;

  return (
    <>
      {fields.map((field) => (
        <label className="field" key={field.field_key}>
          <span>
            {field.label}
            {field.required ? ' *' : ''}
          </span>
          <input
            type={field.type === 'date' ? 'date' : field.type === 'integer' ? 'number' : 'text'}
            min={field.type === 'integer' ? 1 : undefined}
            aria-required={field.required}
            value={values[field.field_key] ?? ''}
            onChange={(event) => onChange(field.field_key, event.target.value)}
          />
        </label>
      ))}
    </>
  );
}
