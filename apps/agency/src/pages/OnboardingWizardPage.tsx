import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { api } from '../lib/api';

// Guided first-run flow for a brand-new agency: Profile -> Branding ->
// Team -> Done. Progress is persisted server-side (agencies.onboarding_step)
// so it survives a reload/relogin, not just local component state.
// AppShell redirects here whenever the agency profile hasn't completed
// onboarding yet -- see components/layout/AppShell.tsx.

type WizardStep = 'profile' | 'branding' | 'team' | 'done';
const STEPS: Array<{ key: WizardStep; label: string }> = [
  { key: 'profile', label: 'Perfil' },
  { key: 'branding', label: 'Marca' },
  { key: 'team', label: 'Equipe' },
  { key: 'done', label: 'Concluído' },
];

interface AgencyProfile {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  displayName?: string;
  logoUrl?: string;
  primaryColor?: string;
}

export function OnboardingWizardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<WizardStep>('profile');
  const [profileForm, setProfileForm] = useState({ name: '', email: '', phone: '' });
  const [brandingForm, setBrandingForm] = useState({ displayName: '', logoUrl: '', primaryColor: '' });
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MANAGER' | 'AGENT' | 'VIEWER'>('AGENT');
  const [invitedCount, setInvitedCount] = useState(0);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/settings/agency')
      .then((resp) => {
        const data = resp.data as { profile?: AgencyProfile; userRole?: string };
        const profile = data.profile ?? { id: '', name: '' };
        setProfileForm({
          name: profile.name || '',
          email: profile.email || '',
          phone: profile.phone || '',
        });
        setBrandingForm({
          displayName: profile.displayName || '',
          logoUrl: profile.logoUrl || '',
          primaryColor: profile.primaryColor || '',
        });
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const persistStep = async (next: WizardStep) => {
    await api.patch('/settings/onboarding-step', { step: next });
  };

  const goToStep = async (next: WizardStep) => {
    setSaving(true);
    setError(null);
    try {
      await persistStep(next);
      setStep(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível avançar.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profileForm.name.trim()) {
      setError('Informe o nome da agência.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.patch('/settings/agency', {
        name: profileForm.name.trim(),
        email: profileForm.email.trim() || null,
        phone: profileForm.phone.trim() || null,
      });
      await goToStep('branding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o perfil.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBranding = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.patch('/settings/branding', {
        displayName: brandingForm.displayName.trim() || null,
        logoUrl: brandingForm.logoUrl.trim() || null,
        primaryColor: brandingForm.primaryColor.trim() || null,
      });
      await goToStep('team');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a marca.');
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post<{ token: string }>('/settings/invitations', {
        email: inviteEmail.trim(),
        name: inviteName.trim(),
        role: inviteRole,
      });
      // No email provider exists anywhere in this codebase yet (see
      // docs/deployment/STAGING_DEPLOY_RUNBOOK.md's Known Gaps) -- show
      // the real activation link directly so it can be copied/handed to
      // the invitee manually, same pattern as CustomerPortalAccessCard
      // and EnrollmentLinksPage.
      const portalOrigin = window.location.hostname.replace(/^agency\./, 'portal.');
      const link = `${window.location.protocol}//${portalOrigin}${window.location.port ? `:${window.location.port}` : ''}/accept-invitation/${data.token}`;
      setLastInviteLink(link);
      setInvitedCount((n) => n + 1);
      setInviteEmail('');
      setInviteName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível convidar.');
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/settings/onboarding/complete');
      void navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir o onboarding.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Carregando…</p>
      </div>
    );
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-12">
      <p className="mb-6 text-center text-lg font-bold text-(--color-travel-navy)">Travel Platform</p>
      <div className="mb-8 flex items-center justify-center gap-4">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            {i < stepIndex ? (
              <CheckCircle2 className="h-5 w-5 text-(--color-travel-navy)" />
            ) : (
              <Circle className={`h-5 w-5 ${i === stepIndex ? 'text-(--color-travel-navy)' : 'text-slate-300'}`} />
            )}
            <span className={`text-sm ${i === stepIndex ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <div className="h-px w-8 bg-slate-200" />}
          </div>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-center text-sm text-red-700">{error}</p>
      )}

      {step === 'profile' && (
        <Card>
          <CardHeader>
            <CardTitle>Vamos configurar sua agência</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Nome da agência *</label>
              <input
                value={profileForm.name}
                onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">E-mail de contato</label>
              <input
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Telefone</label>
              <input
                value={profileForm.phone}
                onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <button
              onClick={() => void handleSaveProfile()}
              disabled={saving}
              className="w-full rounded-md bg-(--color-travel-navy) px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Continuar'}
            </button>
          </CardContent>
        </Card>
      )}

      {step === 'branding' && (
        <Card>
          <CardHeader>
            <CardTitle>Deixe com a cara da sua marca</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Nome de exibição</label>
              <input
                value={brandingForm.displayName}
                onChange={(e) => setBrandingForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="Como o nome aparece para clientes"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">URL do logo</label>
              <input
                value={brandingForm.logoUrl}
                onChange={(e) => setBrandingForm((f) => ({ ...f, logoUrl: e.target.value }))}
                placeholder="https://…"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Cor principal</label>
              <input
                value={brandingForm.primaryColor}
                onChange={(e) => setBrandingForm((f) => ({ ...f, primaryColor: e.target.value }))}
                placeholder="#1A2B3C"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => void goToStep('team')}
                disabled={saving}
                className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Pular por agora
              </button>
              <button
                onClick={() => void handleSaveBranding()}
                disabled={saving}
                className="flex-1 rounded-md bg-(--color-travel-navy) px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? 'Salvando…' : 'Continuar'}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'team' && (
        <Card>
          <CardHeader>
            <CardTitle>Convide sua equipe</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-500">
              Você pode convidar quantas pessoas quiser depois, em Configurações → Convites.
            </p>
            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Nome completo"
                className="flex-1 min-w-[160px] rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className="flex-1 min-w-[200px] rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              >
                <option value="ADMIN">ADMIN</option>
                <option value="MANAGER">MANAGER</option>
                <option value="AGENT">AGENT</option>
                <option value="VIEWER">VIEWER</option>
              </select>
              <button
                onClick={() => void handleInvite()}
                disabled={saving || !inviteEmail.trim() || !inviteName.trim()}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Convidar
              </button>
            </div>
            {invitedCount > 0 && (
              <p className="text-sm text-emerald-700">
                {invitedCount} {invitedCount === 1 ? 'convite enviado' : 'convites enviados'}.
              </p>
            )}
            {lastInviteLink && (
              <div className="rounded-md bg-slate-50 p-3">
                <p className="mb-1 text-xs text-slate-500">
                  Link de ativação (sem provedor de email configurado — copie e envie manualmente):
                </p>
                <a href={lastInviteLink} className="break-all text-xs text-blue-700 hover:underline">
                  {lastInviteLink}
                </a>
              </div>
            )}
            <button
              onClick={() => void goToStep('done')}
              disabled={saving}
              className="w-full rounded-md bg-(--color-travel-navy) px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Continuar
            </button>
          </CardContent>
        </Card>
      )}

      {step === 'done' && (
        <Card>
          <CardHeader>
            <CardTitle>Seu ambiente está pronto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              Você pode ajustar tudo isso a qualquer momento em Configurações.
            </p>
            <dl className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-4 text-sm">
              <dt className="text-slate-500">Agência</dt>
              <dd className="text-right font-medium text-slate-900">{profileForm.name || '—'}</dd>
              <dt className="text-slate-500">Convites enviados</dt>
              <dd className="text-right font-medium text-slate-900">{invitedCount}</dd>
              <dt className="text-slate-500">Marca personalizada</dt>
              <dd className="text-right font-medium text-slate-900">
                {brandingForm.displayName || brandingForm.logoUrl ? 'Configurada' : 'Não configurada ainda'}
              </dd>
            </dl>
            <button
              onClick={() => void handleFinish()}
              disabled={saving}
              className="w-full rounded-md bg-(--color-travel-navy) px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'Finalizando…' : 'Ir para o painel'}
            </button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
