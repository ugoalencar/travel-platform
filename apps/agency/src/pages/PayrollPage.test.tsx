import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PayrollPage } from './PayrollPage';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return {
    ...actual,
    listEmployees: vi.fn(),
    listCommissionPlans: vi.fn(),
    listCommissions: vi.fn(),
    listPayrollEntries: vi.fn(),
    listEmployeeDeductions: vi.fn(),
    listSales: vi.fn(),
    listSaleCategories: vi.fn(),
    listSuppliers: vi.fn(),
    getCommissionEntryRelease: vi.fn(),
  };
});

const employees = [
  { id: 'employee-ugo', name: 'Ugo Alencar' },
  { id: 'employee-ana', name: 'Ana Martins' },
] as api.Employee[];

const commissions = [
  { id: 'commission-ugo', employeeId: 'employee-ugo', saleId: 'sale-1', calculationBase: 10000, amount: 200, status: 'PENDING' },
  { id: 'commission-ana', employeeId: 'employee-ana', saleId: 'sale-2', calculationBase: 20000, amount: 600, status: 'PENDING' },
] as api.CommissionEntry[];

describe('PayrollPage employee filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listEmployees).mockResolvedValue(employees);
    vi.mocked(api.listCommissionPlans).mockResolvedValue([]);
    vi.mocked(api.listCommissions).mockResolvedValue(commissions);
    vi.mocked(api.listPayrollEntries).mockResolvedValue([]);
    vi.mocked(api.listEmployeeDeductions).mockResolvedValue([]);
    vi.mocked(api.listSales).mockResolvedValue([]);
    vi.mocked(api.listSaleCategories).mockResolvedValue([]);
    vi.mocked(api.listSuppliers).mockResolvedValue([]);
    vi.mocked(api.getCommissionEntryRelease).mockRejectedValue(new Error('not available'));
  });

  it('filters employee commissions by the selected staff member', async () => {
    render(<MemoryRouter><PayrollPage /></MemoryRouter>);

    expect((await screen.findAllByText('Ugo Alencar')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ana Martins').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Acompanhar funcionário'), { target: { value: 'employee-ugo' } });

    const commissionsTable = within(screen.getByRole('table'));
    expect(commissionsTable.getByRole('cell', { name: 'Ugo Alencar' })).toBeInTheDocument();
    expect(commissionsTable.queryByRole('cell', { name: 'Ana Martins' })).not.toBeInTheDocument();
  });
});
