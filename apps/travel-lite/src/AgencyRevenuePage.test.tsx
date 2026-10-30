import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ApiCall = (path: string, options?: { method?: string; body?: unknown }) => Promise<unknown>;
const apiMock = vi.fn<ApiCall>();
let granted: string[] = [];

vi.mock('./api', () => ({ api: (path: string, options?: { method?: string; body?: unknown }) => apiMock(path, options) }));
vi.mock('./auth', () => ({ useCan: (...anyOf: string[]) => anyOf.some((permission) => granted.includes(permission)) }));

import { AgencyRevenuePage } from './pages/AgencyRevenuePage';

const revenue = {
  entries: [
    { id: 'e1', status: 'FORECAST', amount: 70, base_amount: 1000 },
    { id: 'e2', status: 'PENDING_RULE', amount: 0, base_amount: 0 },
  ],
  analysis: { agency_revenue: 70, seller_commission: 20, difference: 50 },
};

beforeEach(() => {
  apiMock.mockReset();
  granted = ['revenue.read_all'];
  apiMock.mockImplementation((path) => {
    if (path === '/agency-revenue/rules') {
      return Promise.resolve({ rules: [{ id: 'r1', mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL', value: 7, effective_from: '2026-10-24', version_number: 1, collection_model: 'AGENCY_COLLECTS' }] });
    }
    return Promise.resolve(revenue);
  });
});

describe('Lite AgencyRevenuePage', () => {
  it('lists rules and shows the sale revenue apart from the seller commission', async () => {
    render(<AgencyRevenuePage />);
    expect(await screen.findByText(/PERCENTAGE/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('ID da venda'), { target: { value: 'sale-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(await screen.findByText(/Pendente de regra/)).toBeInTheDocument();
    expect(screen.getByText(/Receita da agência: /)).toBeInTheDocument();
    expect(screen.getByText(/Comissão do vendedor: /)).toBeInTheDocument();
  });

  it('offers calculation only with the manage/receive permission', async () => {
    const { unmount } = render(<AgencyRevenuePage />);
    await screen.findByText(/PERCENTAGE/);
    expect(screen.queryByRole('button', { name: 'Calcular receita' })).not.toBeInTheDocument();
    unmount();
    granted = ['revenue.read_all', 'revenue.rules_manage'];
    render(<AgencyRevenuePage />);
    fireEvent.change(await screen.findByLabelText('ID da venda'), { target: { value: 'sale-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular receita' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/sales/sale-1/agency-revenue/calculate', { method: 'POST' }));
  });

  it('shows the server error', async () => {
    granted = ['revenue.read_all', 'revenue.rules_manage'];
    render(<AgencyRevenuePage />);
    fireEvent.change(await screen.findByLabelText('ID da venda'), { target: { value: 'sale-1' } });
    apiMock.mockRejectedValueOnce(new Error('Cannot calculate revenue for a cancelled sale'));
    fireEvent.click(screen.getByRole('button', { name: 'Calcular receita' }));
    expect(await screen.findByText(/cancelled/)).toBeInTheDocument();
  });

  it('shows expected 100, received 90 and receipt difference 10 separately from commission', async () => {
    apiMock.mockImplementation((path) => Promise.resolve(path === '/agency-revenue/rules' ? { rules: [] } : {
      entries: [{ id: 'received', status: 'RECEIVED', amount: 100, received_amount: 90, base_amount: 1000 }],
      totals: { expected: 100, received: 90, difference: 10 },
      analysis: { agency_revenue: 100, seller_commission: 20, difference: 80 },
    }));
    render(<AgencyRevenuePage />);
    fireEvent.change(await screen.findByLabelText('ID da venda'), { target: { value: 'sale-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(await screen.findByText(/Esperado:.*100,00/)).toBeInTheDocument();
    expect(screen.getByText(/Recebido:.*90,00/)).toBeInTheDocument();
    expect(screen.getByText(/Diferença esperado versus recebido:.*10,00/)).toBeInTheDocument();
    expect(screen.getByText(/Diferença receita versus comissão:.*80,00/)).toBeInTheDocument();
  });

});
