import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface CatalogEntry {
  resource: string;
  action: string;
  minRole: string;
  delegable: boolean;
  grantableToRoles: string[];
  mutation: boolean;
  /** The server applies a per-user block for this key; when false "Bloquear" is not offered. */
  enforced: boolean;
}

interface SavedOverride {
  resource: string;
  action: string;
  effect: 'GRANT' | 'REVOKE';
  reason: string;
}

type Choice = 'DEFAULT' | 'GRANT' | 'REVOKE';

const keyOf = (item: { resource: string; action: string }) => `${item.resource}:${item.action}`;

/**
 * Per-user permission overrides (SEC-01). The server is the authority: this
 * only reflects what the catalog allows (GRANT only for delegable keys of an
 * AGENT) and sends the whole set, with the reason the audit trail requires.
 */
export function PermissionOverridesEditor({
  memberId,
  memberRole,
}: {
  memberId: string;
  memberRole: string;
}) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // If the initial load failed the editor must not offer saving: an empty set would wipe real overrides.
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<{ catalog: CatalogEntry[] }>('/settings/permission-catalog'),
      api.get<{ overrides: SavedOverride[] }>(`/settings/team/${memberId}/permission-overrides`),
    ])
      .then(([cat, mine]) => {
        if (cancelled) return;
        setCatalog(cat.data.catalog);
        setChoices(Object.fromEntries(mine.data.overrides.map((item) => [keyOf(item), item.effect])));
        setReason(mine.data.overrides[0]?.reason ?? '');
      })
      .catch(() => {
        if (!cancelled) {
          setLoadFailed(true);
          setError('Não foi possível carregar as permissões individuais.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  async function save() {
    if (loadFailed) return;
    const overrides = catalog
      .filter((entry) => (choices[keyOf(entry)] ?? 'DEFAULT') !== 'DEFAULT')
      .map((entry) => ({
        resource: entry.resource,
        action: entry.action,
        effect: choices[keyOf(entry)] as 'GRANT' | 'REVOKE',
        reason: reason.trim(),
      }));
    if (overrides.length > 0 && reason.trim().length === 0) {
      setError('Informe o motivo da alteração.');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { data } = await api.put<{ overrides: SavedOverride[] }>(
        `/settings/team/${memberId}/permission-overrides`,
        { overrides },
      );
      setChoices(Object.fromEntries(data.overrides.map((item) => [keyOf(item), item.effect])));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
      <p className="text-xs font-medium text-slate-500">
        Permissões individuais (restrição vale mais que concessão, que vale mais que o papel)
      </p>
      <div className="space-y-1.5">
        {catalog.map((entry) => {
          const canGrant =
            entry.delegable && !entry.mutation && entry.grantableToRoles.includes(memberRole);
          const label = `${entry.resource}: ${entry.action}`;
          return (
            <div key={keyOf(entry)} className="flex items-center justify-between gap-3 text-sm text-slate-700">
              <label htmlFor={`ov-${memberId}-${keyOf(entry)}`}>{label}</label>
              <select
                id={`ov-${memberId}-${keyOf(entry)}`}
                aria-label={label}
                value={choices[keyOf(entry)] ?? 'DEFAULT'}
                disabled={saving}
                onChange={(event) => {
                  setSaved(false);
                  setChoices({ ...choices, [keyOf(entry)]: event.target.value as Choice });
                }}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="DEFAULT">Padrão do papel</option>
                {canGrant && <option value="GRANT">Conceder</option>}
                {entry.enforced && <option value="REVOKE">Bloquear</option>}
              </select>
            </div>
          );
        })}
      </div>
      <div>
        <label htmlFor={`ov-reason-${memberId}`} className="text-xs text-slate-500">
          Motivo
        </label>
        <input
          id={`ov-reason-${memberId}`}
          aria-label="Motivo"
          value={reason}
          maxLength={120}
          disabled={saving}
          onChange={(event) => setReason(event.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="button"
        disabled={saving || loadFailed}
        onClick={() => void save()}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
      >
        Salvar permissões
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      {saved && <p className="text-xs text-green-700">Permissões salvas.</p>}
    </div>
  );
}
