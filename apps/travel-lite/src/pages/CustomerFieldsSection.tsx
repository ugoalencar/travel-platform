import { useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorNote, SuccessNote } from '../ui';

interface FieldSetting {
  field_key: string;
  label: string;
  group: string;
  locked: boolean;
  enabled: boolean;
  required: boolean;
}

/**
 * Configuration of the customer registration form (Frente 2). Same contract as
 * Full; the server enforces it and `name` stays fixed.
 */
export function CustomerFieldsSection() {
  const [fields, setFields] = useState<FieldSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ fields: FieldSetting[] }>('/customers/field-settings')
      .then((result) => {
        if (!cancelled) setFields(result.fields);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function update(fieldKey: string, patch: Partial<Pick<FieldSetting, 'enabled' | 'required'>>) {
    setNotice(null);
    setFields((current) =>
      current.map((field) => {
        if (field.field_key !== fieldKey) return field;
        const next = { ...field, ...patch };
        if (!next.enabled) next.required = false;
        return next;
      }),
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api<{ fields: FieldSetting[] }>('/settings/customers/field-settings', {
        method: 'PUT',
        body: {
          fields: fields
            .filter((field) => !field.locked)
            .map(({ field_key, enabled, required }) => ({ field_key, enabled, required })),
        },
      });
      setFields(result.fields);
      setNotice('Configuração salva.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Carregando…</p>;

  const groups = Array.from(new Set(fields.map((field) => field.group)));

  return (
    <section className="lite-section">
      <h2>Cadastro de cliente</h2>
      <p>
        Escolha quais campos aparecem no cadastro de cliente e quais são obrigatórios. Desabilitar um campo não
        apaga dados já cadastrados.
      </p>
      <ErrorNote error={error} />
      <SuccessNote success={notice} />
      {groups.map((group) => (
        <div key={group}>
          <h3>{group}</h3>
          {fields
            .filter((field) => field.group === group)
            .map((field) => (
              <div key={field.field_key} className="row">
                <span>
                  {field.label}
                  {field.locked ? ' (campo fixo)' : ''}
                </span>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`${field.label}: habilitado`}
                    checked={field.enabled}
                    disabled={field.locked || saving}
                    onChange={(event) => update(field.field_key, { enabled: event.target.checked })}
                  />{' '}
                  Habilitado
                </label>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`${field.label}: obrigatório`}
                    checked={field.required}
                    disabled={field.locked || saving || !field.enabled}
                    onChange={(event) => update(field.field_key, { required: event.target.checked })}
                  />{' '}
                  Obrigatório
                </label>
              </div>
            ))}
        </div>
      ))}
      <button type="button" className="btn" disabled={saving} onClick={() => void save()}>
        Salvar configuração
      </button>
    </section>
  );
}
