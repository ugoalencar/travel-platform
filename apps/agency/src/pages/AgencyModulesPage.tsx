import { useState } from 'react';
import { api } from '../lib/api';
import { useAgencyModules, type AgencyModuleState } from '../modules/AgencyModulesContext';
import { useCurrentUser } from '../hooks/useCurrentUser';

function isBlockedByDependency(module: AgencyModuleState, modules: AgencyModuleState[]): string[] {
  return modules
    .filter((candidate) => candidate.enabled && candidate.dependencies.includes(module.key))
    .map((candidate) => candidate.label);
}

export function AgencyModulesPage() {
  const { modules, loading, error: loadError, refresh } = useAgencyModules();
  const { user, loading: userLoading } = useCurrentUser();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(module: AgencyModuleState) {
    setPendingKey(module.key);
    setError(null);
    try {
      await api.patch(`/settings/modules/${module.key}`, { enabled: !module.enabled });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o módulo.');
    } finally {
      setPendingKey(null);
    }
  }

  if (loading || userLoading) return <p role="status">Carregando módulos…</p>;
  if (user?.role !== 'OWNER' && user?.role !== 'ADMIN') return <p role="alert">Somente Owner ou Admin pode gerenciar os módulos da agência.</p>;
  if (loadError) return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}</p>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Módulos da agência</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">Escolha as áreas disponíveis para a agência. Desativar um módulo bloqueia o acesso, mas preserva os dados para reativação.</p>
      </header>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {modules.map((module) => {
          const blockers = isBlockedByDependency(module, modules);
          const cannotEnable = !module.enabled && !module.entitled;
          const disabled = module.essential || pendingKey !== null || blockers.length > 0 || cannotEnable;
          const dependencyLabels = module.dependencies
            .map((key) => modules.find((candidate) => candidate.key === key)?.label)
            .filter((label): label is string => Boolean(label));
          return (
            <article key={module.key} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium text-slate-900">{module.label}</h2>
                  {module.essential && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Essencial</span>}
                  {!module.entitled && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Indisponível no plano</span>}
                </div>
                <p className="mt-1 text-sm text-slate-600">{module.description}</p>
                {dependencyLabels.length > 0 && <p className="mt-2 text-xs text-slate-500">Depende de: {dependencyLabels.join(', ')}.</p>}
                {blockers.length > 0 && <p className="mt-2 text-xs text-amber-800">Desative primeiro: {blockers.join(', ')}.</p>}
                {cannotEnable && <p className="mt-2 text-xs text-amber-800">A ativação depende da liberação do módulo no plano da agência.</p>}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={module.enabled}
                aria-label={module.label}
                disabled={disabled}
                onClick={() => void toggle(module)}
                className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${module.enabled ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-white text-slate-700'}`}
              >
                <span aria-hidden="true">{module.enabled ? '●' : '○'}</span>
                {module.enabled ? 'Ativo' : 'Desativado'}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
