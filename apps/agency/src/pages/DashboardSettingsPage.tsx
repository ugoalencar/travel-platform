import { useEffect, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { api } from '../lib/api';

interface Entry {
  key: string;
  title: string;
  enabled: boolean;
}

/**
 * Dashboard layout (DASH-01): order and on/off only. Enabling a widget never
 * gives anybody access to data -- the server decides, per viewer, on every read.
 */
export function DashboardSettingsPage() {
  const [widgets, setWidgets] = useState<Entry[]>([]);
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .get<{ version: number; widgets: Entry[] }>('/settings/dashboard')
      .then(({ data }) => {
        setWidgets(data.widgets);
        setVersion(data.version);
        setLoaded(true);
      })
      .catch(() => setError('Não foi possível carregar o layout do dashboard.'));
  }, []);

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= widgets.length) return;
    const next = [...widgets];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setWidgets(next);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { data } = await api.put<{ version: number; widgets: Entry[] }>('/settings/dashboard', {
        version,
        widgets: widgets.map(({ key, enabled }) => ({ key, enabled })),
      });
      setWidgets(data.widgets);
      setVersion(data.version);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Painéis do dashboard" />
      <Card>
        <CardHeader>
          <CardTitle>Ordem e visibilidade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          <p>
            Habilitar um painel não dá acesso a dados: cada pessoa só vê os painéis que o seu perfil já permite.
          </p>
          {widgets.map((widget, index) => (
            <div key={widget.key} className="flex items-center gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`${widget.title}: habilitado`}
                  checked={widget.enabled}
                  disabled={saving}
                  onChange={(event) => {
                    setSaved(false);
                    setWidgets(widgets.map((w) => (w.key === widget.key ? { ...w, enabled: event.target.checked } : w)));
                  }}
                />
                {widget.title}
              </label>
              <button type="button" aria-label={`Subir ${widget.title}`} onClick={() => move(index, -1)}>
                ↑
              </button>
              <button type="button" aria-label={`Descer ${widget.title}`} onClick={() => move(index, 1)}>
                ↓
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={saving || !loaded}
            onClick={() => void save()}
            className="rounded-md border border-slate-300 px-3 py-1.5"
          >
            Salvar layout
          </button>
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          {saved && <p className="text-green-700">Layout salvo.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
