import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProposalEditPage } from './ProposalEditPage';
import { getProposal, updateProposal, ApiError } from '../lib/api';
import type { Proposal } from '../types/proposal';

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
    updateProposal: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[] = ['/proposals/p1/edit']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/proposals/:id/edit" element={<ProposalEditPage />} />
        <Route path="/proposals/:id" element={<div>Detalhes da proposta page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const proposal: Proposal = {
  id: 'p1',
  agencyId: 'a1',
  customerId: 'c1',
  proposedPrice: 100,
  discount: 10,
  total: 90,
  status: 'DRAFT',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const updatedProposal: Proposal = {
  ...proposal,
  proposedPrice: 200,
  discount: 20,
  total: 180,
};

describe('ProposalEditPage', () => {
  it('shows a loading state initially', () => {
    vi.mocked(getProposal).mockReturnValue(new Promise(() => {}));
    renderRouted();
    expect(screen.getByText('Carregando proposta...')).toBeInTheDocument();
  });

  it('loads and prefills proposedPrice/discount, shows status as read-only text', async () => {
    vi.mocked(getProposal).mockResolvedValue(proposal);
    renderRouted();

    const priceInput = await screen.findByLabelText('Preço proposto');
    expect(priceInput).toHaveValue(100);
    const discountInput = screen.getByLabelText('Desconto (valor absoluto)');
    expect(discountInput).toHaveValue(10);
    expect(screen.getByText(/Status atual: DRAFT/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /status/i })).not.toBeInTheDocument();
  });

  it('shows recomputed total preview when price/discount change', async () => {
    vi.mocked(getProposal).mockResolvedValue(proposal);
    renderRouted();

    await screen.findByLabelText('Preço proposto');
    fireEvent.change(screen.getByLabelText('Preço proposto'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Desconto (valor absoluto)'), {
      target: { value: '20' },
    });

    expect(screen.getByText('180')).toBeInTheDocument();
  });

  it('submits only changed/allowed fields and navigates to details showing the server-computed total', async () => {
    vi.mocked(getProposal).mockResolvedValue(proposal);
    vi.mocked(updateProposal).mockResolvedValue(updatedProposal);
    renderRouted();

    await screen.findByLabelText('Preço proposto');
    fireEvent.change(screen.getByLabelText('Preço proposto'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Desconto (valor absoluto)'), {
      target: { value: '20' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(updateProposal).toHaveBeenCalledTimes(1));
    const [id, payload] = vi.mocked(updateProposal).mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe('p1');
    expect(payload).toEqual({ proposedPrice: 200, discount: 20 });
    expect(payload).not.toHaveProperty('total');
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('customerId');

    expect(await screen.findByText('Detalhes da proposta page')).toBeInTheDocument();
  });

  it('shows a 404 message when loading a non-existent proposal', async () => {
    vi.mocked(getProposal).mockRejectedValue(new ApiError('Not found', 'NOT_FOUND', 404));
    renderRouted();

    expect(await screen.findByText('Proposta não encontrada.')).toBeInTheDocument();
  });

  it('shows a validation error message on submit failure', async () => {
    vi.mocked(getProposal).mockResolvedValue(proposal);
    vi.mocked(updateProposal).mockRejectedValue(
      new ApiError('Field "discount" must not exceed "proposedPrice"', 'VALIDATION_ERROR', 400),
    );
    renderRouted();

    await screen.findByLabelText('Preço proposto');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Field "discount" must not exceed "proposedPrice"'),
    ).toBeInTheDocument();
  });
});
