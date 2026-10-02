import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { EmptyState, ErrorNote, StatusBadge, SuccessNote } from '../ui';

interface CatalogItem {
  id: string;
  name: string;
  active: boolean;
  type?: string;
  direction?: string;
  sort_order?: number;
  initial_balance?: number;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  status?: string;
}

type ExtraKind = 'account' | 'category' | 'method' | 'party' | 'none';

interface SectionProps {
  path: string;
  title: string;
  extra: ExtraKind;
}

function CatalogSection({ path, title, extra }: SectionProps) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState(() => defaultType(extra));
  const [direction, setDirection] = useState('IN');
  const [sortOrder, setSortOrder] = useState('0');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    setType(defaultType(extra));
    setDirection('IN');
    setSortOrder('0');
    setDocument('');
    setPhone('');
    setEmail('');
    setNotes('');
    setNotice(null);
  }

  function startEdit(item: CatalogItem): void {
    setEditingId(item.id);
    setName(item.name);
    setType(item.type ?? defaultType(extra));
    setDirection(item.direction ?? 'IN');
    setSortOrder(String(item.sort_order ?? 0));
    setDocument(item.document ?? '');
    setPhone(item.phone ?? '');
    setEmail(item.email ?? '');
    setNotes(item.notes ?? '');
    setNotice(null);
  }

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const payload: Record<string, unknown> = { name: name.trim() };
    if (extra === 'account') payload.type = type;
    if (extra === 'category') payload.direction = direction;
    if (extra === 'method') payload.sort_order = Number(sortOrder);
    if (extra === 'party') {
      payload.type = type;
      payload.document = document.trim();
      payload.phone = phone.trim();
      payload.email = email.trim();
      payload.notes = notes.trim();
    }
    try {
      if (editingId) {
        await api(`${path}/${editingId}`, { method: 'PATCH', body: payload });
      } else {
        await api(path, { method: 'POST', body: payload });
      }
      startCreate();
      setNotice('Cadastro salvo.');
      await load();
    } catch (err) {
      setNotice(null);
      setError(err instanceof Error ? err.message : 'Falha ao salvar');
    }
  }

  async function toggleActive(item: CatalogItem): Promise<void> {
    const deactivating = extra === 'party' ? isActive(item) : item.active;
    if (deactivating && !window.confirm(`Desativar "${item.name}"?`)) return;
    try {
      await api(`${path}/${item.id}`, {
        method: 'PATCH',
        body: extra === 'party'
          ? { status: isActive(item) ? 'INACTIVE' : 'ACTIVE' }
          : { active: !item.active },
      });
      setNotice(deactivating ? 'Item desativado.' : 'Item ativado.');
      await load();
    } catch (err) {
      setNotice(null);
      setError(err instanceof Error ? err.message : 'Falha ao atualizar');
    }
  }

  return (
    <section>
      <h2>{title}</h2>
      <ErrorNote error={error} />
      <SuccessNote success={notice} />
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
        {extra === 'party' ? (
          <>
            <label className="field">
              <span>Tipo</span>
              <select value={type} onChange={(event) => setType(event.target.value)}>
                <option value="SUPPLIER">Fornecedor</option>
                <option value="SERVICE_PROVIDER">Prestador</option>
                <option value="OTHER">Outro favorecido</option>
              </select>
            </label>
            <label className="field">
              <span>Documento</span>
              <input value={document} onChange={(event) => setDocument(event.target.value)} />
            </label>
            <label className="field">
              <span>Telefone</span>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} />
            </label>
            <label className="field">
              <span>E-mail</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="field field-wide">
              <span>Observações</span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
            </label>
          </>
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
              {extra === 'party' ? <th>Tipo</th> : null}
              {extra === 'party' ? <th>Documento</th> : null}
              {extra === 'party' ? <th>Contato</th> : null}
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
                {extra === 'party' ? <td>{partyTypeLabel(item.type)}</td> : null}
                {extra === 'party' ? <td>{item.document || '—'}</td> : null}
                {extra === 'party' ? (
                  <td>
                    {[item.phone, item.email].filter(Boolean).join(' · ') || '—'}
                  </td>
                ) : null}
                <td>
                  <StatusBadge status={item.status ?? (item.active ? 'ACTIVE' : 'INACTIVE')} />
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
                      {isActive(item) ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? (
          <EmptyState message="Nenhum registro.">
            <Link className="btn btn-small btn-ghost" to="/ajuda#primeiros-passos">
              Ver primeiros passos na ajuda
            </Link>
          </EmptyState>
        ) : null}
      </div>
    </section>
  );
}

function isActive(item: CatalogItem): boolean {
  return item.status ? item.status === 'ACTIVE' : item.active;
}

function defaultType(extra: ExtraKind): string {
  return extra === 'party' ? 'SUPPLIER' : 'CASH';
}

function partyTypeLabel(type?: string): string {
  if (type === 'SERVICE_PROVIDER') return 'Prestador';
  if (type === 'OTHER') return 'Outro';
  return 'Fornecedor';
}

const SECTIONS: Array<SectionProps & { id: string }> = [
  { id: 'sale-categories', path: '/categories', title: 'Categorias de venda', extra: 'none' },
  {
    id: 'financial-parties',
    path: '/financial-parties',
    title: 'Favorecidos financeiros',
    extra: 'party',
  },
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
