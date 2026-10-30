import { useEffect, useState } from 'react';
import { getCustomerFieldSettings, saveCustomerFieldSettings, type CustomerFieldSetting } from '../../lib/api';

/**
 * Admin configuration of the customer registration form (Frente 2).
 * The server enforces the rules; locked fields (name) cannot be changed.
 */
export function CustomerFieldSettingsTab() {
  const [fields, setFields] = useState<CustomerFieldSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCustomerFieldSettings()
      .then((result) => {
        if (!cancelled) setFields(result);
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar a configuração do cadastro.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function update(fieldKey: string, patch: Partial<Pick<CustomerFieldSetting, 'enabled' | 'required'>>) {
    setSaved(false);
    setFields((current) =>
      current.map((field) => {
        if (field.fieldKey !== fieldKey) return field;
        const next = { ...field, ...patch };
        if (!next.enabled) next.required = false;
        return next;
      }),
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await saveCustomerFieldSettings(
        fields
          .filter((field) => !field.locked)
          .map(({ fieldKey, enabled, required }) => ({ fieldKey, enabled, required })),
      );
      setFields(result);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Carregando…</p>;

  const groups = Array.from(new Set(fields.map((field) => field.group)));

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Escolha quais campos aparecem no cadastro de cliente e quais são obrigatórios. Desabilitar um
        campo não apaga dados já cadastrados.
      </p>
      {groups.map((group) => (
        <div key={group}>
          <p className="mb-1 text-xs font-semibold text-slate-700">{group}</p>
          <div className="space-y-1">
            {fields
              .filter((field) => field.group === group)
              .map((field) => (
                <div key={field.fieldKey} className="flex items-center justify-between gap-3 text-sm text-slate-700">
                  <span>
                    {field.label}
                    {field.locked && <span className="ml-2 text-xs text-slate-500">Campo fixo (integridade)</span>}
                  </span>
                  <span className="flex items-center gap-4">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        aria-label={`${field.label}: habilitado`}
                        checked={field.enabled}
                        disabled={field.locked || saving}
                        onChange={(event) => update(field.fieldKey, { enabled: event.target.checked })}
                      />
                      Habilitado
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        aria-label={`${field.label}: obrigatório`}
                        checked={field.required}
                        disabled={field.locked || saving || !field.enabled}
                        onChange={(event) => update(field.fieldKey, { required: event.target.checked })}
                      />
                      Obrigatório
                    </label>
                  </span>
                </div>
              ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
      >
        Salvar configuração
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {saved && <p className="text-sm text-green-700">Configuração salva.</p>}
    </div>
  );
}
