import { useState } from 'react';

interface FeatureFlag {
  id: string;
  name: string;
  key: string;
  description: string;
  enabled: boolean;
  scope: 'GLOBAL' | 'PLAN' | 'TENANT';
  rolloutPercentage: number;
  createdAt: string;
}

const scopeLabels: Record<FeatureFlag['scope'], string> = {
  GLOBAL: 'Global',
  PLAN: 'Plano',
  TENANT: 'Agência',
};

export function FeatureFlagsPage() {
  const [flags] = useState<FeatureFlag[]>([
    {
      id: '1',
      name: 'Novo Painel',
      key: 'feature_new_dashboard',
      description: 'Painel aprimorado com métricas em tempo real',
      enabled: true,
      scope: 'GLOBAL',
      rolloutPercentage: 100,
      createdAt: '2026-08-15',
    },
    {
      id: '2',
      name: 'Casos de Suporte Beta',
      key: 'feature_support_cases',
      description: 'Sistema de gerenciamento de tickets de suporte',
      enabled: true,
      scope: 'PLAN',
      rolloutPercentage: 75,
      createdAt: '2026-08-20',
    },
    {
      id: '3',
      name: 'Análise Avançada',
      key: 'feature_advanced_analytics',
      description: 'Análise preditiva para previsão de receita',
      enabled: false,
      scope: 'TENANT',
      rolloutPercentage: 0,
      createdAt: '2026-08-25',
    },
  ]);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Recursos Experimentais</h1>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nome</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Chave</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Escopo</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Implantação</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {flags.map((flag) => (
              <tr key={flag.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium">{flag.name}</td>
                <td className="px-6 py-4 text-sm text-gray-600 font-mono text-xs">{flag.key}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-cyan-100 text-cyan-900 rounded text-xs font-semibold">
                    {scopeLabels[flag.scope]}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">{flag.rolloutPercentage}%</td>
                <td className="px-6 py-4">
                  {flag.enabled ? (
                    <span className="px-2 py-1 rounded text-xs font-semibold bg-emerald-100 text-emerald-900">
                      ATIVADO
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded text-xs font-semibold bg-slate-100 text-slate-700">
                      DESATIVADO
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
