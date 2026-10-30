import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TenantBackupTab } from './TenantBackupTab';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), downloadPostCsv: vi.fn() } }));
beforeEach(() => {
  const status = { scope: 'CLASSIFIED', automatic: { configured: false, enabled: false, ready: false, dailyTime: '02:00', timezone: 'America/Sao_Paulo', nextRunAt: null, retentionDays: 30, readiness: { storageConfigured: false, encryptionConfigured: false } }, managedRuns: [] };
  const catalog = { datasets: [{ id: 'sales', label: 'Vendas', columns: [
    { id: 'sale_id', label: 'Venda' }, { id: 'customer_name', label: 'Cliente' }, { id: 'total', label: 'Total' }, { id: 'status', label: 'Situação' },
  ], filters: [{ id: 'statuses', options: ['PAID', 'PENDING'] }, { id: 'customerId' }, { id: 'search' }] }] };
  vi.mocked(api.get).mockResolvedValueOnce({ data: status }).mockResolvedValueOnce({ data: catalog }).mockResolvedValue({ data: status });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function fill() {
  fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: 'senha-atual' } });
  fireEvent.change(screen.getByLabelText(/Senha do arquivo/), { target: { value: 'senha-arquivo-separada' } });
  const file = new File(['{}'], 'backup.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve('{"format":"encrypted"}') });
  fireEvent.change(screen.getByLabelText('Arquivo manual para restauração'), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Verificar arquivo manual' }).disabled).toBe(false));
}

describe('TenantBackupTab', () => {
  it('keeps restoration blocked while the destination has data', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { ok: true, reportHash: 'hash', tables: [{ table: 'sales', rows: 1, existingRows: 1, hashOk: true, conflict: true }] } });
    render(<TenantBackupTab />);
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Verificar arquivo manual' }));
    expect(await screen.findByText(/Existem dados no destino/)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Restaurar dados verificados' }).disabled).toBe(true);
  });

  it('restores only after a successful empty-destination verification, reusing step-up credentials', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { ok: true, reportHash: 'reviewed-report', tables: [{ table: 'sales', rows: 1, existingRows: 0, hashOk: true, conflict: false }] } }).mockResolvedValueOnce({ data: { restored: true } });
    render(<TenantBackupTab />);
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Verificar arquivo manual' }));
    await screen.findByText('Arquivo validado; destino vazio.');
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar dados verificados' }));
    expect(await screen.findByText('Restauração concluída e validada.')).toBeTruthy();
    expect(api.post).toHaveBeenLastCalledWith('/settings/backup/restore', {
      envelope: { format: 'encrypted' }, currentPassword: 'senha-atual', archivePassword: 'senha-arquivo-separada', reportHash: 'reviewed-report',
    });
    expect(screen.getByLabelText<HTMLInputElement>('Senha atual').value).toBe('');
  });

  it('exports the encrypted envelope to a downloadable file', async () => {
    const create = vi.fn(() => 'blob:test');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.mocked(api.post).mockResolvedValue({ data: { envelope: { format: 'encrypted' } } });
    render(<TenantBackupTab />);
    fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: 'senha-atual' } });
    fireEvent.change(screen.getByLabelText(/Senha do arquivo/), { target: { value: 'senha-arquivo-separada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Exportar e baixar backup manual' }));
    await screen.findByText(/Backup criptografado exportado/);
    expect(api.post).toHaveBeenCalledWith('/settings/backup/export', { currentPassword: 'senha-atual', archivePassword: 'senha-arquivo-separada' });
    expect(create).toHaveBeenCalled(); expect(click).toHaveBeenCalled(); expect(revoke).toHaveBeenCalledWith('blob:test');
  });

  it('saves a daily schedule with its time zone and step-up password', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { enabled: true } });
    render(<TenantBackupTab />);
    fireEvent.click(screen.getByLabelText('Ativar backup diário'));
    fireEvent.change(screen.getByLabelText('Horário local'), { target: { value: '03:15' } });
    fireEvent.change(screen.getByLabelText('Fuso horário IANA'), { target: { value: 'America/Sao_Paulo' } });
    fireEvent.change(screen.getByLabelText('Senha atual para agendamento'), { target: { value: 'senha-atual' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar agendamento' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/settings/backup/schedule', {
      enabled: true, dailyTime: '03:15', timezone: 'America/Sao_Paulo', currentPassword: 'senha-atual',
    }));
    expect(await screen.findByText('Backup diário agendado.')).toBeTruthy();
  });

  it('sends the chosen date range, columns and filters to the CSV endpoint', async () => {
    vi.mocked(api.downloadPostCsv).mockResolvedValue({ blob: new Blob(['csv']), filename: 'sales.csv', rows: 2 });
    const create = vi.fn(() => 'blob:csv');
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<TenantBackupTab />);
    await screen.findByRole('option', { name: 'Vendas' });
    fireEvent.change(screen.getByLabelText('Busca por texto'), { target: { value: 'Maria' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar e baixar CSV' }));
    await waitFor(() => expect(api.downloadPostCsv).toHaveBeenCalled());
    const [path, payload] = vi.mocked(api.downloadPostCsv).mock.calls[0]!;
    expect(path).toBe('/reports/export');
    expect(payload.dataset).toBe('sales');
    expect(payload.columns).toContain('customer_name');
    expect(payload.filters).toEqual({ search: 'Maria' });
    expect(await screen.findByText('Planilha gerada: 2 registro(s).')).toBeTruthy();
  });
});
