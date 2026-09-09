import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CreativeTemplate } from '../../types/offerGrowth';
import {
  createBlankTemplate,
  deleteTemplate,
  duplicateTemplate,
  listTemplates,
} from '../../lib/localTemplateStore';
import { Button } from '../../components/ui/button';

export function TemplatesPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<CreativeTemplate[]>(() => listTemplates());
  const [newName, setNewName] = useState('');

  function refresh() {
    setTemplates(listTemplates());
  }

  function handleCreate() {
    const name = newName.trim() || `Novo modelo ${templates.length + 1}`;
    const template = createBlankTemplate(name);
    setNewName('');
    void navigate(`/offer-growth/studio?templateId=${encodeURIComponent(template.id)}`);
  }

  function handleDuplicate(id: string) {
    duplicateTemplate(id);
    refresh();
  }

  function handleDelete(id: string) {
    deleteTemplate(id);
    refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ofertas e crescimento</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Modelos de criativo</h1>
        <p className="mt-1 text-sm text-slate-500">
          Modelos reutilizáveis de carrossel/post que alimentam o Estúdio criativo. Guardados
          localmente neste navegador (ainda não há persistência compartilhada no backend).
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="new-template-name" className="text-sm font-medium text-slate-700">
            Nome do novo modelo
          </label>
          <input
            id="new-template-name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Carrossel promoção verão"
          />
        </div>
        <Button onClick={handleCreate}>Criar modelo</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <article key={template.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">{template.name}</h2>
            <p className="text-xs text-slate-500">
              {template.pages.length} página(s) · {template.bindings.length} vínculo(s)
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Atualizado em {new Date(template.updatedAt).toLocaleString('pt-BR')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() =>
                  void navigate(`/offer-growth/studio?templateId=${encodeURIComponent(template.id)}`)
                }
              >
                Abrir editor
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleDuplicate(template.id)}>
                Duplicar
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleDelete(template.id)}>
                Excluir
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
