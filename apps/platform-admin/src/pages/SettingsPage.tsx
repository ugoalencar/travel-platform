import { useEffect, useState } from 'react';

interface PlatformSettings {
  id: string;
  enableTrials: boolean;
  trialDurationDays: number;
  autoSuspendPastDue: boolean;
  suspendAfterDaysPastDue: number;
  requireMfaForPlatform: boolean;
  maxStorageGbDefault: number;
  maxUsersDefault: number;
  maxCustomersDefault: number;
  updatedAt: string;
}

export function SettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<PlatformSettings>>({});

  useEffect(() => {
    void fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      const response = await fetch('/api/platform/settings');
      if (!response.ok) {
        if (response.status === 404) {
          // Create default settings
          await createDefaultSettings();
          return;
        }
        throw new Error('Nao foi possivel carregar as configuracoes');
      }
      const data = (await response.json()) as { settings: PlatformSettings };
      setSettings(data.settings);
      setFormData(data.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel carregar as configuracoes');
    } finally {
      setLoading(false);
    }
  }

  async function createDefaultSettings() {
    try {
      const defaultSettings = {
        enableTrials: true,
        trialDurationDays: 14,
        autoSuspendPastDue: true,
        suspendAfterDaysPastDue: 30,
        requireMfaForPlatform: false,
        maxStorageGbDefault: 100,
        maxUsersDefault: 10,
        maxCustomersDefault: 100,
      };

      const response = await fetch('/api/platform/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaultSettings),
      });

      if (!response.ok) throw new Error('Nao foi possivel criar as configuracoes');
      const data = (await response.json()) as { settings: PlatformSettings };
      setSettings(data.settings);
      setFormData(data.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel criar as configuracoes');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await fetch('/api/platform/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Nao foi possivel salvar as configuracoes');
      const data = (await response.json()) as { settings: PlatformSettings };
      setSettings(data.settings);
      setFormData(data.settings);
      setSuccess('Configuracoes salvas com sucesso!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel salvar as configuracoes');
    } finally {
      setSaving(false);
    }
  }

  function handleChange(field: keyof PlatformSettings, value: PlatformSettings[keyof PlatformSettings]) {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  if (loading) {
    return <div className="text-center py-8">Carregando configuracoes...</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Configuracoes da Plataforma</h1>

      {error && (
        <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          {success}
        </div>
      )}

      <form onSubmit={(event) => void handleSubmit(event)} className="bg-white rounded-lg shadow p-8 max-w-2xl space-y-6">
        {/* Trial Settings */}
        <div className="border-b pb-6">
          <h2 className="text-lg font-semibold mb-4">Configuracoes de teste</h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Ativar testes gratuitos</label>
              <input
                type="checkbox"
                checked={formData.enableTrials || false}
                onChange={(e) => handleChange('enableTrials', e.target.checked)}
                className="w-4 h-4 text-blue-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duracao do teste (dias)
              </label>
              <input
                type="number"
                min="1"
                max="90"
                value={formData.trialDurationDays || 14}
                onChange={(e) => handleChange('trialDurationDays', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Billing Settings */}
        <div className="border-b pb-6">
          <h2 className="text-lg font-semibold mb-4">Cobranca e recebimentos</h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Suspender vencidos automaticamente</label>
              <input
                type="checkbox"
                checked={formData.autoSuspendPastDue || false}
                onChange={(e) => handleChange('autoSuspendPastDue', e.target.checked)}
                className="w-4 h-4 text-blue-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dias vencidos antes da suspensao
              </label>
              <input
                type="number"
                min="1"
                max="90"
                value={formData.suspendAfterDaysPastDue || 30}
                onChange={(e) => handleChange('suspendAfterDaysPastDue', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Security Settings */}
        <div className="border-b pb-6">
          <h2 className="text-lg font-semibold mb-4">Seguranca</h2>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Exigir MFA para administradores da plataforma</label>
              <input
                type="checkbox"
                checked={formData.requireMfaForPlatform || false}
                onChange={(e) => handleChange('requireMfaForPlatform', e.target.checked)}
                className="w-4 h-4 text-blue-600"
              />
            </div>
          </div>
        </div>

        {/* Default Limits */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Limites padrao de plano</h2>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Armazenamento (GB)
              </label>
              <input
                type="number"
                min="1"
                value={formData.maxStorageGbDefault || 100}
                onChange={(e) => handleChange('maxStorageGbDefault', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Maximo de usuarios</label>
              <input
                type="number"
                min="1"
                value={formData.maxUsersDefault || 10}
                onChange={(e) => handleChange('maxUsersDefault', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Maximo de clientes</label>
              <input
                type="number"
                min="1"
                value={formData.maxCustomersDefault || 100}
                onChange={(e) => handleChange('maxCustomersDefault', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {saving ? 'Salvando...' : 'Salvar Configuracoes'}
          </button>
          <button
            type="button"
            onClick={() => setFormData(settings || {})}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
