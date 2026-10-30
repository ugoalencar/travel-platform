import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, downloadBlob } from '../api';
import { useAuth } from '../auth';
import { ErrorNote, SuccessNote } from '../ui';

interface BackupStatus {
  automatic: { configured: boolean };
  history: Array<{ id: string; filename: string; createdAt: string; rows: number }>;
}

export function BackupSection() {
  const { user } = useAuth();
  return user?.role === 'MASTER' ? <BackupPanel /> : null;
}

function BackupPanel() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [archivePassword, setArchivePassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setStatus(await api<BackupStatus>('/backup/status')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Falha ao consultar backups.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function generate(event: FormEvent) {
    event.preventDefault();
    setError(null); setNotice(null);
    if (archivePassword !== confirmation) { setError('As senhas do arquivo não coincidem.'); return; }
    setBusy(true);
    try {
      const result = await api<{ filename: string; archive: unknown }>('/backup/export', {
        method: 'POST', body: { currentPassword, archivePassword },
      });
      downloadBlob(new Blob([JSON.stringify(result.archive)], { type: 'application/octet-stream' }), result.filename);
      setNotice('Backup criptografado gerado. Download iniciado.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha ao gerar backup.'); }
    finally { setCurrentPassword(''); setArchivePassword(''); setConfirmation(''); setBusy(false); }
  }

  return (
    <section className="backup-section" aria-labelledby="backup-title">
      <h2 id="backup-title">Backup</h2>
      <ErrorNote error={error} /><SuccessNote success={notice} />
      <dl className="backup-summary">
        <div><dt>Backup diário automático</dt><dd>{status ? status.automatic.configured ? 'Ativo' : 'Não configurado' : 'Consultando…'}</dd></div>
        <div><dt>Última geração manual</dt><dd>{status?.history[0] ? new Date(status.history[0].createdAt).toLocaleString('pt-BR') : 'Sem registro disponível'}</dd></div>
      </dl>
      <p className="lite-muted">Cópia dos dados operacionais da agência. Contas de acesso, senhas e sessões não estão incluídas. Restauração assistida pelo suporte.</p>
      <form className="lite-form" onSubmit={(event) => void generate(event)} aria-label="Gerar backup">
        <label className="field"><span>Sua senha atual</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required maxLength={1024} disabled={busy} /></label>
        <label className="field"><span>Senha do arquivo</span><input type="password" autoComplete="new-password" value={archivePassword} onChange={(event) => setArchivePassword(event.target.value)} required minLength={12} maxLength={1024} disabled={busy} /></label>
        <label className="field"><span>Confirme a senha do arquivo</span><input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={12} maxLength={1024} disabled={busy} /></label>
        <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busy || !status}>{busy ? 'Gerando…' : 'Gerar backup criptografado'}</button></div>
      </form>
      <h3>Histórico de geração</h3>
      {!status ? <p role="status">Consultando histórico…</p> : status.history.length === 0 ? <p className="lite-muted">Nenhum backup gerado por esta área.</p> : (
        <div className="lite-table-wrap"><table><thead><tr><th>Data</th><th>Arquivo</th><th>Registros</th><th>Situação</th></tr></thead><tbody>{status.history.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString('pt-BR')}</td><td className="backup-filename">{item.filename}</td><td>{item.rows}</td><td>Gerado</td></tr>)}</tbody></table></div>
      )}
    </section>
  );
}
