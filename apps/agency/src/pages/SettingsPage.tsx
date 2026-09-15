import { useEffect, useState } from 'react';
import { Settings, Users, Bell, Shield, AlertCircle, Palette, Building2, Trash2, Mail, Lock, Copy } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { LoadingState } from '../components/ui/loading-state';
import { StatusBadge } from '../components/ui/status-badge';
import { api } from '../lib/api';

interface AgencyProfile {
  id: string;
  name: string;
  /** Server-generated at signup (name + random suffix), never chosen by
   * the user, and required to log back in ("Agência" field on the login
   * form) -- shown here since this is otherwise the only place it's
   * discoverable. */
  slug?: string;
  email?: string;
  phone?: string;
  displayName?: string;
  logoUrl?: string;
  primaryColor?: string;
}

interface Department {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'AGENT' | 'VIEWER';
  joinedAt: string;
}

interface NotificationSettings {
  emailNotifications: boolean;
  proposalUpdates: boolean;
  bookingUpdates: boolean;
  paymentUpdates: boolean;
}

type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED';

interface Invitation {
  id: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'AGENT' | 'VIEWER';
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

interface PermissionRestriction {
  id: string;
  role: 'MANAGER' | 'AGENT' | 'VIEWER';
  resource: string;
  action: string;
  createdAt: string;
}

const RESTRICTABLE_RESOURCE_ACTIONS: Array<{ resource: string; action: string; label: string }> = [
  { resource: 'financial', action: 'view', label: 'Financeiro — Visualizar' },
  { resource: 'employees', action: 'view', label: 'Funcionários — Visualizar' },
  { resource: 'air-services', action: 'create', label: 'Serviços Aéreos — Criar' },
];

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      profile: AgencyProfile;
      team: TeamMember[];
      notifications: NotificationSettings;
      userRole: string;
      departments: Department[];
      invitations: Invitation[];
      restrictions: PermissionRestriction[];
    };

function getRoleColor(role: string): string {
  switch (role) {
    case 'OWNER':
      return 'bg-purple-100 text-purple-900';
    case 'ADMIN':
      return 'bg-red-100 text-red-900';
    case 'MANAGER':
      return 'bg-blue-100 text-blue-900';
    case 'AGENT':
      return 'bg-green-100 text-green-900';
    case 'VIEWER':
      return 'bg-slate-100 text-slate-900';
    default:
      return 'bg-slate-100 text-slate-900';
  }
}

