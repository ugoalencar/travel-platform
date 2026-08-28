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

    await screen.findAllByText('Maria Silva');
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

  describe('filters', () => {
    const multiCustomers: Customer[] = [
      ...customers,
      {
        id: 'c2',
        agencyId: 'a1',
        name: 'João Souza',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const multiProposals: Proposal[] = [
      proposals[0]!,
      {
        id: 'p2',
        agencyId: 'a1',
        customerId: 'c2',
        proposedPrice: 200,
        discount: 0,
        total: 200,
        status: 'SENT',
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ];

    it('filters the table by status', async () => {
      vi.mocked(listProposals).mockResolvedValue(multiProposals);
      vi.mocked(listCustomers).mockResolvedValue(multiCustomers);
      renderRouted();

      await screen.findAllByText('Maria Silva');
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'SENT' } });

      expect(screen.queryByText('Rascunho')).not.toBeInTheDocument();
      expect(screen.getByText('Enviada')).toBeInTheDocument();
      expect(screen.getAllByText('João Souza').length).toBeGreaterThan(0);
    });

    it('filters the table by customer, showing names not raw ids', async () => {
      vi.mocked(listProposals).mockResolvedValue(multiProposals);
      vi.mocked(listCustomers).mockResolvedValue(multiCustomers);
      renderRouted();

      await screen.findAllByText('Maria Silva');
      fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'c1' } });

      const rows = screen.getAllByRole('row').slice(1);
      expect(rows).toHaveLength(1);
      expect(screen.queryByText('João Souza', { selector: 'td' })).not.toBeInTheDocument();
      expect(screen.queryByText('c2')).not.toBeInTheDocument();
    });

    it('shows a no-match message when filters exclude every proposal', async () => {
      vi.mocked(listProposals).mockResolvedValue(multiProposals);
      vi.mocked(listCustomers).mockResolvedValue(multiCustomers);
      renderRouted();

      await screen.findAllByText('Maria Silva');
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'ACCEPTED' } });

      expect(
        await screen.findByText('Nenhuma proposta corresponde aos filtros selecionados.'),
      ).toBeInTheDocument();
    });

    it('"Limpar filtros" resets both filters', async () => {
      vi.mocked(listProposals).mockResolvedValue(multiProposals);
      vi.mocked(listCustomers).mockResolvedValue(multiCustomers);
      renderRouted();

      await screen.findAllByText('Maria Silva');
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'SENT' } });
      fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));

      expect(screen.getByLabelText('Status')).toHaveValue('');
      expect(screen.getByText('Rascunho')).toBeInTheDocument();
      expect(screen.getByText('Enviada')).toBeInTheDocument();
    });
  });
});
