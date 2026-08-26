import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProposalDetailsPage } from './ProposalDetailsPage';
import { getProposal, getCustomer, getOffer, ApiError } from '../lib/api';
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

  it('never shows any Sale/Booking/status-transition action', async () => {
    vi.mocked(getProposal).mockResolvedValue(proposalWithoutOffer);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted();

    await screen.findByText('Maria Silva');
    expect(screen.queryByText(/Sale|Venda|Booking|Reserva/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aceitar|Enviar|Cancelar Proposta/i })).not.toBeInTheDocument();
  });
});
