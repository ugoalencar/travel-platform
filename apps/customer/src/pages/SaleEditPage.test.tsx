import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SaleEditPage } from './SaleEditPage';
import { getSale, updateSale, ApiError } from '../lib/api';
import type { Sale } from '../types/sale';

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
    getSale: vi.fn(),
    updateSale: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[] = ['/sales/s1/edit']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/sales/:id/edit" element={<SaleEditPage />} />
        <Route path="/sales/:id" element={<div>Detalhes da venda page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const sale: Sale = {
  id: 's1',
  agencyId: 'a1',
  customerId: 'c1',
  userId: 'u1',
  amount: 100,
  discount: 10,
  total: 90,
  status: 'PENDING',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const updatedSale: Sale = {
  ...sale,
  amount: 200,
  discount: 20,
  total: 180,
};

describe('SaleEditPage', () => {
  it('shows a loading state initially', () => {
    vi.mocked(getSale).mockReturnValue(new Promise(() => {}));
    renderRouted();
    expect(screen.getByText('Carregando venda...')).toBeInTheDocument();
  });

  it('loads and prefills amount/discount, shows status as read-only text', async () => {
    vi.mocked(getSale).mockResolvedValue(sale);
    renderRouted();

    const amountInput = await screen.findByLabelText('Valor');
    expect(amountInput).toHaveValue(100);
    const discountInput = screen.getByLabelText('Desconto (valor absoluto)');
    expect(discountInput).toHaveValue(10);
    expect(screen.getByText(/Status atual: PENDING/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /status/i })).not.toBeInTheDocument();
  });

  it('shows recomputed total preview when amount/discount change', async () => {
    vi.mocked(getSale).mockResolvedValue(sale);
    renderRouted();

    await screen.findByLabelText('Valor');
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Desconto (valor absoluto)'), {
      target: { value: '20' },
    });

    expect(screen.getByText('180')).toBeInTheDocument();
  });

  it('submits only changed/allowed fields and navigates to details showing the server-computed total', async () => {
    vi.mocked(getSale).mockResolvedValue(sale);
    vi.mocked(updateSale).mockResolvedValue(updatedSale);
    renderRouted();

    await screen.findByLabelText('Valor');
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Desconto (valor absoluto)'), {
      target: { value: '20' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(updateSale).toHaveBeenCalledTimes(1));
    const [id, payload] = vi.mocked(updateSale).mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe('s1');
    expect(payload).toEqual({ amount: 200, discount: 20 });
    expect(payload).not.toHaveProperty('total');
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('userId');
    expect(payload).not.toHaveProperty('paidAt');
    expect(payload).not.toHaveProperty('customerId');
    expect(payload).not.toHaveProperty('proposalId');
    expect(payload).not.toHaveProperty('brokerId');

    expect(await screen.findByText('Detalhes da venda page')).toBeInTheDocument();
  });

  it('shows a 404 message when loading a non-existent sale', async () => {
    vi.mocked(getSale).mockRejectedValue(new ApiError('Not found', 'NOT_FOUND', 404));
    renderRouted();

    expect(await screen.findByText('Venda não encontrada.')).toBeInTheDocument();
  });

  it('shows a validation error message on submit failure', async () => {
    vi.mocked(getSale).mockResolvedValue(sale);
    vi.mocked(updateSale).mockRejectedValue(
      new ApiError('Field "discount" must not exceed "amount"', 'VALIDATION_ERROR', 400),
    );
    renderRouted();

    await screen.findByLabelText('Valor');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Field "discount" must not exceed "amount"'),
    ).toBeInTheDocument();
  });
});
