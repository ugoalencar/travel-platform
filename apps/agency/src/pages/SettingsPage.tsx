import { useEffect, useState } from 'react';
import { Settings, Users, Bell, Shield, AlertCircle, Palette, Building2, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { LoadingState } from '../components/ui/loading-state';
import { StatusBadge } from '../components/ui/status-badge';
import { api } from '../lib/api';

interface AgencyProfile {
  id: string;
  name: string;
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
    'profile' | 'branding' | 'departments' | 'team' | 'notifications'
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

  const loadSettings = async () => {
    try {
      setState({ status: 'loading' });

      const [profileResp, teamResp, notificationsResp, departmentsResp] = await Promise.all([
        api.get('/settings/agency'),
        api.get('/settings/team'),
        api.get('/settings/notifications'),
        api.get('/settings/departments'),
      ]);

      const profileRespData = profileResp.data as { profile?: AgencyProfile; userRole?: string };
      const teamRespData = teamResp.data as { team?: TeamMember[] };
      const notificationsRespData = notificationsResp.data as { settings?: NotificationSettings };
      const departmentsRespData = departmentsResp.data as { departments?: Department[] };

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
        userRole: profileRespData.userRole || 'VIEWER',
        departments: departmentsRespData.departments || [],
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
