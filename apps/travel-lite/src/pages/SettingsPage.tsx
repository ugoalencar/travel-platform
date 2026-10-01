import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useCan } from '../auth';
import { ErrorNote, StatusBadge } from '../ui';

/**
 * Settings > Users and permissions. The API enforces every rule (no
 * self-promotion, no role above your own, master-only permissions); this
 * page only hides what the API would refuse.
 */
interface Role {
  key: string;
  name: string;
  grants_all: boolean;
  assignable: boolean;
  permissions: string[];
}

interface PermissionInfo {
  key: string;
  description: string;
  master_only: boolean;
  grantable: boolean;
}

interface Override {
  permission: string;
  effect: 'GRANT' | 'REVOKE';
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  seller_id: string | null;
  seller_name: string | null;
  is_self: boolean;
  overrides: Override[];
}

interface Catalog {
  roles: Role[];
  permissions: PermissionInfo[];
}

interface FormState {
  name: string;
  email: string;
  password: string;
  role: string;
  seller_id: string;
  status: string;
}

const EMPTY_FORM: FormState = { name: '', email: '', password: '', role: 'SELLER', seller_id: '', status: 'ACTIVE' };

function PermissionEditor({
  user,
  catalog,
  onSaved,
  onClose,
}: {
  user: User;
  catalog: Catalog;
  onSaved: () => void;
  onClose: () => void;
}) {
  const role = catalog.roles.find((r) => r.key === user.role);
  const defaults = new Set(role?.permissions ?? []);
  const [overrides, setOverrides] = useState<Override[]>(user.overrides);
  const [error, setError] = useState<string | null>(null);
  const locked = user.is_self || Boolean(role?.grants_all);

  const effective = (key: string) => {
    const override = overrides.find((o) => o.permission === key);
    return override ? override.effect === 'GRANT' : defaults.has(key);
  };

  function toggle(key: string, checked: boolean) {
    const rest = overrides.filter((o) => o.permission !== key);
    // Only differences from the role default are stored.
    setOverrides(checked === defaults.has(key) ? rest : [...rest, { permission: key, effect: checked ? 'GRANT' : 'REVOKE' }]);
  }

  async function save() {
    try {
      await api(`/users/${user.id}/permissions`, { method: 'PUT', body: { overrides } });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar permissões');
    }
  }

  return (
    <section className="lite-card">
      <h2>Permissões de {user.name}</h2>
      <p className="lite-muted">
        Perfil {role?.name ?? user.role}.{' '}
        {role?.grants_all
          ? 'Este perfil tem todas as permissões.'
          : user.is_self
            ? 'Você não pode alterar as próprias permissões.'
            : 'Marcações diferentes do padrão do perfil ficam registradas como exceção.'}
      </p>
      <ErrorNote error={error} />
      <div className="permission-grid">
        {catalog.permissions.map((permission) => {
          const isOverride = overrides.some((o) => o.permission === permission.key);
          return (
            <label key={permission.key} title={permission.key}>
              <input
                type="checkbox"
                checked={role?.grants_all ? true : effective(permission.key)}
                disabled={locked || !permission.grantable}
                onChange={(event) => toggle(permission.key, event.target.checked)}
              />
              <span>
                {permission.description}
                {isOverride ? <strong> (exceção)</strong> : null}
                {permission.master_only ? <span className="lite-muted"> · só MASTER concede</span> : null}
              </span>
            </label>
          );
        })}
      </div>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onClose}>
          Fechar
        </button>
        {!locked ? (
          <button type="button" className="btn btn-primary" onClick={() => void save()}>
            Salvar permissões
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function SettingsPage() {
  const canManageUsers = useCan('users.manage');
  const canManagePermissions = useCan('permissions.manage');
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [sellers, setSellers] = useState<Array<{ id: string; name: string; user_id: string | null }>>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [permissionsFor, setPermissionsFor] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [catalogResponse, usersResponse] = await Promise.all([
        api<Catalog>('/access/catalog'),
        api<{ items: User[] }>('/users'),
      ]);
      setCatalog(catalogResponse);
      setUsers(usersResponse.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar');
    }
    api<{ items: Array<{ id: string; name: string; user_id: string | null }> }>('/sellers?pageSize=100')
      .then((response) => setSellers(response.items))
      .catch(() => setSellers([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const roleName = (key: string) => catalog?.roles.find((r) => r.key === key)?.name ?? key;
  const assignableRoles = catalog?.roles.filter((r) => r.assignable) ?? [];

  function startCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, role: assignableRoles.some((r) => r.key === 'SELLER') ? 'SELLER' : (assignableRoles[0]?.key ?? '') });
    setFormOpen(true);
  }

  function startEdit(user: User) {
    setEditingId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      seller_id: user.seller_id ?? '',
      status: user.status,
    });
    setFormOpen(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const editing = users.find((u) => u.id === editingId);
    const body: Record<string, unknown> = { name: form.name.trim(), email: form.email.trim() };
    if (form.password) body.password = form.password;
    if (!editing || !editing.is_self) {
      if (!editing || editing.role !== form.role) body.role = form.role;
      if (editing && editing.status !== form.status) body.status = form.status;
    }
    if (!editing || (editing.seller_id ?? '') !== form.seller_id) body.seller_id = form.seller_id || null;
    try {
      if (editing) {
        await api(`/users/${editing.id}`, { method: 'PATCH', body });
      } else {
        await api('/users', { method: 'POST', body });
      }
      setFormOpen(false);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar');
    }
  }

  async function toggleStatus(user: User) {
    try {
      await api(`/users/${user.id}`, {
        method: 'PATCH',
        body: { status: user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar');
    }
  }

  const editingSelf = users.find((u) => u.id === editingId)?.is_self ?? false;
  const freeSellers = sellers.filter((s) => !s.user_id || s.user_id === editingId);

  return (
    <>
      <h1>Configurações · Usuários e permissões</h1>
      <div className="lite-toolbar">
        <span className="lite-muted">
          Usuário é o login; vendedor é quem vende. Um vendedor pode existir sem login, e um usuário
          administrativo pode não ser vendedor.
        </span>
        <span className="spacer" />
        {canManageUsers ? (
          <button type="button" className="btn btn-primary" onClick={startCreate}>
            Novo usuário
          </button>
        ) : null}
      </div>
      <ErrorNote error={error} />
      {formOpen ? (
        <form className="lite-form" onSubmit={(event) => void onSubmit(event)}>
          <label className="field">
            <span>Nome *</span>
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
          <label className="field">
            <span>E-mail (login) *</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>{editingId ? 'Nova senha (opcional)' : 'Senha *'}</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required={!editingId}
            />
          </label>
          <label className="field">
            <span>Perfil</span>
            <select
              value={form.role}
              disabled={editingSelf}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
            >
              {assignableRoles.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Vendedor vinculado</span>
            <select value={form.seller_id} onChange={(event) => setForm({ ...form, seller_id: event.target.value })}>
              <option value="">Nenhum (usuário administrativo)</option>
              {freeSellers.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                </option>
              ))}
            </select>
          </label>
          {editingId && !editingSelf ? (
            <label className="field">
              <span>Status</span>
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option value="ACTIVE">Ativo</option>
                <option value="INACTIVE">Inativo</option>
              </select>
            </label>
          ) : null}
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setFormOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              {editingId ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      ) : null}
      {permissionsFor && catalog ? (
        <PermissionEditor
          key={permissionsFor.id}
          user={permissionsFor}
          catalog={catalog}
          onClose={() => setPermissionsFor(null)}
          onSaved={() => {
            setPermissionsFor(null);
            void load();
          }}
        />
      ) : null}
      <div className="lite-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Vendedor</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  {user.name}
                  {user.is_self ? <span className="lite-muted"> (você)</span> : null}
                </td>
                <td>{user.email}</td>
                <td>
                  {roleName(user.role)}
                  {user.overrides.length > 0 ? <span className="lite-muted"> +{user.overrides.length} exceção(ões)</span> : null}
                </td>
                <td>{user.seller_name ?? '—'}</td>
                <td>
                  <StatusBadge status={user.status} />
                </td>
                <td>
                  <div className="row-actions">
                    {canManageUsers ? (
                      <button type="button" className="btn btn-small" onClick={() => startEdit(user)}>
                        Editar
                      </button>
                    ) : null}
                    {canManagePermissions || canManageUsers ? (
                      <button type="button" className="btn btn-small" onClick={() => setPermissionsFor(user)}>
                        Permissões
                      </button>
                    ) : null}
                    {canManageUsers && !user.is_self ? (
                      <button type="button" className="btn btn-small" onClick={() => void toggleStatus(user)}>
                        {user.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
