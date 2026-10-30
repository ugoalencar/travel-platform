/* eslint-disable @typescript-eslint/no-unsafe-return -- mocked module factory */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ApiCall = (path: string) => Promise<unknown>;
const apiMock = vi.fn<ApiCall>();
const apiCsvMock = vi.fn<(path: string) => Promise<Blob>>();
const downloadMock = vi.fn();
let granted: string[] = [];

vi.mock('./api', () => ({
  api: (path: string) => apiMock(path),
  apiCsv: (path: string) => apiCsvMock(path),
  downloadBlob: (blob: Blob, filename: string) => downloadMock(blob, filename),
}));
vi.mock('./auth', () => ({ useCan: (...anyOf: string[]) => anyOf.some((permission) => granted.includes(permission)) }));

import { ProjectionsPage } from './pages/ProjectionsPage';

beforeEach(() => {
  vi.clearAllMocks();
  granted = ['reports.finance', 'revenue.read_all'];
  apiMock.mockImplementation((path) => {
    if (path.startsWith('/reports/receivables-projection')) {
      return Promise.resolve({ late: { count: 1, openBalance: 300 }, byMonth: [{ month: '2026-11', openBalance: 500, count: 1 }], totalOpen: 800 });
    }
    if (path.startsWith('/reports/revenue-forecast')) {
      return Promise.resolve({ contracted: { total: 100 }, projected: { total: 40 }, undefined: { total: 10 } });
    }
    return Promise.resolve({ rows: [{ supplierId: 'sup-1', expected: 100, received: 90, difference: 10 }] });
  });
  apiCsvMock.mockResolvedValue(new Blob(['x']));
});

describe('Lite ProjectionsPage', () => {
  it('shows the reports apart, never a combined total', async () => {
    render(<ProjectionsPage />);
    expect(await screen.findByText(/Em atraso:/)).toBeInTheDocument();
    expect(screen.getByText(/Contratada:/)).toBeInTheDocument();
    expect(screen.getByText(/esperado/)).toBeInTheDocument();
    expect(screen.queryByText(/Total geral/i)).not.toBeInTheDocument();
  });

  it('only loads what the permissions allow', async () => {
    granted = ['reports.finance'];
    render(<ProjectionsPage />);
    await screen.findByText(/Em atraso:/);
    expect(apiMock).not.toHaveBeenCalledWith(expect.stringContaining('/reports/revenue-forecast'));
    expect(screen.queryByText(/Contratada:/)).not.toBeInTheDocument();
  });

  it('sends the filters to the reports and to the CSV export', async () => {
    render(<ProjectionsPage />);
    fireEvent.change(await screen.findByLabelText('Destino'), { target: { value: 'Gramado' } });
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/reports/receivables-projection?destination=Gramado'));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV (recebíveis)' }));
    await waitFor(() => expect(apiCsvMock).toHaveBeenCalledWith('/reports/receivables-projection?destination=Gramado&format=csv'));
    expect(downloadMock).toHaveBeenCalled();
  });

  it('shows a load error', async () => {
    apiMock.mockRejectedValue(new Error('Sem permissão'));
    render(<ProjectionsPage />);
    expect(await screen.findByText(/Sem permissão/)).toBeInTheDocument();
  });
});
