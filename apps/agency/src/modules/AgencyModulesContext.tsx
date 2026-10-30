import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useCurrentUser } from '../hooks/useCurrentUser';

export interface AgencyModuleState {
  key: string;
  label: string;
  description: string;
  essential: boolean;
  dependencies: string[];
  apiPrefixes: string[];
  uiPrefixes: string[];
  entitlement?: string;
  enabled: boolean;
  entitled: boolean;
  available: boolean;
}

interface AgencyModulesContextValue {
  modules: AgencyModuleState[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const AgencyModulesContext = createContext<AgencyModulesContextValue | null>(null);

export function AgencyModulesProvider({ children }: { children: ReactNode }) {
  const [modules, setModules] = useState<AgencyModuleState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ modules: AgencyModuleState[] }>('/settings/modules');
      setModules(data.modules);
      setError(null);
    } catch {
      setError('Não foi possível carregar os módulos da agência.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo(() => ({ modules, loading, error, refresh }), [modules, loading, error, refresh]);
  return <AgencyModulesContext.Provider value={value}>{children}</AgencyModulesContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- context hook must share the provider context.
export function useAgencyModules(): AgencyModulesContextValue {
  const context = useContext(AgencyModulesContext);
  if (!context) throw new Error('useAgencyModules must be used within AgencyModulesProvider');
  return context;
}

// eslint-disable-next-line react-refresh/only-export-components -- pure path matcher is shared with the sidebar.
export function matchAgencyModuleForUiPath(pathname: string, modules: AgencyModuleState[]): AgencyModuleState | undefined {
  return modules
    .flatMap((module) => module.uiPrefixes
      .filter((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
      .map((prefix) => ({ module, prefixLength: prefix.length })))
    .sort((a, b) => b.prefixLength - a.prefixLength)[0]?.module;
}

export function AgencyModuleRouteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { modules, loading, error } = useAgencyModules();
  const { user } = useCurrentUser();
  const module = matchAgencyModuleForUiPath(pathname, modules);
  if (!module || module.key === 'CORE') return <>{children}</>;
  if (loading) return <p role="status" className="p-6 text-sm text-slate-600">Verificando acesso ao módulo…</p>;
  if (error) return <p role="alert" className="m-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{error}</p>;
  if (module.available) return <>{children}</>;

  const reason = !module.enabled
    ? 'Este módulo está desativado nas configurações da agência.'
    : 'O plano atual da agência não inclui este módulo.';
  return (
    <section className="m-6 max-w-2xl rounded-xl border border-slate-200 bg-white p-6" role="status">
      <h1 className="text-xl font-semibold text-slate-900">{module.label} indisponível</h1>
      <p className="mt-2 text-sm text-slate-600">{reason} Os dados existentes foram preservados.</p>
      {(user?.role === 'OWNER' || user?.role === 'ADMIN') && <Link to="/settings/modules" className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">Ver módulos da agência</Link>}
    </section>
  );
}

