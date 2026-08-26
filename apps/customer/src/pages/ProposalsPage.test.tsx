import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProposalsPage } from './ProposalsPage';
import { listProposals, listCustomers, ApiError } from '../lib/api';
import type { Proposal } from '../types/proposal';
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
    listProposals: vi.fn().mockResolvedValue([]),
    listCustomers: vi.fn().mockResolvedValue([]),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[] = ['/proposals']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/proposals" element={<ProposalsPage />} />
        <Route path="/proposals/new" element={<div>Nova proposta page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const customers: Customer[] = [
  {
    id: 'c1',
    agencyId: 'a1',
    name: 'Maria Silva',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const proposals: Proposal[] = [
  {
    id: 'p1',
    agencyId: 'a1',
    customerId: 'c1',
    proposedPrice: 100,
    discount: 10,
    total: 90,
    status: 'DRAFT',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('ProposalsPage', () => {
  it('shows a loading state initially', () => {
    vi.mocked(listProposals).mockReturnValue(new Promise(() => {}));
    renderRouted();
    expect(screen.getByText('Carregando propostas...')).toBeInTheDocument();
  });

  it('renders real data with resolved customer name, proposedPrice/discount/total/status', async () => {
    vi.mocked(listProposals).mockResolvedValue(proposals);
    vi.mocked(listCustomers).mockResolvedValue(customers);
    renderRouted();

    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('R$ 100,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 90,00')).toBeInTheDocument();
    expect(screen.getByText('Rascunho')).toBeInTheDocument();
  });

  it('shows an empty state with no crash', async () => {
    vi.mocked(listProposals).mockResolvedValue([]);
    renderRouted();
    expect(
      await screen.findByText('Nenhuma proposta cadastrada ainda.'),
    ).toBeInTheDocument();
  });

  it('shows an error message on failure', async () => {
    vi.mocked(listProposals).mockRejectedValue(
      new ApiError('Erro ao listar', 'INTERNAL_ERROR', 500),
    );
    renderRouted();
    expect(await screen.findByText('Erro ao listar')).toBeInTheDocument();
  });

  it('navigates to /proposals/new when "+ Nova proposta" is clicked', async () => {
    vi.mocked(listProposals).mockResolvedValue([]);
    renderRouted();
    await screen.findByText('Nenhuma proposta cadastrada ainda.');

    fireEvent.click(screen.getByRole('button', { name: '+ Nova proposta' }));

    expect(await screen.findByText('Nova proposta page')).toBeInTheDocument();
  });
});
