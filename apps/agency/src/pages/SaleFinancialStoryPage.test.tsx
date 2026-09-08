import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SaleFinancialStoryPage } from './SaleFinancialStoryPage';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return {
    ...actual,
    getSaleFinancialStory: vi.fn(),
  };
});

const story = {
  saleId: 'd0d50001-0000-4000-8000-000000000009',
  customerName: 'Mariana Alves Silva',
  tripName: 'Mariana / Cancun',
  grossSale: 18000,
  received: 6000,
  remainingReceivable: 12000,
  totalSupplierPayable: 14000,
  installmentSchedule: [
    { description: 'Entrada Mariana / Cancun', amount: 6000, dueDate: '2026-09-03', status: 'PAID' },
    { description: 'Parcela 2 Mariana / Cancun', amount: 6000, dueDate: '2026-10-03', status: 'OPEN' },
    { description: 'Parcela 3 Mariana / Cancun', amount: 6000, dueDate: '2026-11-03', status: 'OPEN' },
  ],
  supplierPayables: [
    { description: 'Hotel - Grand Palladium Cancun', amount: 7000, dueAt: '2026-09-20', status: 'OPEN' as const },
  ],
  margin: {
    grossSale: 18000,
    supplierCosts: 13300,
    commissionAndFees: 700,
    airCost: 5000,
    landCost: 8300,
    otherCosts: 0,
    grossMargin: 4700,
    netMargin: 4000,
  },
};

describe('SaleFinancialStoryPage', () => {
  it('renders the presenter-safe sale financial story', async () => {
    vi.mocked(api.getSaleFinancialStory).mockResolvedValue(story);

    render(
      <MemoryRouter initialEntries={[`/financial/sales/${story.saleId}/story`]}>
        <Routes>
          <Route path="/financial/sales/:saleId/story" element={<SaleFinancialStoryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Historia financeira - Mariana Alves Silva' })).toBeInTheDocument();
    expect(screen.getByText('Venda bruta')).toBeInTheDocument();
    expect(screen.getAllByText('R$ 18.000,00').length).toBeGreaterThan(0);
    expect(screen.getByText('Recebido')).toBeInTheDocument();
    expect(screen.getAllByText('R$ 6.000,00').length).toBeGreaterThan(0);
    expect(screen.getByText('A receber')).toBeInTheDocument();
    expect(screen.getAllByText('R$ 12.000,00').length).toBeGreaterThan(0);
    expect(screen.getByText('Hotel - Grand Palladium Cancun')).toBeInTheDocument();
    expect(screen.getAllByText('Margem liquida').length).toBeGreaterThan(0);
  });
});
