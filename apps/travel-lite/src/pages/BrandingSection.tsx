import { useState, type ChangeEvent, type FormEvent } from 'react';
import { api } from '../api';
import { useCan } from '../auth';
import { useBranding } from '../BrandingProvider';
import { LOGO_TYPES, MAX_LOGO_BYTES, normalizeBranding, safeColor } from '../branding';
import { ErrorNote, SuccessNote } from '../ui';

type LogoAction = { kind: 'keep' } | { kind: 'remove' } | { kind: 'set'; dataUrl: string };

interface ColorFieldProps {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}

function ColorField({ label, hint, value, onChange }: ColorFieldProps) {
  return (
    <label className="field lite-color-field">
      <span>{label}</span>
      <div className="lite-color-row">
        <input
          type="color"
          aria-label={`${label} (seletor)`}
          value={safeColor(value) ?? '#000000'}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          aria-label={label}
          value={value}
          maxLength={7}
          placeholder="padrão"
          onChange={(event) => onChange(event.target.value.trim())}
        />
        {value ? (
          <button type="button" className="btn btn-small" onClick={() => onChange('')}>
            Padrão
          </button>
        ) : null}
      </div>
      <small className="lite-muted">{hint}</small>
    </label>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    reader.readAsDataURL(file);
  });
}

/**
 * Settings > Identidade visual. The editor only opens once the current
 * branding was really read: starting from a fake "empty" state after a failed
 * read would let a save wipe the stored identity.
 */
export function BrandingSection() {
  const canConfigure = useCan('dashboard.configure');
  const { status } = useBranding();
  if (!canConfigure) return null;
  if (status === 'error') {
    return (
      <section className="lite-card">
        <h2>Identidade visual</h2>
        <p className="lite-error">Não foi possível carregar a identidade visual atual. Recarregue a página para editar.</p>
      </section>
    );
  }
  if (status !== 'ready') {
    return (
      <section className="lite-card">
        <h2>Identidade visual</h2>
        <p className="lite-muted">Carregando…</p>
      </section>
    );
  }
  return <BrandingEditor />;
}

/** The API enforces every rule; this is the editor. */
function BrandingEditor() {
  const { branding, setBranding } = useBranding();
  const [displayName, setDisplayName] = useState(branding.displayName ?? '');
  const [welcomeText, setWelcomeText] = useState(branding.welcomeText ?? '');
  const [primaryColor, setPrimaryColor] = useState(branding.primaryColor ?? '');
  const [secondaryColor, setSecondaryColor] = useState(branding.secondaryColor ?? '');
  const [loginBackground, setLoginBackground] = useState(branding.loginBackground ?? '');
  const [logo, setLogo] = useState<LogoAction>({ kind: 'keep' });
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const previewLogo =
    logo.kind === 'set' ? logo.dataUrl : logo.kind === 'remove' ? null : branding.logoDataUrl;

  function fail(message: string): void {
    setNotice(null);
    setError(message);
  }

  async function onLogoChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      fail('O logo deve ser uma imagem PNG, JPEG ou WebP.');
      setFileKey((key) => key + 1);
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      fail(`O logo deve ter até ${MAX_LOGO_BYTES / 1024} KB.`);
      setFileKey((key) => key + 1);
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      setError(null);
      setLogo({ kind: 'set', dataUrl });
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Falha ao ler o arquivo');
    }
  }

  async function save(payload: Record<string, unknown>, message: string): Promise<void> {
    setBusy(true);
    try {
      const response = await api<{ branding: unknown }>('/branding', { method: 'PUT', body: payload });
      const saved = normalizeBranding(response.branding);
      setBranding(saved);
      setDisplayName(saved.displayName ?? '');
      setWelcomeText(saved.welcomeText ?? '');
      setPrimaryColor(saved.primaryColor ?? '');
      setSecondaryColor(saved.secondaryColor ?? '');
      setLoginBackground(saved.loginBackground ?? '');
      setLogo({ kind: 'keep' });
      setFileKey((key) => key + 1);
      setError(null);
      setNotice(message);
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const payload: Record<string, unknown> = {
      displayName,
      welcomeText,
      primaryColor,
      secondaryColor,
      loginBackground,
    };
    if (logo.kind === 'set') payload['logoDataUrl'] = logo.dataUrl;
    if (logo.kind === 'remove') payload['logoDataUrl'] = null;
    await save(payload, 'Identidade visual salva.');
  }

  async function restoreDefaults(): Promise<void> {
    if (!window.confirm('Restaurar a identidade visual padrão? Logo, nome e cores personalizados serão removidos.')) {
      return;
    }
    await save(
      {
        displayName: '',
        welcomeText: '',
        primaryColor: '',
        secondaryColor: '',
        loginBackground: '',
        logoDataUrl: null,
      },
      'Identidade visual restaurada para o padrão.',
    );
  }

  return (
    <section className="lite-card" aria-labelledby="branding-title">
      <h2 id="branding-title">Identidade visual</h2>
      <p className="lite-muted">
        Nome, logo e cores da agência aparecem no login e no topo do sistema. Campos vazios usam o visual padrão.
      </p>
      <ErrorNote error={error} />
      <SuccessNote success={notice} />
      <form className="lite-form" onSubmit={(event) => void onSubmit(event)}>
        <div className="lite-branding-grid">
          <label className="field">
            <span>Nome fantasia</span>
            <input
              value={displayName}
              maxLength={80}
              placeholder="Travel Lite"
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Texto de boas-vindas</span>
            <input
              value={welcomeText}
              maxLength={160}
              placeholder="Entre com o acesso da agência"
              onChange={(event) => setWelcomeText(event.target.value)}
            />
          </label>
          <ColorField
            label="Cor primária"
            hint="Botões e destaques. Use uma cor escura o bastante para texto branco."
            value={primaryColor}
            onChange={setPrimaryColor}
          />
          <ColorField
            label="Cor secundária"
            hint="Menu lateral. Precisa ter bom contraste com texto branco."
            value={secondaryColor}
            onChange={setSecondaryColor}
          />
          <ColorField
            label="Cor de fundo do login"
            hint="Fundo da tela de entrada."
            value={loginBackground}
            onChange={setLoginBackground}
          />
          <div className="field">
            <label htmlFor="branding-logo">Logo</label>
            <input
              key={fileKey}
              id="branding-logo"
              type="file"
              accept={LOGO_TYPES.join(',')}
              onChange={(event) => void onLogoChange(event)}
            />
            <small className="lite-muted">PNG, JPEG ou WebP, até {MAX_LOGO_BYTES / 1024} KB.</small>
            {previewLogo ? (
              <>
                <img className="lite-logo-preview" src={previewLogo} alt="Pré-visualização do logo" />
                <button type="button" className="btn btn-small" onClick={() => setLogo({ kind: 'remove' })}>
                  Remover logo
                </button>
              </>
            ) : null}
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar identidade visual'}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => void restoreDefaults()}>
            Restaurar padrão
          </button>
        </div>
      </form>
    </section>
  );
}
