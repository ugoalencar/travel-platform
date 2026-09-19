import { useEffect, useState } from 'react';

interface LandingSection {
  id: string;
  pageId: string;
  type: string;
  enabled: boolean;
  title: string | null;
  content: string | null;
  sortOrder: number;
}

// FAQ entries are landing sections of type FAQ (docs/product/
// PLATFORM_ADMIN_COMERCIAL_PARCERIAS.md) -- no separate FAQ table/route;
// this page is a filtered view + form over the same /platform/landing
// endpoints the Landing CMS page uses, one entry per question.
export function FAQPage() {
  const [pageId, setPageId] = useState<string | null>(null);
  const [items, setItems] = useState<LandingSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const response = await fetch('/api/platform/landing');
      if (!response.ok) throw new Error('Não foi possível carregar o FAQ');
      const data = (await response.json()) as { page: { id: string }; sections: LandingSection[] };
      setPageId(data.page.id);
      setItems(data.sections.filter((s) => s.type === 'FAQ').sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }

  async function addFaq() {
    if (!pageId || !question.trim()) return;
    const response = await fetch(`/api/platform/landing/${pageId}/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'FAQ',
        enabled: true,
        title: question,
        content: answer,
        sortOrder: items.length,
      }),
    });
    if (!response.ok) {
      setError('Não foi possível criar a pergunta');
      return;
    }
    setQuestion('');
    setAnswer('');
    await load();
  }

  async function removeFaq(id: string) {
    await fetch(`/api/platform/landing/sections/${id}`, { method: 'DELETE' });
    await load();
  }

  async function toggleFaq(item: LandingSection) {
    await fetch(`/api/platform/landing/sections/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !item.enabled }),
    });
    await load();
  }

  if (loading) return <div className="text-center py-8">Carregando...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">FAQ da Landing</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>
      )}

      <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-3">
        <input
          placeholder="Pergunta"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm"
        />
        <textarea
          placeholder="Resposta"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm"
          rows={3}
        />
        <button
          onClick={() => void addFaq()}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium"
        >
          + Pergunta
        </button>
      </div>

      <div className="bg-white rounded-lg shadow divide-y">
        {items.map((item) => (
          <div key={item.id} className="p-4 flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-gray-600 mt-1">{item.content}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => void toggleFaq(item)}
                className={`px-2 py-1 rounded text-xs font-medium ${
                  item.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {item.enabled ? 'Ativa' : 'Inativa'}
              </button>
              <button
                onClick={() => void removeFaq(item.id)}
                className="text-red-600 hover:underline text-xs"
              >
                Remover
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="p-6 text-center text-gray-500">Nenhuma pergunta criada.</div>}
      </div>
    </div>
  );
}
