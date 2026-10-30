// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AgencyRevenuePage } from './AgencyRevenuePage';
import * as apiModule from '../lib/api';
import type { SaleCategory, Supplier } from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof apiModule>('../lib/api');
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn() },
    listSuppliers: vi.fn(),
    listSaleCategories: vi.fn(),
  };
});

const get = vi.mocked(apiModule.api.get);
const post = vi.mocked(apiModule.api.post);

const entries = [
  { id: 'e1', status: 'FORECAST', amount: 70, base_amount: 1000, memory: { rate: 7, baseSelector: 'LINE_TOTAL' } },
  { id: 'e2', status: 'PENDING_RULE', amount: 0, base_amount: 0, memory: { reason: 'NO_APPLICABLE_RULE' } },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiModule.listSuppliers).mockResolvedValue([{
    id: 'supplier-1', agencyId: 'agency-1', name: 'Companhia A', supplierType: 'TRAVEL',
    active: true, categories: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  } satisfies Supplier]);
  vi.mocked(apiModule.listSaleCategories).mockResolvedValue([{
    id: 'category-1', name: 'Aéreo', active: true, sortOrder: 1, formRevision: 1,
  } satisfies SaleCategory]);
  get.mockImplementation((path: string) =>
    Promise.resolve({
      data: path === '/agency-revenue/rules'
        ? { rules: [{ id: 'r1', mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL', value: 7, effective_from: '2026-10-24', version_number: 1, entitlement_event: 'ON_FULL_SETTLEMENT', collection_model: 'AGENCY_COLLECTS' }] }
        : { entries, totals: { forecast: 70, entitled: 0, received: 0, pendingRule: 1 }, analysis: { agencyRevenue: 70, employeeCommission: 20, difference: 50 } },
    }),
  );
  post.mockResolvedValue({ data: { entries, locked: [] } });
});

describe('AgencyRevenuePage', () => {
  it('lists the rules with mode, base and value', async () => {
    render(<AgencyRevenuePage />);
    expect(await screen.findByText(/PERCENTAGE/)).toBeInTheDocument();
    expect(screen.getByText(/LINE_TOTAL/)).toBeInTheDocument();
  });

  it('filters the cross-sale revenue entry list by supplier', async () => {
    render(<AgencyRevenuePage />);
    fireEvent.change(await screen.findByLabelText('Fornecedor'), { target: { value: 'supplier-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filtrar entradas' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/agency-revenue/entries?supplierId=supplier-1'));
  });

  it('loads the revenue of a sale and keeps revenue and employee commission separate (analysis only)', async () => {
    render(<AgencyRevenuePage />);
    fireEvent.change(await screen.findByLabelText('ID da venda'), { target: { value: 'sale-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(await screen.findByText(/Pendente de regra/)).toBeInTheDocument();
    expect(screen.getByText(/Receita da agência: /)).toBeInTheDocument();
    expect(screen.getByText(/Comissão do funcionário: /)).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/sales/sale-1/agency-revenue');
  });

  it('calculates revenue for the sale on the server and shows the entries', async () => {
    render(<AgencyRevenuePage />);
    fireEvent.change(await screen.findByLabelText('ID da venda'), { target: { value: 'sale-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular receita' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/sales/sale-1/agency-revenue/calculate'));
  });

  it('shows the server error', async () => {
    post.mockRejectedValue(new apiModule.ApiError('Cannot calculate revenue for a cancelled sale', 'CONFLICT', 409));
    render(<AgencyRevenuePage />);
    fireEvent.change(await screen.findByLabelText('ID da venda'), { target: { value: 'sale-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular receita' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('cancelled');
  });

  it('shows expected 100, received 90 and receipt difference 10 separately from commission', async () => {
    get.mockImplementation((path: string) => Promise.resolve({ data: path === '/agency-revenue/rules' ? { rules: [] } : {
      entries: [{ id: 'received', status: 'RECEIVED', amount: 100, received_amount: 90, base_amount: 1000, memory: {} }],
      totals: { expected: 100, received: 90, difference: 10 },
      analysis: { agencyRevenue: 100, employeeCommission: 20, difference: 80 },
    } }));
    render(<AgencyRevenuePage />);
    fireEvent.change(await screen.findByLabelText('ID da venda'), { target: { value: 'sale-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(await screen.findByText(/Esperado:.*100,00/)).toBeInTheDocument();
    expect(screen.getAllByText(/Recebido:.*90,00/)).toHaveLength(2);
    expect(screen.getByText(/Diferença esperado versus recebido:.*10,00/)).toBeInTheDocument();
    expect(screen.getByText(/Diferença receita versus comissão:.*80,00/)).toBeInTheDocument();
  });

});

vi.mock('../components/sales/RevenueBatchesPanel',()=>({RevenueBatchesPanel:()=>null}));
