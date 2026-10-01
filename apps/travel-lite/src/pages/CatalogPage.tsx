import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { ErrorNote, StatusBadge } from '../ui';

interface CatalogItem {
  id: string;
  name: string;
  active: boolean;
  type?: string;
  direction?: string;
  sort_order?: number;
  initial_balance?: number;
}

type ExtraKind = 'account' | 'category' | 'method' | 'none';

interface SectionProps {
  path: string;
  title: string;
  extra: ExtraKind;
}

function CatalogSection({ path, title, extra }: SectionProps) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('CASH');
  const [direction, setDirection] = useState('IN');
  const [sortOrder, setSortOrder] = useState('0');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api<{ items: CatalogItem[] }>(path);
      setItems(response.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar');
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  function startCreate(): void {
    setEditingId(null);
    setName('');
    setType('CASH');
    setDirection('IN');
    setSortOrder('0');
  }

  function startEdit(item: CatalogItem): void {
    setEditingId(item.id);
    setName(item.name);
    setType(item.type ?? 'CASH');
    setDirection(item.direction ?? 'IN');
    setSortOrder(String(item.sort_order ?? 0));
  }

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const payload: Record<string, unknown> = { name: name.trim() };
    if (extra === 'account') payload.type = type;
    if (extra === 'category') payload.direction = direction;
    if (extra === 'method') payload.sort_order = Number(sortOrder);
    try {
      if (editingId) {
        await api(`${path}/${editingId}`, { method: 'PATCH', body: payload });
      } else {
        await api(path, { method: 'POST', body: payload });
      }
      startCreate();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar');
    }
  }

  async function toggleActive(item: CatalogItem): Promise<void> {
    try {
      await api(`${path}/${item.id}`, {
        method: 'PATCH',
        body: { active: !item.active },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar');
    }
  }

  return (
    <section>
      <h2>{title}</h2>
      <ErrorNote error={error} />
      <form className="lite-form" onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span>Nome *</span>
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        {extra === 'account' ? (
          <label className="field">
            <span>Tipo</span>
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="BANK">Banco</option>
              <option value="CASH">Caixa</option>
              <option value="WALLET">Carteira</option>
            </select>
          </label>
        ) : null}
        {extra === 'category' ? (
          <label className="field">
            <span>Direção</span>
            <select value={direction} onChange={(event) => setDirection(event.target.value)}>
              <option value="IN">Entrada</option>
              <option value="OUT">Saída</option>
            </select>
          </label>
        ) : null}
        {extra === 'method' ? (
          <label className="field">
            <span>Ordem</span>
            <input
              type="number"
              min="0"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
            />
          </label>
        ) : null}
        <div className="form-actions">
          {editingId ? (
            <button type="button" className="btn" onClick={startCreate}>
              Cancelar edição
            </button>
          ) : null}
          <button type="submit" className="btn btn-primary">
            {editingId ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
      </form>
      <div className="lite-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              {extra === 'account' ? <th>Tipo</th> : null}
              {extra === 'account' ? <th className="num">Saldo inicial</th> : null}
              {extra === 'category' ? <th>Direção</th> : null}
              {extra === 'method' ? <th className="num">Ordem</th> : null}
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                {extra === 'account' ? <td>{item.type}</td> : null}
                {extra === 'account' ? (
                  <td className="num">
                    {(item.initial_balance ?? 0).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </td>
                ) : null}
                {extra === 'category' ? <td>{item.direction}</td> : null}
                {extra === 'method' ? <td className="num">{item.sort_order}</td> : null}
                <td>
                  <StatusBadge status={item.active ? 'ACTIVE' : 'INACTIVE'} />
                </td>
                <td>
                  <div className="row-actions">
                    <button type="button" className="btn btn-small" onClick={() => startEdit(item)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => void toggleActive(item)}
                    >
                      {item.active ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? <p className="lite-empty">Nenhum registro.</p> : null}
      </div>
    </section>
  );
}

const SECTIONS: Array<SectionProps & { id: string }> = [
  { id: 'sale-categories', path: '/categories', title: 'Categorias de venda', extra: 'none' },
  {
    id: 'accounts',
    path: '/financial-accounts',
    title: 'Contas financeiras',
    extra: 'account',
  },
  {
    id: 'financial-categories',
    path: '/financial-categories',
    title: 'Categorias financeiras',
    extra: 'category',
  },
  {
    id: 'payment-methods',
    path: '/payment-methods',
    title: 'Formas de pagamento',
    extra: 'method',
  },
];

export function CatalogPage() {
  const [tab, setTab] = useState(SECTIONS[0]!.id);

  const current = SECTIONS.find((section) => section.id === tab) ?? SECTIONS[0]!;

  return (
    <>
      <h1>Cadastros</h1>
      <div className="lite-tabs">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className={tab === section.id ? 'lite-tab active' : 'lite-tab'}
            onClick={() => setTab(section.id)}
          >
            {section.title}
          </button>
        ))}
      </div>
      <CatalogSection
        key={current.id}
        path={current.path}
        title={current.title}
        extra={current.extra}
      />
    </>
  );
}
