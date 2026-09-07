import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FinancialPage } from './FinancialPage';
import { PayablesPage } from './PayablesPage';
import { OperationalCostsPage } from './OperationalCostsPage';
import { SaleMarginPage } from './SaleMarginPage';
import {
  getFinancialDashboard,
  listReceivables,
  listPayables,
  listOperationalCosts,
  getSaleMargin,
  listAllocationsForTarget,
  ApiError,
} from '../lib/api';
import type { CashFlowSummary, Receivable, Payable, OperationalCost, SaleMargin } from '../types/financial';

vi.mock('../lib/api', () => {
  class MockApiError extends Error {
    code: string;
    status: number;
    constructor(message: string, code: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    getFinancialDashboard: vi.fn(),
    listReceivables: vi.fn().mockResolvedValue([]),
    listPayables: vi.fn().mockResolvedValue([]),
    listPayments: vi.fn().mockResolvedValue([]),
    listPaymentAllocations: vi.fn().mockResolvedValue([]),
    listAllocationsForTarget: vi.fn().mockResolvedValue([]),
    listOperationalCosts: vi.fn().mockResolvedValue([]),
    getSaleMargin: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockCashFlow: CashFlowSummary = {
  projected: { receivablesDue: 5000, payablesDue: 2000, balance: 3000 },
  realized: { paymentsIn: 8000, paymentsOut: 3500, balance: 4500 },
};

const mockReceivable: Receivable = {
  id: 'rec1',
  agencyId: 'a1',
  saleId: 'sale1',
  customerId: 'cust1',
  description: 'Pacote Cancun',
  amount: 1000,
  paidAmount: 0,
  remainingAmount: 1000,
  dueAt: '2026-09-15',
  status: 'OPEN',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockReceivablePartial: Receivable = {
  ...mockReceivable,
  id: 'rec2',
  description: 'Pacote Bali',
  status: 'PARTIALLY_PAID',
  amount: 2000,
};

const mockPayable: Payable = {
  id: 'pay1',
  agencyId: 'a1',
  saleId: 'sale1',
  supplierId: 'sup1',
  commissionId: null,
  transportOperationId: null,
  operationalCostId: null,
  description: 'Hotel Fornecedor',
  amount: 800,
  dueAt: '2026-09-20',
  status: 'OPEN',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockOperationalCost: OperationalCost = {
  id: 'oc1',
  agencyId: 'a1',
  saleId: 'sale1',
  transportOperationId: null,
  supplierId: null,
  description: 'Taxa airport',
  costType: 'TRANSPORT',
  expectedAmount: 150,
  actualAmount: 160,
  incurredAt: '2026-08-01',
  createdBy: 'user1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockMargin: SaleMargin = {
  saleId: 'sale1',
  revenue: 10000,
  supplierCosts: 4000,
  operationalCosts: 1500,
  commission: 1000,
  margin: 3500,
};

function renderPage(component: React.ReactNode, initialEntries: string[] = ['/financial']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/financial" element={component} />
        <Route path="/financial/payables" element={<PayablesPage />} />
        <Route path="/financial/operational-costs" element={<OperationalCostsPage />} />
        <Route path="/financial/sales/:saleId/margin" element={<SaleMarginPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FinancialPage', () => {
  it('renders loading state', () => {
    vi.mocked(getFinancialDashboard).mockReturnValue(new Promise(() => {}));
    vi.mocked(listReceivables).mockReturnValue(new Promise(() => {}));
    renderPage(<FinancialPage />);
    expect(screen.getByText('Carregando financeiro...')).toBeInTheDocument();
  });

  it('renders error state', async () => {
    vi.mocked(getFinancialDashboard).mockRejectedValue(
      new ApiError('Server error', 'SERVER_ERROR', 500),
    );
    vi.mocked(listReceivables).mockResolvedValue([]);
    renderPage(<FinancialPage />);
    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });

  it('renders dashboard cards with human-readable currency', async () => {
    vi.mocked(getFinancialDashboard).mockResolvedValue(mockCashFlow);
    vi.mocked(listReceivables).mockResolvedValue([]);
    renderPage(<FinancialPage />);
    await waitFor(() => {
      expect(screen.getByText('A receber')).toBeInTheDocument();
    });
    expect(screen.getByText('R$ 5.000,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 8.000,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 4.500,00')).toBeInTheDocument();
  });

  it('renders receivables with human-readable values, no raw UUID', async () => {
    vi.mocked(getFinancialDashboard).mockResolvedValue(mockCashFlow);
    vi.mocked(listReceivables).mockResolvedValue([mockReceivable]);
    renderPage(<FinancialPage />);
    await waitFor(() => {
      expect(screen.getByText('Pacote Cancun')).toBeInTheDocument();
    });
    expect(screen.getByText('R$ 1.000,00')).toBeInTheDocument();
    expect(screen.getByText('Aberto')).toBeInTheDocument();
  });

  it('shows overdue alert for past-due receivables', async () => {
    const overdue: Receivable = {
      ...mockReceivable,
      dueAt: '2025-01-01',
    };
    vi.mocked(getFinancialDashboard).mockResolvedValue(mockCashFlow);
    vi.mocked(listReceivables).mockResolvedValue([overdue]);
    renderPage(<FinancialPage />);
    await waitFor(() => {
      expect(screen.getByText(/recebível\(is\) vencido\(s\)/)).toBeInTheDocument();
    });
  });

  it('shows empty state when no receivables', async () => {
    vi.mocked(getFinancialDashboard).mockResolvedValue(mockCashFlow);
    vi.mocked(listReceivables).mockResolvedValue([]);
    renderPage(<FinancialPage />);
    await waitFor(() => {
      expect(screen.getByText('Nenhum recebível encontrado.')).toBeInTheDocument();
    });
  });

  it('shows partial payment detail when clicking PARTIALLY_PAID receivable', async () => {
    vi.mocked(getFinancialDashboard).mockResolvedValue(mockCashFlow);
    vi.mocked(listReceivables).mockResolvedValue([mockReceivablePartial]);
    vi.mocked(listAllocationsForTarget).mockResolvedValue([
      {
        id: 'alloc1',
        agencyId: 'a1',
        paymentId: 'p1',
        receivableId: 'rec2',
        payableId: null,
        amount: 500,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    renderPage(<FinancialPage />);
    await waitFor(() => {
      expect(screen.getByText('Pacote Bali')).toBeInTheDocument();
    });
    screen.getByText('Pacote Bali').closest('tr')!.click();
    await waitFor(() => {
      expect(screen.getByText('Valor original:')).toBeInTheDocument();
      expect(screen.getByText('Já pago:')).toBeInTheDocument();
      expect(screen.getByText('Saldo restante:')).toBeInTheDocument();
    });
    expect(screen.getAllByText('R$ 2.000,00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('R$ 500,00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('R$ 1.500,00').length).toBeGreaterThanOrEqual(1);
  });
});

describe('PayablesPage', () => {
  it('renders loading state', () => {
    vi.mocked(listPayables).mockReturnValue(new Promise(() => {}));
    renderPage(<PayablesPage />, ['/financial/payables']);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('renders error state', async () => {
    vi.mocked(listPayables).mockRejectedValue(
      new ApiError('Network error', 'NETWORK_ERROR', 0),
    );
    renderPage(<PayablesPage />, ['/financial/payables']);
    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });

  it('renders payables with human-readable values', async () => {
    vi.mocked(listPayables).mockResolvedValue([mockPayable]);
    renderPage(<PayablesPage />, ['/financial/payables']);
    await waitFor(() => {
      expect(screen.getByText('Hotel Fornecedor')).toBeInTheDocument();
    });
    expect(screen.getByText('R$ 800,00')).toBeInTheDocument();
    expect(screen.getAllByText('Aberto').length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state', async () => {
    vi.mocked(listPayables).mockResolvedValue([]);
    renderPage(<PayablesPage />, ['/financial/payables']);
    await waitFor(() => {
      expect(screen.getByText('Nenhuma conta a pagar encontrada.')).toBeInTheDocument();
    });
  });

  it('filters by status', async () => {
    vi.mocked(listPayables).mockResolvedValue([mockPayable]);
    renderPage(<PayablesPage />, ['/financial/payables']);
    await waitFor(() => {
      expect(screen.getByText('Hotel Fornecedor')).toBeInTheDocument();
    });
    const paidFilter = screen.getByRole('button', { name: 'Pago' });
    paidFilter.click();
    await waitFor(() => {
      expect(screen.getByText('Nenhuma conta a pagar encontrada.')).toBeInTheDocument();
    });
  });

  it('shows partial payment detail for PARTIALLY_PAID payable', async () => {
    const partialPayable: Payable = { ...mockPayable, id: 'pay2', status: 'PARTIALLY_PAID', amount: 1000 };
    vi.mocked(listPayables).mockResolvedValue([partialPayable]);
    vi.mocked(listAllocationsForTarget).mockResolvedValue([
      {
        id: 'alloc1',
        agencyId: 'a1',
        paymentId: 'p1',
        receivableId: null,
        payableId: 'pay2',
        amount: 400,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    renderPage(<PayablesPage />, ['/financial/payables']);
    await waitFor(() => {
      expect(screen.getByText('Hotel Fornecedor')).toBeInTheDocument();
    });
    screen.getByText('Hotel Fornecedor').closest('tr')!.click();
    await waitFor(() => {
      expect(screen.getByText('Valor original:')).toBeInTheDocument();
    });
    expect(screen.getAllByText('R$ 1.000,00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('R$ 400,00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('R$ 600,00').length).toBeGreaterThanOrEqual(1);
  });
});

describe('OperationalCostsPage', () => {
  it('renders loading state', () => {
    vi.mocked(listOperationalCosts).mockReturnValue(new Promise(() => {}));
    renderPage(<OperationalCostsPage />, ['/financial/operational-costs']);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('renders error state', async () => {
    vi.mocked(listOperationalCosts).mockRejectedValue(
      new ApiError('DB error', 'DB_ERROR', 500),
    );
    renderPage(<OperationalCostsPage />, ['/financial/operational-costs']);
    expect(await screen.findByText('DB error')).toBeInTheDocument();
  });

  it('renders costs with human-readable values', async () => {
    vi.mocked(listOperationalCosts).mockResolvedValue([mockOperationalCost]);
    renderPage(<OperationalCostsPage />, ['/financial/operational-costs']);
    await waitFor(() => {
      expect(screen.getByText('Taxa airport')).toBeInTheDocument();
    });
    expect(screen.getByText('Transporte')).toBeInTheDocument();
    expect(screen.getByText('R$ 150,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 160,00')).toBeInTheDocument();
  });

  it('shows empty state', async () => {
    vi.mocked(listOperationalCosts).mockResolvedValue([]);
    renderPage(<OperationalCostsPage />, ['/financial/operational-costs']);
    await waitFor(() => {
      expect(screen.getByText('Nenhum custo operacional encontrado.')).toBeInTheDocument();
    });
  });
});

describe('SaleMarginPage', () => {
  it('renders loading state', () => {
    vi.mocked(getSaleMargin).mockReturnValue(new Promise(() => {}));
    renderPage(<SaleMarginPage />, ['/financial/sales/sale1/margin']);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('renders error state', async () => {
    vi.mocked(getSaleMargin).mockRejectedValue(
      new ApiError('Sale not found', 'NOT_FOUND', 404),
    );
    renderPage(<SaleMarginPage />, ['/financial/sales/sale1/margin']);
    expect(await screen.findByText('Sale not found')).toBeInTheDocument();
  });

  it('renders margin detail with human-readable values', async () => {
    vi.mocked(getSaleMargin).mockResolvedValue(mockMargin);
    renderPage(<SaleMarginPage />, ['/financial/sales/sale1/margin']);
    await waitFor(() => {
      expect(screen.getByText('Margem da venda')).toBeInTheDocument();
    });
    expect(screen.getByText('Receita')).toBeInTheDocument();
    expect(screen.getByText('R$ 10.000,00')).toBeInTheDocument();
    expect(screen.getByText('Custos com fornecedores')).toBeInTheDocument();
    expect(screen.getByText('-R$ 4.000,00')).toBeInTheDocument();
    expect(screen.getByText('Margem')).toBeInTheDocument();
    expect(screen.getByText('R$ 3.500,00')).toBeInTheDocument();
    expect(screen.getByText('(35.0%)')).toBeInTheDocument();
  });

  it('shows sale ID', async () => {
    vi.mocked(getSaleMargin).mockResolvedValue(mockMargin);
    renderPage(<SaleMarginPage />, ['/financial/sales/sale1/margin']);
    await waitFor(() => {
      expect(screen.getByText('Venda: sale1')).toBeInTheDocument();
    });
  });
});
