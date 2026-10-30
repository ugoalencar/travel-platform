import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface Verification {
  ok: boolean;
  reportHash: string;
  tables: Array<{ table: string; rows: number; existingRows: number; hashOk: boolean; conflict: boolean }>;
}
interface BackupRun {
  id: string; scheduledLocalDate: string; status: 'RUNNING' | 'SUCCEEDED' | 'FAILED'; attempt: number;
  recordCount: number | null; sizeBytes: number | null; errorCode: string | null; completedAt: string | null;
}
interface BackupStatus {
  scope: string;
  automatic: {
    configured: boolean; enabled: boolean; ready: boolean; dailyTime: string; timezone: string;
    nextRunAt: string | null; retentionDays: number; readiness: { storageConfigured: boolean; encryptionConfigured: boolean };
  };
  managedRuns: BackupRun[];
}
interface Dataset {
  id: string; label: string; columns: Array<{ id: string; label: string }>;
  filters: Array<{ id: string; options?: string[] }>;
}

const DEFAULT_COLUMNS: Record<string, string[]> = {
  sales: ['sale_id', 'created_at', 'customer_name', 'total', 'status'],
  customers: ['customer_id', 'customer_name', 'email', 'phone', 'status'],
  receivables: ['receivable_id', 'sale_id', 'customer_name', 'description', 'amount', 'due_at', 'status'],
  payables: ['payable_id', 'sale_id', 'customer_name', 'supplier_name', 'description', 'amount', 'due_at', 'status'],
  expenses: ['expense_id', 'supplier_name', 'category_name', 'description', 'amount', 'incurred_at', 'status'],
  agency_revenue: ['revenue_id', 'sale_id', 'customer_name', 'supplier_name', 'amount', 'status'],
};

function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

