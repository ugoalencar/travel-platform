import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProposalDetailsPage } from './ProposalDetailsPage';
import {
  getProposal,
  getCustomer,
  getOffer,
  sendProposal,
  acceptProposal,
  declineProposal,
  cancelProposal,
  ApiError,
} from '../lib/api';
import type { Proposal } from '../types/proposal';
import type { Customer } from '../types/customer';
import type { Offer } from '../types/offer';

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
    getProposal: vi.fn(),
    getCustomer: vi.fn(),
    getOffer: vi.fn(),
    getWish: vi.fn(),
    sendProposal: vi.fn(),
    acceptProposal: vi.fn(),
    declineProposal: vi.fn(),
    cancelProposal: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[] = ['/proposals/p1']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/proposals/:id" element={<ProposalDetailsPage />} />
        <Route path="/proposals" element={<div>Propostas page</div>} />
        <Route path="/proposals/:id/edit" element={<div>Editar proposta page</div>} />
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

const offer: Offer = {
  id: 'o1',
  agencyId: 'a1',
  name: 'Pacote Paris',
  price: 500,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const proposalWithOffer: Proposal = {
  id: 'p1',
  agencyId: 'a1',
  customerId: 'c1',
  offerId: 'o1',
  proposedPrice: 100,
  discount: 10,
  total: 90,
  status: 'DRAFT',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const proposalWithoutOffer: Proposal = {
  id: 'p2',
  agencyId: 'a1',
  customerId: 'c1',
  proposedPrice: 200,
  discount: 0,
  total: 200,
  status: 'DRAFT',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ProposalDetailsPage', () => {
  it('shows a loading state initially', () => {
    vi.mocked(getProposal).mockReturnValue(new Promise(() => {}));
    renderRouted();
    expect(screen.getByText('Carregando proposta...')).toBeInTheDocument();
  });

  it('renders real data: customer name, server-computed total, status as plain text', async () => {
    vi.mocked(getProposal).mockResolvedValue(proposalWithOffer);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    vi.mocked(getOffer).mockResolvedValue(offer);
    renderRouted();

    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('Pacote Paris')).toBeInTheDocument();
    expect(screen.getByText('R$ 90,00')).toBeInTheDocument();
    expect(screen.getByText('Rascunho')).toBeInTheDocument();
  });

  it('shows the optional Offer/Wish relations as absent when not present', async () => {
    vi.mocked(getProposal).mockResolvedValue(proposalWithoutOffer);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted();

    await screen.findByText('Maria Silva');
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows a 404 message when the proposal does not exist', async () => {
    vi.mocked(getProposal).mockRejectedValue(new ApiError('Not found', 'NOT_FOUND', 404));
    renderRouted();

    expect(await screen.findByText('Proposta não encontrada.')).toBeInTheDocument();
  });

  it('navigates to edit page when "Editar" is clicked', async () => {
    vi.mocked(getProposal).mockResolvedValue(proposalWithoutOffer);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted();

    await screen.findByText('Maria Silva');
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect(await screen.findByText('Editar proposta page')).toBeInTheDocument();
  });

  it('never shows a free-form status select or Sale/Booking action', async () => {
    vi.mocked(getProposal).mockResolvedValue(proposalWithoutOffer);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted();

    await screen.findByText('Maria Silva');
    expect(screen.queryByText(/Sale|Venda|Booking|Reserva/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  describe('lifecycle actions', () => {
    it('DRAFT shows Enviar and Cancelar, not Aceitar/Recusar', async () => {
      vi.mocked(getProposal).mockResolvedValue({ ...proposalWithoutOffer, status: 'DRAFT' });
      vi.mocked(getCustomer).mockResolvedValue(customer);
      renderRouted();

      await screen.findByText('Maria Silva');
      expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Aceitar' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Recusar' })).not.toBeInTheDocument();
    });

    it('SENT shows Aceitar, Recusar, and Cancelar, not Enviar', async () => {
      vi.mocked(getProposal).mockResolvedValue({ ...proposalWithoutOffer, status: 'SENT' });
      vi.mocked(getCustomer).mockResolvedValue(customer);
      renderRouted();

      await screen.findByText('Maria Silva');
      expect(screen.getByRole('button', { name: 'Aceitar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Recusar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument();
    });

    it('ACCEPTED (terminal) shows no lifecycle actions', async () => {
      vi.mocked(getProposal).mockResolvedValue({ ...proposalWithoutOffer, status: 'ACCEPTED' });
      vi.mocked(getCustomer).mockResolvedValue(customer);
      renderRouted();

      await screen.findByText('Maria Silva');
      for (const label of ['Enviar', 'Aceitar', 'Recusar', 'Cancelar']) {
        expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
      }
    });

    it('Enviar calls sendProposal without a confirm prompt and reloads', async () => {
      vi.mocked(getProposal)
        .mockResolvedValueOnce({ ...proposalWithoutOffer, status: 'DRAFT' })
        .mockResolvedValueOnce({ ...proposalWithoutOffer, status: 'SENT' });
      vi.mocked(getCustomer).mockResolvedValue(customer);
      vi.mocked(sendProposal).mockResolvedValue({ ...proposalWithoutOffer, status: 'SENT' });
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderRouted();

      await screen.findByText('Maria Silva');
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

      await screen.findByRole('button', { name: 'Aceitar' });
      expect(sendProposal).toHaveBeenCalledWith('p1');
      expect(confirmSpy).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('Cancelar asks for confirmation before calling cancelProposal', async () => {
      vi.mocked(getProposal).mockResolvedValue({ ...proposalWithoutOffer, status: 'DRAFT' });
      vi.mocked(getCustomer).mockResolvedValue(customer);
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderRouted();

      await screen.findByText('Maria Silva');
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(confirmSpy).toHaveBeenCalled();
      expect(cancelProposal).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('confirming Cancelar calls cancelProposal and reloads to terminal state', async () => {
      vi.mocked(getProposal)
        .mockResolvedValueOnce({ ...proposalWithoutOffer, status: 'DRAFT' })
        .mockResolvedValueOnce({ ...proposalWithoutOffer, status: 'CANCELLED' });
      vi.mocked(getCustomer).mockResolvedValue(customer);
      vi.mocked(cancelProposal).mockResolvedValue({ ...proposalWithoutOffer, status: 'CANCELLED' });
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderRouted();

      await screen.findByText('Maria Silva');
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(cancelProposal).toHaveBeenCalledWith('p1');
      await screen.findByText('CANCELLED');
      expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
      confirmSpy.mockRestore();
    });

    it('disables all lifecycle buttons while a mutation is pending', async () => {
      vi.mocked(getProposal).mockResolvedValue({ ...proposalWithoutOffer, status: 'SENT' });
      vi.mocked(getCustomer).mockResolvedValue(customer);
      let resolveAccept: (value: typeof proposalWithoutOffer) => void = () => {};
      vi.mocked(acceptProposal).mockReturnValue(
        new Promise((resolve) => {
          resolveAccept = resolve;
        }),
      );
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderRouted();

      await screen.findByText('Maria Silva');
      fireEvent.click(screen.getByRole('button', { name: 'Aceitar' }));

      expect(await screen.findByRole('button', { name: 'Aguarde...' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Recusar' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();

      resolveAccept({ ...proposalWithoutOffer, status: 'ACCEPTED' });
      confirmSpy.mockRestore();
    });

    it('maps a 409 conflict from a stale transition to a safe message', async () => {
      vi.mocked(getProposal).mockResolvedValue({ ...proposalWithoutOffer, status: 'SENT' });
      vi.mocked(getCustomer).mockResolvedValue(customer);
      vi.mocked(acceptProposal).mockRejectedValue(
        new ApiError('Cannot transition Proposal from ACCEPTED to ACCEPTED', 'CONFLICT', 409),
      );
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderRouted();

      await screen.findByText('Maria Silva');
      fireEvent.click(screen.getByRole('button', { name: 'Aceitar' }));

      expect(
        await screen.findByText(
          'Esta proposta não está mais em um estado que permite essa ação. Atualize a página.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/CONFLICT/)).not.toBeInTheDocument();
      confirmSpy.mockRestore();
    });

    it('maps a 403 from an action to a safe permission message', async () => {
      vi.mocked(getProposal).mockResolvedValue({ ...proposalWithoutOffer, status: 'DRAFT' });
      vi.mocked(getCustomer).mockResolvedValue(customer);
      vi.mocked(sendProposal).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
      renderRouted();

      await screen.findByText('Maria Silva');
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

      expect(
        await screen.findByText('Você não tem permissão para alterar esta proposta.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/FORBIDDEN/)).not.toBeInTheDocument();
    });
  });
});
