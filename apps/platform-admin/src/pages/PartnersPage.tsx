import { useEffect, useState } from 'react';

interface Partner {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  category: string;
  description: string | null;
  websiteUrl: string | null;
  contactName: string | null;
  contactEmail: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
  featured: boolean;
  isPublic: boolean;
  internalNotes: string | null;
}

const CATEGORIES = [
  'TECHNOLOGY', 'PAYMENTS', 'INSURANCE', 'TRAVEL_SERVICES', 'EDUCATION', 'MARKETING', 'OTHER',
];

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-gray-100 text-gray-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
};

const emptyForm = {
  name: '',
  slug: '',
  category: 'TECHNOLOGY',
  description: '',
  websiteUrl: '',
  contactName: '',
  contactEmail: '',
  internalNotes: '',
};

export function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
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
      const response = await fetch('/api/platform/partners');
      if (!response.ok) throw new Error('Não foi possível carregar os parceiros');
      const data = (await response.json()) as { partners: Partner[] };
      setPartners(data.partners);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }

  async function createPartner() {
    setError(null);
    const response = await fetch('/api/platform/partners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Não foi possível criar o parceiro');
      return;
    }
    setForm(emptyForm);
    setShowForm(false);
    await load();
  }

  async function patch(partner: Partner, patchBody: Record<string, unknown>) {
    await fetch(`/api/platform/partners/${partner.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchBody),
    });
    await load();
  }

  if (loading) return <div className="text-center py-8">Carregando...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Parceiros</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          {showForm ? 'Cancelar' : '+ Novo parceiro'}
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>
      )}

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Nome"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
            <input
              placeholder="Slug"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <textarea
            placeholder="Descrição (pública)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <input
            placeholder="Website"
            value={form.websiteUrl}
            onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Contato — nome"
              value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
            <input
              placeholder="Contato — e-mail"
              value={form.contactEmail}
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <textarea
            placeholder="Notas internas (nunca exibidas publicamente)"
            value={form.internalNotes}
            onChange={(e) => setForm({ ...form, internalNotes: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <button
            onClick={() => void createPartner()}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium"
          >
            Criar parceiro
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 border-b">
              <th className="py-2 px-4">Nome</th>
              <th className="py-2 px-4">Categoria</th>
              <th className="py-2 px-4">Status</th>
              <th className="py-2 px-4">Público</th>
              <th className="py-2 px-4">Destaque</th>
              <th className="py-2 px-4" />
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="py-2 px-4 font-medium">{p.name}</td>
                <td className="py-2 px-4">{p.category}</td>
                <td className="py-2 px-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[p.status]}`}>
                    {p.status}
                  </span>
                </td>
                <td className="py-2 px-4">
                  <button
                    onClick={() => void patch(p, { isPublic: !p.isPublic })}
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      p.isPublic ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {p.isPublic ? 'Público' : 'Privado'}
                  </button>
                </td>
                <td className="py-2 px-4">
                  <button
                    onClick={() => void patch(p, { featured: !p.featured })}
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      p.featured ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {p.featured ? 'Sim' : 'Não'}
                  </button>
                </td>
                <td className="py-2 px-4">
                  {p.status !== 'ACTIVE' ? (
                    <button
                      onClick={() => void patch(p, { status: 'ACTIVE' })}
                      className="text-green-700 hover:underline text-xs"
                    >
                      Ativar
                    </button>
                  ) : (
                    <button
                      onClick={() => void patch(p, { status: 'INACTIVE' })}
                      className="text-gray-700 hover:underline text-xs"
                    >
                      Desativar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {partners.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-gray-500">
                  Nenhum parceiro cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
