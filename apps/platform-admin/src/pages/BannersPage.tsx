import { useEffect, useState } from 'react';

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  placement: 'LANDING' | 'PLATFORM_ADMIN';
  startsAt: string | null;
  endsAt: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED';
  sortOrder: number;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  ACTIVE: 'bg-green-100 text-green-800',
  PAUSED: 'bg-yellow-100 text-yellow-800',
  EXPIRED: 'bg-red-100 text-red-800',
};

const emptyForm: {
  title: string;
  subtitle: string;
  imageUrl: string;
  ctaLabel: string;
  ctaUrl: string;
  placement: Banner['placement'];
  status: Banner['status'];
} = {
  title: '',
  subtitle: '',
  imageUrl: '',
  ctaLabel: '',
  ctaUrl: '',
  placement: 'LANDING',
  status: 'DRAFT',
};

export function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const response = await fetch('/api/platform/banners');
      if (!response.ok) throw new Error('Não foi possível carregar os banners');
      const data = (await response.json()) as { banners: Banner[] };
      setBanners(data.banners);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }

  async function createBanner() {
    setError(null);
    const response = await fetch('/api/platform/banners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Não foi possível criar o banner');
      return;
    }
    setForm(emptyForm);
    setShowForm(false);
    await load();
  }

  async function updateStatus(banner: Banner, status: string) {
    await fetch(`/api/platform/banners/${banner.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await load();
  }

  async function removeBanner(id: string) {
    await fetch(`/api/platform/banners/${id}`, { method: 'DELETE' });
    await load();
  }

  if (loading) return <div className="text-center py-8">Carregando...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Banners / Campanhas</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          {showForm ? 'Cancelar' : '+ Novo banner'}
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>
      )}

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-3">
          <input
            placeholder="Título"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <input
            placeholder="Subtítulo"
            value={form.subtitle}
            onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <input
            placeholder="Imagem (URL)"
            value={form.imageUrl}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Texto do CTA"
              value={form.ctaLabel}
              onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
            <input
              placeholder="URL do CTA"
              value={form.ctaUrl}
              onChange={(e) => setForm({ ...form, ctaUrl: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.placement}
              onChange={(e) => setForm({ ...form, placement: e.target.value as Banner['placement'] })}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="LANDING">LANDING</option>
              <option value="PLATFORM_ADMIN">PLATFORM_ADMIN</option>
            </select>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as Banner['status'] })}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="DRAFT">DRAFT</option>
              <option value="ACTIVE">ACTIVE</option>
            </select>
          </div>
          <button
            onClick={() => void createBanner()}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium"
          >
            Criar banner
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 border-b">
              <th className="py-2 px-4">Título</th>
              <th className="py-2 px-4">Placement</th>
              <th className="py-2 px-4">Status</th>
              <th className="py-2 px-4">Período</th>
              <th className="py-2 px-4" />
            </tr>
          </thead>
          <tbody>
            {banners.map((b) => (
              <tr key={b.id} className="border-b">
                <td className="py-2 px-4 font-medium">{b.title}</td>
                <td className="py-2 px-4">{b.placement}</td>
                <td className="py-2 px-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[b.status]}`}>
                    {b.status}
                  </span>
                </td>
                <td className="py-2 px-4 text-xs text-gray-600">
                  {b.startsAt ? new Date(b.startsAt).toLocaleDateString('pt-BR') : '—'} até{' '}
                  {b.endsAt ? new Date(b.endsAt).toLocaleDateString('pt-BR') : '—'}
                </td>
                <td className="py-2 px-4 space-x-2">
                  {b.status !== 'ACTIVE' && (
                    <button
                      onClick={() => void updateStatus(b, 'ACTIVE')}
                      className="text-green-700 hover:underline text-xs"
                    >
                      Ativar
                    </button>
                  )}
                  {b.status === 'ACTIVE' && (
                    <button
                      onClick={() => void updateStatus(b, 'PAUSED')}
                      className="text-yellow-700 hover:underline text-xs"
                    >
                      Pausar
                    </button>
                  )}
                  <button
                    onClick={() => void removeBanner(b.id)}
                    className="text-red-600 hover:underline text-xs"
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
            {banners.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-500">
                  Nenhum banner criado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
