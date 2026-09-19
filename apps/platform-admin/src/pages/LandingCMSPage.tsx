import { useEffect, useState } from 'react';

interface LandingPage {
  id: string;
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroImageUrl: string | null;
  ctaPrimaryLabel: string | null;
  ctaPrimaryUrl: string | null;
  ctaSecondaryLabel: string | null;
  ctaSecondaryUrl: string | null;
  footerContent: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  lastPublishedAt: string | null;
}

interface LandingSection {
  id: string;
  type: string;
  enabled: boolean;
  title: string | null;
  subtitle: string | null;
  content: string | null;
  sortOrder: number;
}

interface Publication {
  id: string;
  publishedAt: string;
}

const SECTION_TYPES = [
  'HERO', 'FEATURES', 'WORKFLOW', 'CUSTOMER_PORTAL', 'SECURITY',
  'PARTNERS', 'TESTIMONIALS', 'FAQ', 'CTA',
];

export function LandingCMSPage() {
  const [page, setPage] = useState<LandingPage | null>(null);
  const [sections, setSections] = useState<LandingSection[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newSectionType, setNewSectionType] = useState('FEATURES');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const response = await fetch('/api/platform/landing');
      if (!response.ok) throw new Error('Não foi possível carregar a landing');
      const data = (await response.json()) as {
        page: LandingPage;
        sections: LandingSection[];
        publications: Publication[];
      };
      setPage(data.page);
      setSections(data.sections);
      setPublications(data.publications);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }

  async function saveDraft(field: keyof LandingPage, value: string) {
    if (!page) return;
    const response = await fetch(`/api/platform/landing/${page.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    if (!response.ok) {
      setError('Não foi possível salvar o rascunho');
      return;
    }
    setMessage('Rascunho salvo.');
    await load();
  }

  async function addSection() {
    if (!page) return;
    const response = await fetch(`/api/platform/landing/${page.id}/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: newSectionType, enabled: true, sortOrder: sections.length }),
    });
    if (!response.ok) {
      setError('Não foi possível criar a seção');
      return;
    }
    await load();
  }

  async function toggleSection(section: LandingSection) {
    await fetch(`/api/platform/landing/sections/${section.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !section.enabled }),
    });
    await load();
  }

  async function deleteSection(id: string) {
    await fetch(`/api/platform/landing/sections/${id}`, { method: 'DELETE' });
    await load();
  }

  async function publish() {
    if (!page) return;
    const response = await fetch(`/api/platform/landing/${page.id}/publish`, { method: 'POST' });
    if (!response.ok) {
      setError('Não foi possível publicar');
      return;
    }
    setMessage('Landing publicada com sucesso.');
    await load();
  }

  if (loading) return <div className="text-center py-8">Carregando...</div>;
  if (!page) return <div className="text-center py-8">Landing não encontrada.</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Landing Page (CMS)</h1>
        <div className="flex items-center gap-3">
          <span
            className={`px-2 py-1 rounded text-sm font-medium ${
              page.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}
          >
            {page.status === 'PUBLISHED' ? 'Publicado' : 'Rascunho'}
          </span>
          <a
            href="/preview/landing"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            Preview
          </a>
          <button
            onClick={() => void publish()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Publicar
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>
      )}
      {message && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          {message}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
        <h2 className="text-lg font-bold">Hero e CTAs</h2>
        <FieldEditor label="Hero title" value={page.heroTitle} onSave={(v) => void saveDraft('heroTitle', v)} />
        <FieldEditor
          label="Hero subtitle"
          value={page.heroSubtitle}
          onSave={(v) => void saveDraft('heroSubtitle', v)}
        />
        <FieldEditor
          label="Hero image URL"
          value={page.heroImageUrl}
          onSave={(v) => void saveDraft('heroImageUrl', v)}
        />
        <div className="grid grid-cols-2 gap-4">
          <FieldEditor
            label="CTA principal — texto"
            value={page.ctaPrimaryLabel}
            onSave={(v) => void saveDraft('ctaPrimaryLabel', v)}
          />
          <FieldEditor
            label="CTA principal — URL"
            value={page.ctaPrimaryUrl}
            onSave={(v) => void saveDraft('ctaPrimaryUrl', v)}
          />
          <FieldEditor
            label="CTA secundário — texto"
            value={page.ctaSecondaryLabel}
            onSave={(v) => void saveDraft('ctaSecondaryLabel', v)}
          />
          <FieldEditor
            label="CTA secundário — URL"
            value={page.ctaSecondaryUrl}
            onSave={(v) => void saveDraft('ctaSecondaryUrl', v)}
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
        <h2 className="text-lg font-bold">SEO</h2>
        <FieldEditor label="SEO title" value={page.seoTitle} onSave={(v) => void saveDraft('seoTitle', v)} />
        <FieldEditor
          label="SEO description"
          value={page.seoDescription}
          onSave={(v) => void saveDraft('seoDescription', v)}
        />
        <FieldEditor
          label="Open Graph image URL"
          value={page.ogImageUrl}
          onSave={(v) => void saveDraft('ogImageUrl', v)}
        />
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
        <h2 className="text-lg font-bold">Footer</h2>
        <FieldEditor
          label="Conteúdo do footer"
          value={page.footerContent}
          onSave={(v) => void saveDraft('footerContent', v)}
        />
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Seções</h2>
          <div className="flex items-center gap-2">
            <select
              value={newSectionType}
              onChange={(e) => setNewSectionType(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              {SECTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              onClick={() => void addSection()}
              className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium"
            >
              + Seção
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 border-b">
              <th className="py-2">Tipo</th>
              <th className="py-2">Título</th>
              <th className="py-2">Ordem</th>
              <th className="py-2">Ativa</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <tr key={s.id} className="border-b">
                <td className="py-2 font-medium">{s.type}</td>
                <td className="py-2">{s.title ?? '—'}</td>
                <td className="py-2">{s.sortOrder}</td>
                <td className="py-2">
                  <button
                    onClick={() => void toggleSection(s)}
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      s.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {s.enabled ? 'Habilitada' : 'Desabilitada'}
                  </button>
                </td>
                <td className="py-2">
                  <button
                    onClick={() => void deleteSection(s.id)}
                    className="text-red-600 hover:underline text-xs"
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
            {sections.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-500">
                  Nenhuma seção criada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-bold mb-4">Histórico de publicações</h2>
        <ul className="text-sm space-y-1">
          {publications.map((p) => (
            <li key={p.id} className="text-gray-700">
              {new Date(p.publishedAt).toLocaleString('pt-BR')}
            </li>
          ))}
          {publications.length === 0 && <li className="text-gray-500">Ainda não publicada.</li>}
        </ul>
      </div>
    </div>
  );
}

function FieldEditor({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string | null;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value ?? '');

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1 px-3 py-2 border rounded-lg text-sm"
        />
        <button
          onClick={() => onSave(draft)}
          className="px-3 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          Salvar
        </button>
      </div>
    </div>
  );
}