export function SettingsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [activeTab, setActiveTab] = useState<
    'profile' | 'branding' | 'departments' | 'team' | 'invitations' | 'permissions' | 'notifications'
  >('profile');
  const [brandingForm, setBrandingForm] = useState<{
    displayName: string;
    logoUrl: string;
    primaryColor: string;
  }>({ displayName: '', logoUrl: '', primaryColor: '' });
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);
  const [brandingSuccess, setBrandingSuccess] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [newDepartmentDescription, setNewDepartmentDescription] = useState('');
  const [departmentError, setDepartmentError] = useState<string | null>(null);
  const [departmentSaving, setDepartmentSaving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MANAGER' | 'AGENT' | 'VIEWER'>('AGENT');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null);
  const [restrictionChoice, setRestrictionChoice] = useState(0);
  const [restrictionRole, setRestrictionRole] = useState<'MANAGER' | 'AGENT' | 'VIEWER'>('AGENT');
  const [restrictionError, setRestrictionError] = useState<string | null>(null);
  const [restrictionSaving, setRestrictionSaving] = useState(false);

  const loadSettings = async () => {
    try {
      setState({ status: 'loading' });

      // Fetched first, alone: userRole gates whether /settings/invitations
      // (ADMIN+) can be called at all -- calling it eagerly for a
      // MANAGER/AGENT/VIEWER would 403 and abort the whole page load.
      const profileResp = await api.get('/settings/agency');
      const profileRespData = profileResp.data as { profile?: AgencyProfile; userRole?: string };
      const userRole = profileRespData.userRole || 'VIEWER';
      const canSeeInvitations = userRole === 'OWNER' || userRole === 'ADMIN';

      const [teamResp, notificationsResp, departmentsResp, invitationsResp, restrictionsResp] = await Promise.all([
        api.get('/settings/team'),
        api.get('/settings/notifications'),
        api.get('/settings/departments'),
        canSeeInvitations ? api.get('/settings/invitations') : Promise.resolve({ data: { invitations: [] } }),
        api.get('/settings/permission-restrictions'),
      ]);

      const teamRespData = teamResp.data as { team?: TeamMember[] };
      const notificationsRespData = notificationsResp.data as { settings?: NotificationSettings };
      const departmentsRespData = departmentsResp.data as { departments?: Department[] };
      const invitationsRespData = invitationsResp.data as { invitations?: Invitation[] };
      const restrictionsRespData = restrictionsResp.data as { restrictions?: PermissionRestriction[] };

      const profile = profileRespData.profile || { id: '', name: '' };

      setState({
        status: 'success',
        profile,
        team: teamRespData.team || [],
        notifications: notificationsRespData.settings || {
          emailNotifications: false,
          proposalUpdates: false,
          bookingUpdates: false,
          paymentUpdates: false,
        },
        userRole,
        departments: departmentsRespData.departments || [],
        invitations: invitationsRespData.invitations || [],
        restrictions: restrictionsRespData.restrictions || [],
      });

      setBrandingForm({
        displayName: profile.displayName || '',
        logoUrl: profile.logoUrl || '',
        primaryColor: profile.primaryColor || '',
      });
    } catch (err) {
      if (err instanceof Error) {
        setState({ status: 'error', message: err.message });
      } else if (typeof err === 'object' && err !== null && 'status' in err) {
        const httpErr = err as { status: number; data?: { message: string } };
        if (httpErr.status === 403) {
          setState({
            status: 'error',
            message: 'Você não tem permissão para acessar as configurações.',
          });
        } else {
          setState({
            status: 'error',
            message: httpErr.data?.message || 'Não foi possível carregar as configurações.',
          });
        }
      } else {
        setState({ status: 'error', message: 'Ocorreu um erro inesperado.' });
      }
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const canManageBranding =
    state.status === 'success' && (state.userRole === 'OWNER' || state.userRole === 'ADMIN');
  const canManageDepartments =
    state.status === 'success' &&
    (state.userRole === 'OWNER' || state.userRole === 'ADMIN' || state.userRole === 'MANAGER');

  const handleSaveBranding = async () => {
    setBrandingSaving(true);
    setBrandingError(null);
    setBrandingSuccess(false);
    try {
      await api.patch('/settings/branding', {
        displayName: brandingForm.displayName || null,
        logoUrl: brandingForm.logoUrl || null,
        primaryColor: brandingForm.primaryColor || null,
      });
      setBrandingSuccess(true);
      await loadSettings();
    } catch (err) {
      setBrandingError(
        err instanceof Error ? err.message : 'Não foi possível salvar a marca.',
      );
    } finally {
      setBrandingSaving(false);
    }
  };

  const handleCreateDepartment = async () => {
    if (!newDepartmentName.trim()) {
      return;
    }
    setDepartmentSaving(true);
    setDepartmentError(null);
    try {
      await api.post('/settings/departments', {
        name: newDepartmentName.trim(),
        description: newDepartmentDescription.trim() || null,
      });
      setNewDepartmentName('');
      setNewDepartmentDescription('');
      await loadSettings();
    } catch (err) {
      setDepartmentError(
        err instanceof Error ? err.message : 'Não foi possível criar o departamento.',
      );
    } finally {
      setDepartmentSaving(false);
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    setDepartmentError(null);
    try {
      await api.delete(`/settings/departments/${id}`);
      await loadSettings();
    } catch {
      setDepartmentError('Não foi possível excluir o departamento.');
    }
  };

  const handleCreateInvitation = async () => {
    if (!inviteEmail.trim()) return;
    setInviteSaving(true);
    setInviteError(null);
    setCreatedInviteLink(null);
    try {
      const resp = await api.post<{ token: string }>('/settings/invitations', {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      const token = (resp.data as { token?: string }).token;
      if (token) {
        // apps/customer (which hosts /accept-invitation/:token) runs on a
        // different Vite dev port than this app -- see the same pattern in
        // EnrollmentLinksPage.tsx. In production these are typically the
        // same origin/subdomain-routed deployment.
        const customerAppBase: string =
          (import.meta.env.VITE_CUSTOMER_APP_URL as string | undefined) ??
          window.location.origin.replace(/:\d+$/, ':5176');
        setCreatedInviteLink(`${customerAppBase}/accept-invitation/${token}`);
      }
      setInviteEmail('');
      await loadSettings();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Não foi possível criar o convite.');
    } finally {
      setInviteSaving(false);
    }
  };

  const handleRevokeInvitation = async (id: string) => {
    try {
      await api.post(`/settings/invitations/${id}/revoke`);
      await loadSettings();
    } catch {
      setInviteError('Não foi possível revogar o convite.');
    }
  };

  const handleCreateRestriction = async () => {
    setRestrictionSaving(true);
    setRestrictionError(null);
    try {
      const choice = RESTRICTABLE_RESOURCE_ACTIONS[restrictionChoice];
      if (!choice) return;
      await api.post('/settings/permission-restrictions', {
        role: restrictionRole,
        resource: choice.resource,
        action: choice.action,
      });
      await loadSettings();
    } catch (err) {
      setRestrictionError(
        err instanceof Error ? err.message : 'Não foi possível criar a restrição.',
      );
    } finally {
      setRestrictionSaving(false);
    }
  };

  const handleDeleteRestriction = async (id: string) => {
    try {
      await api.delete(`/settings/permission-restrictions/${id}`);
      await loadSettings();
    } catch {
      setRestrictionError('Não foi possível remover a restrição.');
    }
  };

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Configurações" description="Gerenciar configurações da agência..." />
        <LoadingState label="Carregando configurações…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="space-y-6">
        <PageHeader title="Configurações" description="Gerenciar configurações da agência." />
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
            <div className="text-sm text-red-800">
              <p className="font-semibold">Erro ao carregar configurações</p>
              <p>{state.message}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { profile, team, notifications, userRole } = state;
  const canManageTeam =
    userRole === 'OWNER' || userRole === 'ADMIN' || userRole === 'MANAGER';
  const canManageInvitations = userRole === 'OWNER' || userRole === 'ADMIN';
  const canManageRestrictions = userRole === 'OWNER' || userRole === 'ADMIN';
  const restrictableRoles: Array<'MANAGER' | 'AGENT' | 'VIEWER'> = ['MANAGER', 'AGENT', 'VIEWER'];
  const invitableRoles: Array<'ADMIN' | 'MANAGER' | 'AGENT' | 'VIEWER'> = [
    'ADMIN',
    'MANAGER',
    'AGENT',
    'VIEWER',
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Gerenciar perfil, equipe e preferências da agência."
      />

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-8">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2 border-b-2 font-medium transition-colors ${
              activeTab === 'profile'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Settings className="inline-block mr-2 h-4 w-4" />
            Perfil
          </button>
          <button
            onClick={() => setActiveTab('branding')}
            className={`px-4 py-2 border-b-2 font-medium transition-colors ${
              activeTab === 'branding'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Palette className="inline-block mr-2 h-4 w-4" />
            Marca
          </button>
          <button
            onClick={() => setActiveTab('departments')}
            className={`px-4 py-2 border-b-2 font-medium transition-colors ${
              activeTab === 'departments'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="inline-block mr-2 h-4 w-4" />
            Departamentos
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={`px-4 py-2 border-b-2 font-medium transition-colors ${
              activeTab === 'team'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="inline-block mr-2 h-4 w-4" />
            Equipe
          </button>
          {canManageInvitations && (
            <button
              onClick={() => setActiveTab('invitations')}
              className={`px-4 py-2 border-b-2 font-medium transition-colors ${
                activeTab === 'invitations'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mail className="inline-block mr-2 h-4 w-4" />
              Convites
            </button>
          )}
          {canManageRestrictions && (
            <button
              onClick={() => setActiveTab('permissions')}
              className={`px-4 py-2 border-b-2 font-medium transition-colors ${
                activeTab === 'permissions'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Lock className="inline-block mr-2 h-4 w-4" />
              Restrições
            </button>
          )}
          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-4 py-2 border-b-2 font-medium transition-colors ${
              activeTab === 'notifications'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bell className="inline-block mr-2 h-4 w-4" />
            Notificações
          </button>
        </div>
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Perfil da Agência</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Nome</label>
                <p className="mt-1 block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900">
                  {profile.name}
                </p>
              </div>
              {profile.slug && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Identificador da agência (usado para entrar)
                  </label>
                  <p className="mt-1 flex items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900">
                    <span className="font-mono">{profile.slug}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Informe este identificador no campo "Agência" da tela de login.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <p className="mt-1 block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900">
                  {profile.email || 'Não configurado'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Telefone</label>
                <p className="mt-1 block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900">
                  {profile.phone || 'Não configurado'}
                </p>
              </div>
              <p className="text-xs text-slate-500">
                Para editar o perfil, entre em contato com o administrador.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Branding Tab */}
      {activeTab === 'branding' && (
        <div className="space-y-6">
          {!canManageBranding && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="flex items-start gap-3 pt-6">
                <Shield className="h-5 w-5 flex-shrink-0 text-yellow-600" />
                <div className="text-sm text-yellow-800">
                  <p className="font-semibold">Acesso limitado</p>
                  <p>Apenas OWNER e ADMIN podem alterar a identidade visual da agência.</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Identidade Visual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Nome de exibição
                </label>
                <input
                  type="text"
                  disabled={!canManageBranding}
                  value={brandingForm.displayName}
                  onChange={(e) =>
                    setBrandingForm((prev) => ({ ...prev, displayName: e.target.value }))
                  }
                  placeholder="Nome exibido para clientes (diferente da razão social)"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">URL do logo</label>
                <input
                  type="text"
                  disabled={!canManageBranding}
                  value={brandingForm.logoUrl}
                  onChange={(e) =>
                    setBrandingForm((prev) => ({ ...prev, logoUrl: e.target.value }))
                  }
                  placeholder="https://..."
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Cor primária</label>
                <div className="mt-1 flex items-center gap-3">
                  <input
                    type="text"
                    disabled={!canManageBranding}
                    value={brandingForm.primaryColor}
                    onChange={(e) =>
                      setBrandingForm((prev) => ({ ...prev, primaryColor: e.target.value }))
                    }
                    placeholder="#1A2B3C"
                    className="block w-40 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
                  />
                  {/^#[0-9a-fA-F]{6}$/.test(brandingForm.primaryColor) && (
                    <span
                      className="h-8 w-8 rounded border border-slate-300"
                      style={{ backgroundColor: brandingForm.primaryColor }}
                    />
                  )}
                </div>
              </div>

              {brandingError && <p className="text-sm text-red-600">{brandingError}</p>}
              {brandingSuccess && (
                <p className="text-sm text-green-600">Identidade visual atualizada.</p>
              )}

              {canManageBranding && (
                <button
                  onClick={() => void handleSaveBranding()}
                  disabled={brandingSaving}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {brandingSaving ? 'Salvando…' : 'Salvar identidade visual'}
                </button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Departments Tab */}
      {activeTab === 'departments' && (
        <div className="space-y-6">
          {!canManageDepartments && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="flex items-start gap-3 pt-6">
                <Shield className="h-5 w-5 flex-shrink-0 text-yellow-600" />
                <div className="text-sm text-yellow-800">
                  <p className="font-semibold">Acesso limitado</p>
                  <p>Apenas OWNER, ADMIN e MANAGER podem gerenciar departamentos.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {canManageDepartments && (
            <Card>
              <CardHeader>
                <CardTitle>Novo Departamento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <input
                  type="text"
                  value={newDepartmentName}
                  onChange={(e) => setNewDepartmentName(e.target.value)}
                  placeholder="Nome do departamento"
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
                <input
                  type="text"
                  value={newDepartmentDescription}
                  onChange={(e) => setNewDepartmentDescription(e.target.value)}
                  placeholder="Descrição (opcional)"
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
                {departmentError && <p className="text-sm text-red-600">{departmentError}</p>}
                <button
                  onClick={() => void handleCreateDepartment()}
                  disabled={departmentSaving}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {departmentSaving ? 'Criando…' : 'Criar departamento'}
                </button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Departamentos</CardTitle>
            </CardHeader>
            <CardContent>
              {state.departments.length > 0 ? (
                <div className="space-y-3">
                  {state.departments.map((dept) => (
                    <div
                      key={dept.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-4"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{dept.name}</p>
                        {dept.description && (
                          <p className="text-sm text-slate-500">{dept.description}</p>
                        )}
                      </div>
                      {canManageDepartments && (
                        <button
                          onClick={() => void handleDeleteDepartment(dept.id)}
                          className="flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="h-4 w-4" />
                          Excluir
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-slate-500">Nenhum departamento criado</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Team Tab */}
      {activeTab === 'team' && (
        <div className="space-y-6">
          {!canManageTeam && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="flex items-start gap-3 pt-6">
                <Shield className="h-5 w-5 flex-shrink-0 text-yellow-600" />
                <div className="text-sm text-yellow-800">
                  <p className="font-semibold">Acesso limitado</p>
                  <p>Apenas OWNER, ADMIN e MANAGER podem gerenciar a equipe.</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Membros da Equipe</CardTitle>
            </CardHeader>
            <CardContent>
              {team.length > 0 ? (
                <div className="space-y-3">
                  {team.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-4"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{member.name}</p>
                        <p className="text-sm text-slate-500">{member.email}</p>
                        <p className="text-xs text-slate-400">
                          Membro desde {new Date(member.joinedAt).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <StatusBadge tone="neutral">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${getRoleColor(member.role)}`}>
                          {member.role}
                        </span>
                      </StatusBadge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-slate-500">Nenhum membro na equipe</p>
              )}
            </CardContent>
          </Card>

          {canManageTeam && (
            <Card>
              <CardHeader>
                <CardTitle>Papéis e Permissões</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <p className="font-medium text-slate-900">OWNER</p>
                    <p className="text-sm text-slate-600">Controle total da agência</p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">ADMIN</p>
                    <p className="text-sm text-slate-600">Administrador com acesso a configurações</p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">MANAGER</p>
                    <p className="text-sm text-slate-600">Gerente com acesso a relatórios e equipe</p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">AGENT</p>
                    <p className="text-sm text-slate-600">Agente com acesso a operações</p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">VIEWER</p>
                    <p className="text-sm text-slate-600">Visualizador com acesso somente leitura</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Invitations Tab */}
      {activeTab === 'invitations' && canManageInvitations && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Convidar Membro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  className="flex-1 min-w-[220px] rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                >
                  {invitableRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => void handleCreateInvitation()}
                  disabled={inviteSaving || !inviteEmail.trim()}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {inviteSaving ? 'Enviando…' : 'Convidar'}
                </button>
              </div>
              {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
              <p className="text-xs text-slate-500">
                Você não pode convidar para um papel acima do seu (ADMIN não pode convidar OWNER).
              </p>
              {createdInviteLink && (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 space-y-2">
                  <p className="text-sm font-medium text-emerald-900">
                    Convite criado. Copie e envie o link agora — ele não será exibido novamente.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={createdInviteLink}
                      className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900"
                    />
                    <button
                      onClick={() => void navigator.clipboard.writeText(createdInviteLink)}
                      className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Copy className="h-4 w-4" />
                      Copiar
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Convites</CardTitle>
            </CardHeader>
            <CardContent>
              {state.invitations.length > 0 ? (
                <div className="space-y-3">
                  {state.invitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-4"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{inv.email}</p>
                        <p className="text-sm text-slate-500">
                          {inv.role} · expira em {new Date(inv.expiresAt).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            inv.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-900'
                              : inv.status === 'ACCEPTED'
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {inv.status === 'PENDING' ? 'Pendente' : inv.status === 'ACCEPTED' ? 'Aceito' : 'Revogado'}
                        </span>
                        {inv.status === 'PENDING' && (
                          <button
                            onClick={() => void handleRevokeInvitation(inv.id)}
                            className="text-sm font-medium text-red-600 hover:text-red-800"
                          >
                            Revogar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-slate-500">Nenhum convite enviado</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Permission Restrictions Tab */}
      {activeTab === 'permissions' && canManageRestrictions && (
        <div className="space-y-6">
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="flex items-start gap-3 pt-6">
              <Shield className="h-5 w-5 flex-shrink-0 text-blue-600" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold">Restrições só reduzem acesso</p>
                <p>
                  Uma restrição impede que um papel faça algo que ele normalmente poderia fazer,
                  apenas nesta agência. OWNER e ADMIN nunca podem ser restringidos.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Nova Restrição</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <select
                  value={restrictionRole}
                  onChange={(e) => setRestrictionRole(e.target.value as typeof restrictionRole)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                >
                  {restrictableRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <select
                  value={restrictionChoice}
                  onChange={(e) => setRestrictionChoice(Number(e.target.value))}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                >
                  {RESTRICTABLE_RESOURCE_ACTIONS.map((opt, i) => (
                    <option key={`${opt.resource}:${opt.action}`} value={i}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => void handleCreateRestriction()}
                  disabled={restrictionSaving}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {restrictionSaving ? 'Criando…' : 'Restringir'}
                </button>
              </div>
              {restrictionError && <p className="text-sm text-red-600">{restrictionError}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Restrições Ativas</CardTitle>
            </CardHeader>
            <CardContent>
              {state.restrictions.length > 0 ? (
                <div className="space-y-3">
                  {state.restrictions.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-4"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">
                          {r.role} não pode: {r.resource} · {r.action}
                        </p>
                      </div>
                      <button
                        onClick={() => void handleDeleteRestriction(r.id)}
                        className="flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-slate-500">Nenhuma restrição configurada</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Preferências de Notificação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={notifications.emailNotifications}
                  disabled
                  className="rounded border-slate-300"
                />
                <span className="text-sm font-medium text-slate-900">Notificações por email</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={notifications.proposalUpdates}
                  disabled
                  className="rounded border-slate-300"
                />
                <span className="text-sm font-medium text-slate-900">
                  Atualizações de propostas
                </span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={notifications.bookingUpdates}
                  disabled
                  className="rounded border-slate-300"
                />
                <span className="text-sm font-medium text-slate-900">
                  Atualizações de reservas
                </span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={notifications.paymentUpdates}
                  disabled
                  className="rounded border-slate-300"
                />
                <span className="text-sm font-medium text-slate-900">
                  Atualizações de pagamentos
                </span>
              </label>
              <p className="text-xs text-slate-500 pt-4">
                As configurações de notificação são gerenciadas pelo sistema. Entre em contato
                com o suporte para fazer alterações.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
