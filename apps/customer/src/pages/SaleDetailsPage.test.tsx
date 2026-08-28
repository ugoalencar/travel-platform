import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SaleDetailsPage } from './SaleDetailsPage';
import { getSale, getCustomer, confirmSale, cancelSale, markSalePaid, ApiError } from '../lib/api';
import type { Sale } from '../types/sale';
import type { Customer } from '../types/customer';

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
    getCustomer: vi.fn(),
    confirmSale: vi.fn(),
    cancelSale: vi.fn(),
    markSalePaid: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[] = ['/sales/s1']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/sales/:id" element={<SaleDetailsPage />} />
        <Route path="/sales" element={<div>Vendas page</div>} />
        <Route path="/sales/:id/edit" element={<div>Editar venda page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const customer: Customer = {
  id: 'c1',
  agencyId: 'a1',
  name: 'Maria Silva',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const saleWithProposal: Sale = {
  id: 's1',
  agencyId: 'a1',
  customerId: 'c1',
  proposalId: 'p1',
  userId: 'u1',
  amount: 100,
  discount: 10,
  total: 90,
  status: 'PENDING',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const saleWithoutProposal: Sale = {
  id: 's2',
  agencyId: 'a1',
  customerId: 'c1',
  userId: 'u1',
  amount: 200,
  discount: 0,
  total: 200,
  status: 'PENDING',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('SaleDetailsPage', () => {
  it('shows a loading state initially', () => {
    vi.mocked(getSale).mockReturnValue(new Promise(() => {}));
    renderRouted();
    expect(screen.getByText('Carregando venda...')).toBeInTheDocument();
  });

  it('renders real data: customer name, server-computed total, status as plain text', async () => {
    vi.mocked(getSale).mockResolvedValue(saleWithProposal);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted();

    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('R$ 90,00')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.getByText('p1')).toBeInTheDocument();
  });

  it('shows the optional Proposal relation as absent when not present', async () => {
    vi.mocked(getSale).mockResolvedValue(saleWithoutProposal);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted();

    await screen.findByText('Maria Silva');
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows a 404 message when the sale does not exist', async () => {
    vi.mocked(getSale).mockRejectedValue(new ApiError('Not found', 'NOT_FOUND', 404));
    renderRouted();

    expect(await screen.findByText('Venda não encontrada.')).toBeInTheDocument();
  });

  it('navigates to edit page when "Editar" is clicked', async () => {
    vi.mocked(getSale).mockResolvedValue(saleWithoutProposal);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted();

    await screen.findByText('Maria Silva');
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect(await screen.findByText('Editar venda page')).toBeInTheDocument();
  });

  it('never shows a Commission-related action or a free-form status select', async () => {
    vi.mocked(getSale).mockResolvedValue(saleWithoutProposal);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted();

    await screen.findByText('Maria Silva');
    expect(screen.queryByText(/Commission|Comissão/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  describe('lifecycle actions', () => {
    it('PENDING shows Confirmar and Cancelar, not Marcar como paga', async () => {
      vi.mocked(getSale).mockResolvedValue({ ...saleWithoutProposal, status: 'PENDING' });
      vi.mocked(getCustomer).mockResolvedValue(customer);
      renderRouted();

      await screen.findByText('Maria Silva');
      expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Marcar como paga' })).not.toBeInTheDocument();
    });

    it('CONFIRMED shows Marcar como paga and Cancelar, not Confirmar', async () => {
      vi.mocked(getSale).mockResolvedValue({ ...saleWithoutProposal, status: 'CONFIRMED' });
      vi.mocked(getCustomer).mockResolvedValue(customer);
      renderRouted();

      await screen.findByText('Maria Silva');
      expect(screen.getByRole('button', { name: 'Marcar como paga' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
    });

    it('PAID (terminal) shows no lifecycle actions', async () => {
      vi.mocked(getSale).mockResolvedValue({ ...saleWithoutProposal, status: 'PAID' });
      vi.mocked(getCustomer).mockResolvedValue(customer);
      renderRouted();

      await screen.findByText('Maria Silva');
      for (const label of ['Confirmar', 'Cancelar', 'Marcar como paga']) {
        expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
      }
    });

    it('Confirmar calls confirmSale without a confirm prompt and reloads', async () => {
      vi.mocked(getSale)
        .mockResolvedValueOnce({ ...saleWithoutProposal, status: 'PENDING' })
        .mockResolvedValueOnce({ ...saleWithoutProposal, status: 'CONFIRMED' });
      vi.mocked(getCustomer).mockResolvedValue(customer);
      vi.mocked(confirmSale).mockResolvedValue({ ...saleWithoutProposal, status: 'CONFIRMED' });
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderRouted();

      await screen.findByText('Maria Silva');
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

      await screen.findByRole('button', { name: 'Marcar como paga' });
      expect(confirmSale).toHaveBeenCalledWith('s1');
      expect(confirmSpy).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('Cancelar asks for confirmation before calling cancelSale', async () => {
      vi.mocked(getSale).mockResolvedValue({ ...saleWithoutProposal, status: 'PENDING' });
      vi.mocked(getCustomer).mockResolvedValue(customer);
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderRouted();

      await screen.findByText('Maria Silva');
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(confirmSpy).toHaveBeenCalled();
      expect(cancelSale).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('confirming Cancelar calls cancelSale and reloads to terminal state', async () => {
      vi.mocked(getSale)
        .mockResolvedValueOnce({ ...saleWithoutProposal, status: 'PENDING' })
        .mockResolvedValueOnce({ ...saleWithoutProposal, status: 'CANCELLED' });
      vi.mocked(getCustomer).mockResolvedValue(customer);
      vi.mocked(cancelSale).mockResolvedValue({ ...saleWithoutProposal, status: 'CANCELLED' });
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderRouted();

      await screen.findByText('Maria Silva');
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(cancelSale).toHaveBeenCalledWith('s1');
      await screen.findByText('Cancelada');
      expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
      confirmSpy.mockRestore();
    });

    it('disables all lifecycle buttons while a mutation is pending', async () => {
      vi.mocked(getSale).mockResolvedValue({ ...saleWithoutProposal, status: 'CONFIRMED' });
      vi.mocked(getCustomer).mockResolvedValue(customer);
      let resolveMarkPaid: (value: typeof saleWithoutProposal) => void = () => {};
      vi.mocked(markSalePaid).mockReturnValue(
        new Promise((resolve) => {
          resolveMarkPaid = resolve;
        }),
      );
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderRouted();

      await screen.findByText('Maria Silva');
      fireEvent.click(screen.getByRole('button', { name: 'Marcar como paga' }));

      expect(await screen.findByRole('button', { name: 'Aguarde...' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();

      resolveMarkPaid({ ...saleWithoutProposal, status: 'PAID' });
      confirmSpy.mockRestore();
    });

    it('maps a 409 conflict from a stale transition to a safe message', async () => {
      vi.mocked(getSale).mockResolvedValue({ ...saleWithoutProposal, status: 'CONFIRMED' });
      vi.mocked(getCustomer).mockResolvedValue(customer);
      vi.mocked(markSalePaid).mockRejectedValue(
        new ApiError('Cannot transition Sale from PAID to PAID', 'CONFLICT', 409),
      );
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderRouted();

      await screen.findByText('Maria Silva');
      fireEvent.click(screen.getByRole('button', { name: 'Marcar como paga' }));

      expect(
        await screen.findByText(
          'Esta venda não está mais em um estado que permite essa ação. Atualize a página.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/CONFLICT/)).not.toBeInTheDocument();
      confirmSpy.mockRestore();
    });

    it('maps a 403 from an action to a safe permission message', async () => {
      vi.mocked(getSale).mockResolvedValue({ ...saleWithoutProposal, status: 'PENDING' });
      vi.mocked(getCustomer).mockResolvedValue(customer);
      vi.mocked(confirmSale).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
      renderRouted();

      await screen.findByText('Maria Silva');
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

      expect(
        await screen.findByText('Você não tem permissão para alterar esta venda.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/FORBIDDEN/)).not.toBeInTheDocument();
    });
  });
});
