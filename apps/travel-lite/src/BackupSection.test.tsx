import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ allowed: true, api: vi.fn(), download: vi.fn() }));
vi.mock('./auth', () => ({ useAuth: () => ({ user: { role: mocks.allowed ? 'MASTER' : 'SELLER' } }) }));
vi.mock('./api', () => ({ api: mocks.api, downloadBlob: mocks.download }));
import { BackupSection } from './pages/BackupSection';
beforeEach(() => {
  mocks.allowed = true; mocks.api.mockReset(); mocks.download.mockReset();
  mocks.api.mockResolvedValue({ automatic: { configured: false }, history: [] });
});
describe('Settings backup section', () => {
  it('hides backup from employees without making privileged requests', () => {
    mocks.allowed = false; render(<BackupSection />);
    expect(screen.queryByRole('heading', { name: /^Backup$/ })).not.toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it('shows the actual unconfigured daily status, not a fake success', async () => {
    render(<BackupSection />);
    expect(await screen.findByText('Não configurado')).toBeInTheDocument();
    expect(screen.getByText('Nenhum backup gerado por esta área.')).toBeInTheDocument();
  });
  it('exports an encrypted archive and clears passwords on success', async () => {
    render(<BackupSection />); await screen.findByText('Não configurado');
    mocks.api.mockImplementation((url: string) => Promise.resolve(url === '/backup/export' ? { archive: { data: 'cipher' }, filename: 'demo.tlbackup' } : { automatic: { configured: false }, history: [] }));
    fireEvent.change(screen.getByLabelText('Sua senha atual'), { target: { value: 'Current-password-123' } });
    fireEvent.change(screen.getByLabelText('Senha do arquivo'), { target: { value: 'Archive-password-123' } });
    fireEvent.change(screen.getByLabelText('Confirme a senha do arquivo'), { target: { value: 'Archive-password-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar backup criptografado' }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledWith(expect.any(Blob), 'demo.tlbackup'));
    expect(screen.getByLabelText('Sua senha atual')).toHaveValue('');
    expect(screen.getByLabelText('Senha do arquivo')).toHaveValue('');
  });
});
