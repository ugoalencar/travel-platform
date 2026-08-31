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

export function FeatureFlagsPage() {
  const [flags] = useState<FeatureFlag[]>([
    {
      id: '1',
      name: 'New Dashboard',
      key: 'feature_new_dashboard',
      description: 'Enhanced dashboard with real-time metrics',
      enabled: true,
      scope: 'GLOBAL',
      rolloutPercentage: 100,
      createdAt: '2026-08-15',
    },
    {
      id: '2',
      name: 'Beta Support Cases',
      key: 'feature_support_cases',
      description: 'Support ticket management system',
      enabled: true,
      scope: 'PLAN',
      rolloutPercentage: 75,
      createdAt: '2026-08-20',
    },
    {
      id: '3',
      name: 'Advanced Analytics',
      key: 'feature_advanced_analytics',
      description: 'Predictive analytics for revenue forecasting',
      enabled: false,
      scope: 'TENANT',
      rolloutPercentage: 0,
      createdAt: '2026-08-25',
    },
  ]);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Feature Flags</h1>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Key</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Scope</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Rollout</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {flags.map((flag) => (
              <tr key={flag.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium">{flag.name}</td>
                <td className="px-6 py-4 text-sm text-gray-600 font-mono text-xs">{flag.key}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                    {flag.scope}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">{flag.rolloutPercentage}%</td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      flag.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {flag.enabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
