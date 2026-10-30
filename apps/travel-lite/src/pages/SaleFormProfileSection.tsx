import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { ErrorNote, SuccessNote } from '../ui';
import type { SaleFormField } from '../saleForm';

interface CategoryOption {
  id: string;
  name: string;
  active: boolean;
}

/** Cadastros › Formulário de venda: which fields each category asks for (ADR-008). */
export function SaleFormProfileSection() {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [fields, setFields] = useState<SaleFormField[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // only the answer for the category currently selected may touch the editor
  const selectionRef = useRef(0);

  useEffect(() => {
    api<{ items: CategoryOption[] }>('/categories')
      .then((response) => setCategories(response.items))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Falha ao carregar categorias'));
  }, []);

  const loadForm = useCallback(async (id: string, selection: number) => {
    setFields(null);
    setNotice(null);
    setError(null);
    if (id === '') return;
    try {
      const response = await api<{ form: { fields: SaleFormField[] } }>(`/categories/${id}/form`);
      if (selectionRef.current === selection) setFields(response.form.fields);
    } catch (err) {
      if (selectionRef.current === selection) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar o formulário');
      }
    }
  }, []);

  function choose(id: string): void {
    const selection = ++selectionRef.current;
    setCategoryId(id);
    void loadForm(id, selection);
  }

  function toggle(key: string, change: 'enabled' | 'required'): void {
    setNotice(null);
    setFields((current) =>
      (current ?? []).map((field) => {
        if (field.field_key !== key) return field;
        if (change === 'enabled') {
          const enabled = !field.enabled;
          return { ...field, enabled, required: enabled ? field.required : false };
        }
        return { ...field, required: field.enabled ? !field.required : false };
      }),
    );
  }

  async function save(): Promise<void> {
    if (fields === null) return;
    const selection = selectionRef.current;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api<{ form: { fields: SaleFormField[] } }>(`/categories/${categoryId}/form`, {
        method: 'PUT',
        body: {
          fields: fields
            .filter((field) => !field.locked)
            .map((field) => ({
              field_key: field.field_key,
              enabled: field.enabled,
              required: field.required,
              sort_order: field.sort_order,
            })),
        },
      });
      if (selectionRef.current === selection) {
        setFields(response.form.fields);
        setNotice('Formulário salvo. Vendas já registradas mantêm o formulário com que foram feitas.');
      }
    } catch (err) {
      if (selectionRef.current === selection) {
        setError(err instanceof Error ? err.message : 'Falha ao salvar o formulário');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h2>Formulário de venda</h2>
      <p className="lite-muted">
        Escolha uma categoria e marque os campos que a venda dela deve mostrar e quais são obrigatórios. Campos
        desabilitados não aparecem na venda.
      </p>
      <ErrorNote error={error} />
      <SuccessNote success={notice} />
      <label className="field">
        <span>Categoria</span>
        <select value={categoryId} onChange={(event) => choose(event.target.value)}>
          <option value="">Selecione…</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
              {category.active ? '' : ' (inativa)'}
            </option>
          ))}
        </select>
      </label>
      {fields !== null ? (
        <>
          <div className="lite-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campo</th>
                  <th>Grupo</th>
                  <th>Habilitado</th>
                  <th>Obrigatório</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <tr key={field.field_key}>
                    <td>{field.label}</td>
                    <td>{field.group}</td>
                    {field.locked ? (
                      <td colSpan={2} className="lite-muted">
                        Campo fixo da venda
                      </td>
                    ) : (
                      <>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Habilitado: ${field.label}`}
                            checked={field.enabled}
                            onChange={() => toggle(field.field_key, 'enabled')}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Obrigatório: ${field.label}`}
                            checked={field.required}
                            disabled={!field.enabled}
                            onChange={() => toggle(field.field_key, 'required')}
                          />
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
              {saving ? 'Salvando…' : 'Salvar formulário'}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
