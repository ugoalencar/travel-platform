import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReportsPage } from './ReportsPage';
import * as apiModule from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof apiModule>('../lib/api');
  return { ...actual, api: { get: vi.fn(), downloadCsv: vi.fn() } };
});

const get = vi.mocked(apiModule.api.get);
const downloadCsv = vi.mocked(apiModule.api.downloadCsv);

const createObjectURL = vi.fn(() => 'blob:report');
const revokeObjectURL = vi.fn();
let clicked: Array<{ href: string; download: string }> = [];

beforeEach(() => {
  vi.clearAllMocks();
  clicked = [];
  get.mockImplementation((path: string) =>
    Promise.resolve({
      data: path.startsWith('/reports/')
        ? { rows: [{ key: 'k1', label: 'Linha', count: 1, total: 10 }] }
        : {},
    }),
  );
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
    clicked.push({ href: this.href, download: this.download });
  });
});
afterEach(() => vi.restoreAllMocks());

async function renderReports() {
  render(<ReportsPage />);
  const button = await screen.findByRole('button', { name: 'Exportar CSV' });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe('ReportsPage - CSV export of management reports', () => {
  it('exports the sales view the table is showing and downloads it as a blob', async () => {
    const blob = new Blob(['a,b'], { type: 'text/csv' });
    downloadCsv.mockResolvedValue({ blob, filename: 'vendas-period.csv' });
    const button = await renderReports();

    fireEvent.click(button);

    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(downloadCsv).toHaveBeenCalledWith('/reports/sales?groupBy=period');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked[0]).toMatchObject({ download: 'vendas-period.csv' });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:report');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('keeps the selected tab and grouping in the exported path', async () => {
    downloadCsv.mockResolvedValue({ blob: new Blob(['x']), filename: 'personnel.csv' });
    const button = await renderReports();

    fireEvent.click(screen.getByRole('button', { name: 'Pessoal' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/reports/personnel?groupBy=employee'));
    fireEvent.change(screen.getByDisplayValue('Por colaborador'), { target: { value: 'month' } });
    await waitFor(() => expect(get).toHaveBeenCalledWith('/reports/personnel?groupBy=month'));
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    await waitFor(() => expect(downloadCsv).toHaveBeenCalledWith('/reports/personnel?groupBy=month'));
  });

  it('exports the selected financial report', async () => {
    downloadCsv.mockResolvedValue({ blob: new Blob(['x']), filename: 'payables-aging.csv' });
    const button = await renderReports();

    fireEvent.click(screen.getByRole('button', { name: 'Financeiro' }));
    fireEvent.change(screen.getByDisplayValue('Aging de recebíveis'), {
      target: { value: 'payables-aging' },
    });
    await waitFor(() => expect(get).toHaveBeenCalledWith('/reports/financial/payables-aging'));
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    await waitFor(() => expect(downloadCsv).toHaveBeenCalledWith('/reports/financial/payables-aging'));
  });

  it('shows a clear error and creates no file when the export is refused', async () => {
    downloadCsv.mockRejectedValue(
      new apiModule.ApiError('O relatório excede o limite de exportação.', 'REPORT_TOO_LARGE', 422),
    );
    const button = await renderReports();

    fireEvent.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent('O relatório excede o limite de exportação.');
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clicked).toHaveLength(0);
    expect(button).toBeEnabled();
    // The table is still there: a failed export does not blank the report.
    expect(screen.getByText('Linha')).toBeInTheDocument();
  });

  it('prevents a second export while one is running', async () => {
    let finish: (value: { blob: Blob; filename: string }) => void = () => undefined;
    downloadCsv.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const button = await renderReports();

    fireEvent.click(button);
    expect(await screen.findByRole('button', { name: 'Exportando...' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Exportando...' }));
    expect(downloadCsv).toHaveBeenCalledTimes(1);

    finish({ blob: new Blob(['x']), filename: 'vendas-period.csv' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeEnabled());
  });
});
