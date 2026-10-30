import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as apiModule from '../lib/api';
import { SupplierCommissionTerms } from './SupplierCommissionTerms';

describe('SupplierCommissionTerms', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(apiModule.api, 'get').mockImplementation(path => Promise.resolve({ data: path === '/agency-revenue/rules' ? { rules: [] } : { products: [] } }));
    vi.spyOn(apiModule.api, 'post').mockResolvedValue({ data: {} });
    vi.spyOn(apiModule, 'listSaleCategories').mockResolvedValue([]);
  });

  it('creates a versioned supplier agreement with the tax base and balance deadline', async () => {
    render(<SupplierCommissionTerms supplierId="supplier-1" scopeRules={false} />);
    expect(await screen.findByText('Nenhum acordo cadastrado neste escopo.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Base da comissão do fornecedor'), { target: { value: 'TAXES' } });
    fireEvent.change(screen.getByLabelText('Percentual (%)'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Quando recebe do fornecedor'), { target: { value: 'ON_BALANCE_DEADLINE' } });
    fireEvent.change(screen.getByLabelText('Dias antes da viagem (0 a 365)'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Motivo da negociação ou revisão'), { target: { value: 'Acordo anual' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar acordo' }));
    await waitFor(() => expect(apiModule.api.post).toHaveBeenCalledWith('/agency-revenue/rules', expect.objectContaining({
      supplierId: 'supplier-1', baseSelector: 'TAXES', value: 10, entitlementEvent: 'ON_BALANCE_DEADLINE',
      balanceDeadlineDays: 15, reason: 'Acordo anual',
    })));
    expect(apiModule.listSaleCategories).toHaveBeenCalled();
  });
});
