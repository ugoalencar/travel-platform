import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  PlatformAuthApiError,
  confirmMfaEnrollment,
  getMfaStatus,
  resetMfa,
  startMfaEnrollment,
  type MfaStatus,
} from '../lib/platformAuthApi';

const LOW_RECOVERY_CODES = 3;

interface Enrollment {
  provisioningUri: string;
  secret: string;
  recoveryCodes: string[];
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof PlatformAuthApiError ? err.message : fallback;
}

/** Groups a base32 secret in blocks of 4 so it can be typed into an authenticator app. */
function formatSecret(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

export function SecurityPage() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await getMfaStatus());
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível carregar o status do MFA.'));
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleStartEnrollment() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const started = await startMfaEnrollment();
      const secret = new URL(started.provisioningUri).searchParams.get('secret') ?? '';
      setEnrollment({ provisioningUri: started.provisioningUri, secret, recoveryCodes: started.recoveryCodes });
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível iniciar a configuração do MFA.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await confirmMfaEnrollment(code.trim());
      setEnrollment(null);
      setCode('');
      setNotice('MFA ativado. A partir do próximo login o código do autenticador será exigido.');
      await loadStatus();
    } catch (err) {
      setError(errorMessage(err, 'Código inválido.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await resetMfa(resetPassword, resetCode.trim());
      setResetPassword('');
      setResetCode('');
      setNotice('MFA redefinido e demais sessões encerradas. Configure o autenticador novamente agora.');
      await loadStatus();
    } catch (err) {
      setError(errorMessage(err, 'Senha ou código inválidos.'));
    } finally {
      setBusy(false);
    }
  }

  async function copyRecoveryCodes(codes: string[]) {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setNotice('Códigos copiados. Guarde-os no seu cofre de senhas.');
    } catch {
      setError('Não foi possível copiar. Anote os códigos manualmente.');
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold mb-8">Segurança da conta</h1>

      {error && <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>}
      {notice && (
        <div className="mb-6 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">{notice}</div>
      )}

      <section className="border-b pb-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Autenticação em dois fatores (MFA)</h2>

        {!status ? (
          <p className="text-sm text-gray-600">Carregando…</p>
        ) : status.mfaEnabled ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              MFA <strong>ativo</strong>. Códigos de recuperação restantes: <strong>{status.recoveryCodesRemaining}</strong>
            </p>
            {status.recoveryCodesRemaining <= LOW_RECOVERY_CODES && (
              <p className="text-sm text-amber-700">
                Poucos códigos de recuperação. Redefina o MFA para gerar um novo conjunto.
              </p>
            )}
          </div>
        ) : enrollment ? (
          <div className="space-y-6">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">1. Adicione a conta no app autenticador</p>
              <p className="text-sm text-gray-600 mb-2">
                No Google Authenticator, Microsoft Authenticator, Authy etc., escolha “inserir chave de configuração”
                e digite a chave abaixo (tipo: baseado em tempo).
              </p>
              <code className="block rounded-lg bg-gray-100 px-3 py-2 font-mono text-sm tracking-wider break-all">
                {formatSecret(enrollment.secret)}
              </code>
              <a href={enrollment.provisioningUri} className="mt-2 inline-block text-sm text-blue-600 hover:underline">
                Abrir no app autenticador (celular)
              </a>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">2. Guarde os códigos de recuperação</p>
              <p className="text-sm text-gray-600 mb-2">
                Cada código funciona uma única vez no lugar do código do autenticador. Eles não serão exibidos de
                novo: guarde-os agora no seu cofre de senhas.
              </p>
              <ul className="grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-3 font-mono text-sm sm:grid-cols-4">
                {enrollment.recoveryCodes.map((recoveryCode) => (
                  <li key={recoveryCode}>{recoveryCode}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void copyRecoveryCodes(enrollment.recoveryCodes)}
                className="mt-2 px-4 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
              >
                Copiar códigos
              </button>
            </div>

            <form onSubmit={(e) => void handleConfirm(e)} className="space-y-2">
              <label htmlFor="mfa-code" className="block text-sm font-medium text-gray-700 mb-1">
                3. Confirme com o código atual do autenticador
              </label>
              <input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-48 px-3 py-2 border border-gray-300 rounded-lg tracking-widest"
                autoComplete="one-time-code"
              />
              <div>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  Ativar MFA
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-amber-700">
              MFA desativado. Configure agora: a conta de plataforma tem acesso a todas as agências.
            </p>
            <button
              type="button"
              onClick={() => void handleStartEnrollment()}
              disabled={busy}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              Configurar MFA
            </button>
          </div>
        )}
      </section>

      {status?.mfaEnabled && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Perdi meu autenticador</h2>
          <p className="text-sm text-gray-600 mb-4">
            Informe a senha atual e um código de recuperação (ou o código do autenticador, se ainda tiver acesso). O MFA
            será desativado, as demais sessões serão encerradas e você deverá configurá-lo de novo.
          </p>
          <form onSubmit={(e) => void handleReset(e)} className="space-y-4 max-w-sm">
            <div>
              <label htmlFor="reset-password" className="block text-sm font-medium text-gray-700 mb-1">
                Senha atual
              </label>
              <input
                id="reset-password"
                type="password"
                required
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                autoComplete="current-password"
              />
            </div>
            <div>
              <label htmlFor="reset-code" className="block text-sm font-medium text-gray-700 mb-1">
                Código de recuperação ou do autenticador
              </label>
              <input
                id="reset-code"
                type="text"
                required
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono"
                autoComplete="one-time-code"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="px-6 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-60"
            >
              Redefinir MFA
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
