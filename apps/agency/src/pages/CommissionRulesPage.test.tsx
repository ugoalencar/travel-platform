import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CommissionRulesPage } from './CommissionRulesPage';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    listCommissionRuleScopes: vi.fn(),
    createCommissionRuleScope: vi.fn(),
    reviseCommissionRuleScope: vi.fn(),
    getCommissionEngineSettings: vi.fn(),
    saveCommissionEngineSettings: vi.fn(),
    listEmployees: vi.fn(),
    listSaleCategories: vi.fn(),
    listSuppliers: vi.fn(),
  };
});

const scope = {
  id: 's1', employeeId: 'e1', supplierId: null, categoryId: null, status: 'ACTIVE',
  versions: [
    { id: 'v1', versionNumber: 1, effectiveFrom: '2026-11-01', mode: 'PERCENTAGE', calculationMetric: 'GROSS', value: 3, applyOn: 'TOTAL', excessThreshold: null, progressive: false, reason: null, tiers: [], tierMode: 'MARGINAL', state: 'SUPERSEDED', isEffective: false, supersededByVersionId: 'v2', effectiveUntil: null },
    { id: 'v2', versionNumber: 2, effectiveFrom: '2026-11-01', mode: 'PERCENTAGE', calculationMetric: 'GROSS', value: 5, applyOn: 'TOTAL', excessThreshold: null, progressive: false, reason: 'ajuste', tiers: [], tierMode: 'MARGINAL', state: 'SCHEDULED', isEffective: false, supersededByVersionId: null, effectiveUntil: null },
  ],
};

function arrange() {
  vi.mocked(api.listCommissionRuleScopes).mockResolvedValue([scope] as never);
  vi.mocked(api.getCommissionEngineSettings).mockResolvedValue({ cutoverDate: null });
  vi.mocked(api.listEmployees).mockResolvedValue([{ id: 'e1', name: 'Ana' }] as never);
  vi.mocked(api.listSaleCategories).mockResolvedValue([{ id: 'c1', name: 'Aéreo', active: true, sortOrder: 0, formRevision: 0 }]);
  vi.mocked(api.listSuppliers).mockResolvedValue([]);
  vi.mocked(api.createCommissionRuleScope).mockResolvedValue({ scopeId: 's2', versionId: 'v9' });
}
const renderPage = () => render(<MemoryRouter><CommissionRulesPage /></MemoryRouter>);

describe('CommissionRulesPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('lists scopes with every revision and marks the superseded one', async () => {
    arrange();
    renderPage();
    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.getByText(/v1 .*substituída pela v2/)).toBeInTheDocument();
    expect(screen.getByText(/v2 .*agendada/)).toBeInTheDocument();
  });

  it('creates a progressive scope with the tier editor (rows, not free text)', async () => {
    arrange();
    renderPage();
    await screen.findByText('Ana');
    fireEvent.change(screen.getByLabelText('Funcionário'), { target: { value: 'e1' } });
    fireEvent.change(screen.getByLabelText('Vigência a partir de'), { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByLabelText('Progressiva por faixas'));
    expect(document.querySelector('textarea')).toBeNull();
    fireEvent.change(screen.getByLabelText('Até (R$) da faixa 1'), { target: { value: '50000' } });
    fireEvent.change(screen.getByLabelText('Percentual (%) da faixa 1'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Percentual (%) da faixa 2'), { target: { value: '4,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar regra' }));
    await waitFor(() =>
      expect(api.createCommissionRuleScope).toHaveBeenCalledWith({
        employeeId: 'e1',
        supplierId: null,
        categoryId: null,
        version: {
          effectiveFrom: '2026-12-01', mode: 'PERCENTAGE', calculationMetric: 'GROSS', progressive: true, tierMode: 'MARGINAL', applyOn: 'TOTAL',
          releaseAfterSupplierPayment: false,
          tiers: [{ fromAmount: 0, toAmount: 50000, rate: 3 }, { fromAmount: 50000, toAmount: null, rate: 4.5 }],
        },
      }),
    );
  });

  it('adds and removes tiers, and refuses a ladder that does not grow', async () => {
    arrange();
    renderPage();
    await screen.findByText('Ana');
    fireEvent.change(screen.getByLabelText('Vigência a partir de'), { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByLabelText('Progressiva por faixas'));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar faixa' }));
    expect(screen.getByLabelText('Percentual (%) da faixa 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remover faixa 3' }));
    expect(screen.queryByLabelText('Percentual (%) da faixa 3')).toBeNull();
    fireEvent.change(screen.getByLabelText('Até (R$) da faixa 1'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Percentual (%) da faixa 1'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Percentual (%) da faixa 2'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar regra' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Faixa 1');
    expect(api.createCommissionRuleScope).not.toHaveBeenCalled();
  });

  it('creates a fixed rule and an excess rule from the same form', async () => {
    arrange();
    renderPage();
    await screen.findByText('Ana');
    fireEvent.change(screen.getByLabelText('Vigência a partir de'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('Aplicação'), { target: { value: 'EXCESS' } });
    fireEvent.change(screen.getByLabelText('Excedente acima de (R$)'), { target: { value: '10000' } });
    fireEvent.change(screen.getByLabelText('Percentual (%)'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar regra' }));
    await waitFor(() =>
      expect(api.createCommissionRuleScope).toHaveBeenCalledWith({
        employeeId: null, supplierId: null, categoryId: null,
        version: { effectiveFrom: '2026-12-01', mode: 'PERCENTAGE', calculationMetric: 'GROSS', value: 5, applyOn: 'EXCESS', excessThreshold: 10000, releaseAfterSupplierPayment: false },
      }),
    );
  });

  it('revises an existing scope and requires the reason', async () => {
    arrange();
    vi.mocked(api.reviseCommissionRuleScope).mockResolvedValue({ versionId: 'v3' });
    renderPage();
    await screen.findByText('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Nova revisão' }));
    fireEvent.change(screen.getAllByLabelText('Vigência a partir de')[1]!, { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getAllByLabelText('Percentual (%)')[1]!, { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('motivo');
    fireEvent.change(screen.getByLabelText('Motivo da revisão'), { target: { value: 'meta nova' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
    await waitFor(() =>
      expect(api.reviseCommissionRuleScope).toHaveBeenCalledWith('s1', {
        effectiveFrom: '2026-12-01', mode: 'PERCENTAGE', calculationMetric: 'GROSS', value: 6, applyOn: 'TOTAL', reason: 'meta nova', releaseAfterSupplierPayment: false,
      }),
    );
  });

  it('shows the API error instead of hiding it', async () => {
    arrange();
    vi.mocked(api.createCommissionRuleScope).mockRejectedValue(new api.ApiError('Sem permissão', 'FORBIDDEN', 403));
    renderPage();
    await screen.findByText('Ana');
    fireEvent.change(screen.getByLabelText('Vigência a partir de'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('Percentual (%)'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar regra' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão');
  });
});
