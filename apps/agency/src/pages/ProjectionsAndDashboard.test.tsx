import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProjectionsPage } from './ProjectionsPage';
import { DashboardSettingsPage } from './DashboardSettingsPage';
import * as apiModule from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof apiModule>('../lib/api');
  return { ...actual, api: { get: vi.fn(), put: vi.fn(), downloadCsv: vi.fn() } };
});

const get = vi.mocked(apiModule.api.get);
const put = vi.mocked(apiModule.api.put);
const downloadCsv = vi.mocked(apiModule.api.downloadCsv);

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  get.mockImplementation((path: string) => {
    const data = path.startsWith('/reports/receivables-projection')
      ? { late: { count: 1, openBalance: 300 }, byMonth: [{ month: '2026-11', openBalance: 500, count: 1 }], totalOpen: 800 }
      : path.startsWith('/reports/revenue-forecast')
        ? { contracted: { total: 100 }, projected: { total: 40, byMonth: [] }, undefined: { total: 10 }, grandTotal: 150 }
        : path.startsWith('/reports/supplier-balances')
          ? { rows: [{ supplierId: 'sup-1', expected: 100, received: 90, difference: 10 }] }
          : path.startsWith('/reports/commissions-projection')
            ? { forecast: 1000, released: 300, paid: 100, releasedNotPaid: 200, notYetReleased: 700 }
            : { version: 3, widgets: [{ key: 'a', title: 'Painel A', enabled: true }, { key: 'b', title: 'Painel B', enabled: false }] };
    return Promise.resolve({ data });
  });
});

describe('ProjectionsPage', () => {
  it('shows the four reports apart and never a combined total', async () => {
    render(<ProjectionsPage />);
    expect(await screen.findByText(/Em atraso:/)).toBeInTheDocument();
    expect(screen.getByText(/Contratada:/)).toBeInTheDocument();
    expect(screen.getByText(/Receita da agência — esperada:/)).toBeInTheDocument();
    expect(screen.getByText(/Liberada e não paga:/)).toBeInTheDocument();
    expect(screen.queryByText(/Total geral/i)).not.toBeInTheDocument();
  });

  it('sends the filters to every report and to the CSV export', async () => {
    downloadCsv.mockResolvedValue({ blob: new Blob(['x']), filename: 'recebiveis-projecao.csv' });
    render(<ProjectionsPage />);
    fireEvent.change(await screen.findByLabelText('Destino'), { target: { value: 'Gramado' } });
    await waitFor(() => expect(get).toHaveBeenCalledWith('/reports/receivables-projection?destination=Gramado'));
    expect(get).toHaveBeenCalledWith('/reports/commissions-projection?destination=Gramado');
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV (recebíveis)' }));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledWith('/reports/receivables-projection?destination=Gramado'));
  });

  it('shows a load error without crashing', async () => {
    get.mockRejectedValue(new Error('Sem permissão'));
    render(<ProjectionsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão');
  });
});

describe('DashboardSettingsPage', () => {
  it('saves order and visibility with the loaded version, only key and enabled', async () => {
    put.mockResolvedValue({ data: { version: 4, widgets: [{ key: 'b', title: 'Painel B', enabled: false }, { key: 'a', title: 'Painel A', enabled: true }] } });
    render(<DashboardSettingsPage />);
    fireEvent.click(await screen.findByLabelText('Descer Painel A'));
    fireEvent.click(screen.getByLabelText('Painel B: habilitado'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar layout' }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/settings/dashboard', {
        version: 3,
        widgets: [{ key: 'b', enabled: true }, { key: 'a', enabled: true }],
      }),
    );
    expect(await screen.findByText('Layout salvo.')).toBeInTheDocument();
  });

  it('shows the conflict error and keeps the choices', async () => {
    put.mockRejectedValue(new apiModule.ApiError('The dashboard layout was changed by someone else', 'CONFLICT', 409));
    render(<DashboardSettingsPage />);
    fireEvent.click(await screen.findByLabelText('Painel A: habilitado'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar layout' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed by someone else');
    expect(screen.getByLabelText('Painel A: habilitado')).not.toBeChecked();
  });

  it('does not offer saving when the layout could not be loaded', async () => {
    get.mockRejectedValue(new Error('offline'));
    render(<DashboardSettingsPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar layout' })).toBeDisabled();
  });
});
