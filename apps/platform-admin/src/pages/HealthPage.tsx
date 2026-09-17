import { useEffect, useState } from 'react';

interface HealthInfo {
  status: string;
  service: string;
}

interface VersionInfo {
  appVersion: string;
  buildSha: string;
  migrationVersion: string;
  deploymentId: string;
  releasedAt: string;
}

interface ReadinessInfo {
  status: string;
  service?: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      health: HealthInfo | null;
      readiness: ReadinessInfo | null;
      version: VersionInfo | null;
    };

export function HealthPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus(path: string) {
      try {
        const res = await fetch(path);
        if (!res.ok) return null;
        return (await res.json()) as unknown;
      } catch {
        return null;
      }
    }

    Promise.all([
      fetchStatus('/api/health') as Promise<HealthInfo | null>,
      fetchStatus('/api/readiness') as Promise<ReadinessInfo | null>,
      fetchStatus('/api/version') as Promise<VersionInfo | null>,
    ])
      .then(([health, readiness, version]) => {
        if (cancelled) return;
        setState({ status: 'success', health, readiness, version });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Não foi possível verificar o status.' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h1 className="mb-8 text-3xl font-bold">Saúde do Sistema</h1>

      {state.status === 'loading' && <p className="text-sm text-slate-500">Verificando…</p>}
      {state.status === 'error' && <p className="text-sm text-red-600">{state.message}</p>}

      {state.status === 'success' && (
        <div className="space-y-6">
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-slate-600">API (/health)</p>
                <p className={`text-2xl font-bold ${state.health?.status === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
                  {state.health ? state.health.status.toUpperCase() : 'INDISPONÍVEL'}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Prontidão (/readiness)</p>
                <p className={`text-2xl font-bold ${state.readiness?.status === 'ready' ? 'text-emerald-700' : 'text-red-600'}`}>
                  {state.readiness ? state.readiness.status.toUpperCase() : 'INDISPONÍVEL'}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Versão implantada</p>
                <p className="text-2xl font-bold text-slate-700">
                  {state.version?.appVersion ?? '—'}
                </p>
              </div>
            </div>
          </div>

          {state.version && (
            <div className="overflow-hidden rounded-lg bg-white shadow">
              <table className="w-full">
                <tbody className="divide-y">
                  <tr>
                    <td className="px-6 py-3 text-sm font-medium text-slate-600">Build (SHA)</td>
                    <td className="px-6 py-3 text-sm text-slate-900">{state.version.buildSha}</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-sm font-medium text-slate-600">Versão de migração</td>
                    <td className="px-6 py-3 text-sm text-slate-900">{state.version.migrationVersion}</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-sm font-medium text-slate-600">Deployment</td>
                    <td className="px-6 py-3 text-sm text-slate-900">{state.version.deploymentId}</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-sm font-medium text-slate-600">Lançada em</td>
                    <td className="px-6 py-3 text-sm text-slate-900">
                      {Number.isNaN(new Date(state.version.releasedAt).getTime())
                        ? '—'
                        : new Date(state.version.releasedAt).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* No latency/uptime-history telemetry exists in the backend yet
              (no metrics-collector persistence exposed to this app) -- this
              intentionally does not show fabricated latency/uptime numbers. */}
        </div>
      )}
    </div>
  );
}
