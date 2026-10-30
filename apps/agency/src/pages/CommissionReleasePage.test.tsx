import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CommissionReleasePage } from './CommissionReleasePage';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, getCommissionReleaseConfig: vi.fn(), setReceiptRule: vi.fn(), createCommissionFinancialProfile: vi.fn() };
});

const renderPage = () => render(<MemoryRouter><CommissionReleasePage /></MemoryRouter>);

describe('CommissionReleasePage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('says what is missing when the policy is not configured', async () => {
    vi.mocked(api.getCommissionReleaseConfig).mockResolvedValue({ receiptRules: [], profiles: [], blocked: true, missing: ['PAYMENT_METHOD_RECEIPT_RULE_UNSET', 'FINANCIAL_PROFILE_NOT_ACTIVE'] });
    renderPage();
    expect(await screen.findByText('Configuração ausente: liberação bloqueada')).toBeInTheDocument();
    expect(screen.getByText(/para cada forma de pagamento/)).toBeInTheDocument();
    expect(screen.getByText(/perfil financeiro da agência com vigência/)).toBeInTheDocument();
  });

  it('saves a receipt rule and a profile', async () => {
    vi.mocked(api.getCommissionReleaseConfig).mockResolvedValue({ receiptRules: [{ method: 'PIX', requiresReceipt: true }], profiles: [], blocked: true, missing: ['FINANCIAL_PROFILE_NOT_ACTIVE'] });
    vi.mocked(api.setReceiptRule).mockResolvedValue();
    vi.mocked(api.createCommissionFinancialProfile).mockResolvedValue();
    renderPage();
    expect(await screen.findByText('PIX: exige recebimento')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Forma de pagamento'), { target: { value: 'Cartão' } });
    fireEvent.change(screen.getByLabelText('Exige recebimento?'), { target: { value: 'false' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar regra' }));
    await waitFor(() => expect(api.setReceiptRule).toHaveBeenCalledWith('Cartão', false));
    fireEvent.change(screen.getByLabelText('Vigência a partir de'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar perfil' }));
    await waitFor(() => expect(api.createCommissionFinancialProfile).toHaveBeenCalledWith({ effect: 'SOMENTE_LIBERACAO', effectiveFrom: '2026-11-01' }));
  });

  it('shows the API error', async () => {
    vi.mocked(api.getCommissionReleaseConfig).mockResolvedValue({ receiptRules: [], profiles: [], blocked: true, missing: [] });
    vi.mocked(api.setReceiptRule).mockRejectedValue(new api.ApiError('Sem permissão', 'FORBIDDEN', 403));
    renderPage();
    await screen.findByText('Configuração ausente: liberação bloqueada');
    fireEvent.change(screen.getByLabelText('Forma de pagamento'), { target: { value: 'PIX' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar regra' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão');
  });
});