async function saveDownload(blob: Blob, filename: string): Promise<boolean> {
  const pickerWindow = window as Window & {
    showSaveFilePicker?: (options: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<{
      createWritable: () => Promise<{ write: (value: Blob) => Promise<void>; close: () => Promise<void> }>;
    }>;
  };
  if (pickerWindow.showSaveFilePicker) {
    try {
      const csv = filename.toLowerCase().endsWith('.csv');
      const handle = await pickerWindow.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: csv ? 'Planilha CSV' : 'Backup criptografado', accept: { [csv ? 'text/csv' : 'application/json']: [csv ? '.csv' : '.tpbackup'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
      throw error;
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  } finally { URL.revokeObjectURL(url); }
  return true;
}

/** Backup and export actions are Owner-only at the route and service layers. */
export function TenantBackupTab() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [archivePassword, setArchivePassword] = useState('');
  const [envelope, setEnvelope] = useState<unknown>(null);
  const [report, setReport] = useState<Verification | null>(null);
  const [managedReport, setManagedReport] = useState<{ runId: string; report: Verification } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [dailyTime, setDailyTime] = useState('02:00');
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [enabled, setEnabled] = useState(false);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [dataset, setDataset] = useState('sales');
  const [columns, setColumns] = useState<string[]>(DEFAULT_COLUMNS.sales ?? []);
  const [from, setFrom] = useState(localIsoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(localIsoDate(new Date()));
  const [statuses, setStatuses] = useState<string[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');

  async function refreshStatus() {
    const result = await api.get<BackupStatus>('/settings/backup/status');
    setStatus(result.data);
    setEnabled(result.data.automatic.enabled);
    setDailyTime(result.data.automatic.dailyTime);
    setTimezone(result.data.automatic.timezone);
  }

  useEffect(() => {
    void refreshStatus().catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Não foi possível consultar o backup.'));
    api.get<{ datasets: Dataset[] }>('/reports/export/catalog')
      .then(result => setDatasets(result.data.datasets))
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Não foi possível carregar as planilhas.'));
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage('');
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível concluir a operação.'); }
    finally { setBusy(false); }
  }

  const activeDataset = datasets.find(item => item.id === dataset);
  const availableFilters = useMemo(() => new Set(activeDataset?.filters.map(filter => filter.id) ?? []), [activeDataset]);
  const canRestore = report?.ok === true && report.tables.every(table => table.hashOk && !table.conflict);

  async function exportFile() {
    const result = await api.post<{ envelope: unknown }>('/settings/backup/export', { currentPassword, archivePassword });
    const saved = await saveDownload(new Blob([JSON.stringify(result.data.envelope)], { type: 'application/json' }), `backup-agencia-${new Date().toISOString().slice(0, 10)}.tpbackup`);
    setMessage(saved ? 'Backup criptografado exportado. Guarde a senha do arquivo separadamente.' : 'Download cancelado.');
  }

  async function readFile(file: File | undefined) {
    setReport(null); setEnvelope(null);
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) throw new Error('O arquivo excede o limite de 50 MB.');
    const parsed: unknown = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Arquivo inválido.');
    setEnvelope(parsed);
  }

  async function saveSchedule() {
    await api.put('/settings/backup/schedule', { enabled, dailyTime, timezone, currentPassword });
    await refreshStatus();
    setCurrentPassword('');
    setMessage(enabled ? 'Backup diário agendado.' : 'Backup diário desativado.');
  }

  async function exportSpreadsheet() {
    const filters: Record<string, unknown> = {};
    if (statuses.length) filters.statuses = statuses;
    if (customerId.trim()) filters.customerId = customerId.trim();
    if (sellerId.trim()) filters.sellerId = sellerId.trim();
    if (supplierId.trim()) filters.supplierId = supplierId.trim();
    if (categoryId.trim()) filters.categoryId = categoryId.trim();
    if (search.trim()) filters.search = search.trim();
    const result = await api.downloadPostCsv('/reports/export', { dataset, from, to, columns, filters });
    const saved = await saveDownload(result.blob, result.filename);
    setMessage(saved ? `Planilha gerada: ${result.rows} registro(s).` : 'Download cancelado.');
  }

  async function downloadManaged(runId: string) {
    const result = await api.post<unknown>(`/settings/backup/runs/${runId}/download`, { currentPassword });
    const saved = await saveDownload(new Blob([JSON.stringify(result.data)], { type: 'application/vnd.travel-platform.backup+json' }), `backup-gerenciado-${runId}.tpbackup`);
    setCurrentPassword(''); setMessage(saved ? 'Cópia criptografada baixada. Guarde-a fora do sistema.' : 'Download cancelado.');
  }

  const formatDate = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '—';
  return <section className="space-y-6" aria-label="Backup da agência">
    <div>
      <h2 className="text-lg font-semibold">Backup e exportação de dados</h2>
      <p className="mt-1 text-sm text-slate-600">Proteja os registros da agência e gere planilhas financeiras para conferência ou uso manual.</p>
      <p className="mt-2 text-sm text-amber-800">A confirmação de backup exige a senha atual. Contas com MFA ativo permanecem bloqueadas pelo fluxo de reautenticação atual e precisam de atendimento assistido.</p>
    </div>

    <section className="space-y-4 rounded-xl border border-slate-200 p-4" aria-labelledby="automatic-backup-title">
      <div><h3 id="automatic-backup-title" className="font-semibold">Backup diário gerenciado</h3>
        <p className="mt-1 text-sm text-slate-600">Os arquivos ficam criptografados em armazenamento privado. Você pode baixar uma cópia para guardar fora do sistema. Retenção: {status?.automatic.retentionDays ?? 30} dias, mantendo sempre o backup concluído mais recente.</p>
      </div>
      {status && <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <p>Armazenamento privado: {status.automatic.readiness.storageConfigured ? 'configurado' : 'não configurado'}.</p>
        <p>Chave de criptografia: {status.automatic.readiness.encryptionConfigured ? 'configurada' : 'não configurada'}.</p>
        <p>Agendamento: {status.automatic.enabled ? 'ativo' : 'inativo'} · Próxima execução: {formatDate(status.automatic.nextRunAt)}.</p>
        <p className="mt-2 text-slate-600">A tela confirma a configuração declarada, mas não verifica se o processo do worker está saudável. O primeiro backup concluído no histórico confirma uma execução real.</p>
        {!status.automatic.ready && <p className="mt-2 text-amber-800">O agendamento só poderá ser ativado depois que a equipe técnica configurar armazenamento e criptografia.</p>}
      </div>}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />Ativar backup diário</label>
        <label className="text-sm font-medium">Horário local<Input type="time" value={dailyTime} onChange={event => setDailyTime(event.target.value)} /></label>
        <label className="text-sm font-medium">Fuso horário IANA<Input value={timezone} onChange={event => setTimezone(event.target.value)} placeholder="America/Sao_Paulo" /></label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">Senha atual para agendamento<Input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
        <Button disabled={busy || !currentPassword} onClick={() => void run(saveSchedule)}>Salvar agendamento</Button>
      </div>
      <div>
        <h4 className="font-medium">Histórico de backups</h4>
        {status?.managedRuns.length ? <ul className="mt-2 divide-y divide-slate-200">
          {status.managedRuns.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div><p className="font-medium">{item.scheduledLocalDate} · {item.status === 'SUCCEEDED' ? 'concluído' : item.status === 'FAILED' ? 'falhou' : 'em andamento'}</p>
              <p className="text-slate-600">{item.recordCount ?? '—'} registros · {item.sizeBytes ? `${(item.sizeBytes / 1024 / 1024).toFixed(1)} MB` : '—'} · tentativa {item.attempt}{item.errorCode ? ` · ${item.errorCode}` : ''}</p>
            </div>
            {item.status === 'SUCCEEDED' && <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !currentPassword} onClick={() => void run(() => downloadManaged(item.id))}>Baixar</Button>
              <Button disabled={busy || !currentPassword} onClick={() => void run(async () => {
                const result = await api.post<Verification>(`/settings/backup/runs/${item.id}/verify`, { currentPassword });
                setManagedReport({ runId: item.id, report: result.data }); setMessage('Verificação do backup concluída.');
              })}>Verificar</Button>
            </div>}
          </li>)}
        </ul> : <p className="mt-2 text-sm text-slate-600">Nenhuma execução gerenciada registrada.</p>}
        {managedReport && <div className="mt-3 rounded-lg border border-slate-200 p-3">
          <p>{managedReport.report.ok ? 'Arquivo íntegro.' : 'Arquivo incompatível.'} {managedReport.report.tables.filter(table => table.conflict).length > 0 ? 'Há dados no destino; restauração bloqueada.' : 'Destino sem conflitos.'}</p>
          <Button disabled={busy || !currentPassword || !managedReport.report.ok || managedReport.report.tables.some(table => !table.hashOk || table.conflict)} onClick={() => void run(async () => {
            await api.post(`/settings/backup/runs/${managedReport.runId}/restore`, { currentPassword, reportHash: managedReport.report.reportHash });
            setManagedReport(null); setCurrentPassword(''); await refreshStatus(); setMessage('Restauração concluída e validada.');
          })}>Restaurar backup verificado</Button>
        </div>}
      </div>
    </section>

    <section className="space-y-3 rounded-xl border border-slate-200 p-4" aria-labelledby="spreadsheet-title">
      <div><h3 id="spreadsheet-title" className="font-semibold">Criar planilha</h3>
        <p className="mt-1 text-sm text-slate-600">Selecione a área, o período, as colunas e os filtros. Clientes relacionados aparecem como opção nas vendas e contas financeiras. Os limites são 50 mil linhas e 10 MB por arquivo.</p></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-medium">Área<select className="mt-1 block w-full rounded-md border border-slate-300 p-2" value={dataset} onChange={event => { setDataset(event.target.value); setColumns(DEFAULT_COLUMNS[event.target.value] ?? []); setStatuses([]); }}>
          {datasets.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        <label className="text-sm font-medium">Data inicial<Input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label className="text-sm font-medium">Data final<Input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
      </div>
      <fieldset><legend className="text-sm font-semibold">Colunas</legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {activeDataset?.columns.map(column => <label key={column.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={columns.includes(column.id)} onChange={event => setColumns(current => event.target.checked ? [...current, column.id] : current.filter(id => id !== column.id))} />{column.label}</label>)}
      </div></fieldset>
      {availableFilters.has('statuses') && activeDataset?.filters.find(filter => filter.id === 'statuses')?.options && <fieldset><legend className="text-sm font-semibold">Situação</legend><div className="mt-2 flex flex-wrap gap-3">
        {activeDataset.filters.find(filter => filter.id === 'statuses')!.options!.map(value => <label key={value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={statuses.includes(value)} onChange={event => setStatuses(current => event.target.checked ? [...current, value] : current.filter(item => item !== value))} />{value}</label>)}
      </div></fieldset>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {availableFilters.has('customerId') && <label className="text-sm font-medium">Cliente (ID)<Input value={customerId} onChange={event => setCustomerId(event.target.value)} /></label>}
        {availableFilters.has('sellerId') && <label className="text-sm font-medium">Vendedor (ID)<Input value={sellerId} onChange={event => setSellerId(event.target.value)} /></label>}
        {availableFilters.has('supplierId') && <label className="text-sm font-medium">Fornecedor (ID)<Input value={supplierId} onChange={event => setSupplierId(event.target.value)} /></label>}
        {availableFilters.has('categoryId') && <label className="text-sm font-medium">Categoria (ID)<Input value={categoryId} onChange={event => setCategoryId(event.target.value)} /></label>}
        {availableFilters.has('search') && <label className="text-sm font-medium">Busca por texto<Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome, e-mail ou descrição" /></label>}
      </div>
      <Button disabled={busy || !activeDataset || columns.length === 0 || !from || !to || from > to} onClick={() => void run(exportSpreadsheet)}>Gerar e baixar CSV</Button>
    </section>

    <section className="space-y-3 rounded-xl border border-slate-200 p-4">
      <h3 className="font-semibold">Backup manual e recuperação</h3>
      <p className="text-sm text-slate-600">O arquivo manual é criptografado com uma senha escolhida por você. A restauração só é permitida na mesma agência e quando as tabelas de destino estiverem vazias.</p>
        <label className="text-sm font-medium">Senha atual<Input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Senha do arquivo (12 a 200 caracteres)<Input type="password" autoComplete="off" value={archivePassword} onChange={event => { setArchivePassword(event.target.value); setReport(null); }} /></label>
        <Button disabled={busy || !currentPassword || archivePassword.length < 12} onClick={() => void run(exportFile)}>Exportar e baixar backup manual</Button>
      </div>
      <label className="text-sm font-medium">Arquivo manual para restauração<Input type="file" accept=".tpbackup,.json,application/json" disabled={busy} onChange={event => { const file = event.target.files?.[0]; void run(() => readFile(file)); }} /></label>
      <Button disabled={busy || !envelope || !currentPassword || archivePassword.length < 12} onClick={() => void run(async () => {
        setReport(null);
        const result = await api.post<Verification>('/settings/backup/verify', { envelope, currentPassword, archivePassword });
        setReport(result.data);
      })}>Verificar arquivo manual</Button>
      {report && <div><p>{!report.ok ? 'Arquivo incompatível.' : canRestore ? 'Arquivo validado; destino vazio.' : 'Existem dados no destino. A restauração está bloqueada.'}</p>
        <table className="w-full text-sm"><thead><tr><th>Tabela</th><th>Linhas no arquivo</th><th>Linhas no destino</th></tr></thead><tbody>{report.tables.map(table => <tr key={table.table}><td>{table.table}</td><td>{table.rows}</td><td>{table.existingRows}</td></tr>)}</tbody></table>
        <Button disabled={busy || !canRestore} onClick={() => void run(async () => {
          await api.post('/settings/backup/restore', { envelope, currentPassword, archivePassword, reportHash: report.reportHash });
          setReport(null); setCurrentPassword(''); setArchivePassword(''); setMessage('Restauração concluída e validada.');
        })}>Restaurar dados verificados</Button>
      </div>}
    </section>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
