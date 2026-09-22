import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProposalEditorPage } from './ProposalEditorPage';
import * as api from '../../lib/api';
import type { Proposal, ProposalItem, ProposalSection } from '../../lib/api';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../../lib/api');
  return {
    ...actual,
    getProposal: vi.fn(),
    listProposalSections: vi.fn(),
    listProposalItems: vi.fn(),
    listProposalMedia: vi.fn(),
    createProposalSection: vi.fn(),
    updateProposal: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const draftProposal: Proposal = {
  id: 'p1',
  agencyId: 'a1',
  customerId: 'c1',
  customerName: 'Cliente Teste',
  proposedPrice: 5000,
  discount: 0,
  total: 5000,
  status: 'DRAFT',
  title: 'Cancún em família',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const section: ProposalSection = {
  id: 's1',
  agencyId: 'a1',
  proposalId: 'p1',
  type: 'OVERVIEW',
  title: 'Resumo',
  sortOrder: 0,
  isVisibleToCustomer: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const item: ProposalItem = {
  id: 'i1',
  agencyId: 'a1',
  proposalSectionId: 's1',
  type: 'TEXT',
  title: 'Bem-vindo',
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={['/proposals/p1/editor']}>
      <Routes>
        <Route path="/proposals/:id/editor" element={<ProposalEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProposalEditorPage', () => {
  it('loads and shows the content tab with existing sections and items', async () => {
    vi.mocked(api.getProposal).mockResolvedValue(draftProposal);
    vi.mocked(api.listProposalSections).mockResolvedValue([section]);
    vi.mocked(api.listProposalItems).mockResolvedValue([item]);
    vi.mocked(api.listProposalMedia).mockResolvedValue([]);

    renderEditor();
    await waitFor(() => screen.getByText('Bem-vindo'));
    expect(screen.getByText('Bem-vindo')).toBeInTheDocument();
  });

  it('adds a new section via the content tab', async () => {
    vi.mocked(api.getProposal).mockResolvedValue(draftProposal);
    vi.mocked(api.listProposalSections).mockResolvedValue([]);
    vi.mocked(api.listProposalItems).mockResolvedValue([]);
    vi.mocked(api.listProposalMedia).mockResolvedValue([]);
    vi.mocked(api.createProposalSection).mockResolvedValue({ ...section, id: 's2', title: 'Hospedagem' });

    renderEditor();
    await waitFor(() => screen.getByText('Adicionar seção'));
    fireEvent.click(screen.getByText('Adicionar seção'));

    const titleInput = screen.getByPlaceholderText('Ex: Hospedagem');
    fireEvent.change(titleInput, { target: { value: 'Hospedagem' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => {
      expect(api.createProposalSection).toHaveBeenCalledWith('p1', expect.objectContaining({ title: 'Hospedagem' }));
    });
  });

  it('shows the immutability banner and hides edit controls for an ACCEPTED proposal', async () => {
    vi.mocked(api.getProposal).mockResolvedValue({ ...draftProposal, status: 'ACCEPTED' });
    vi.mocked(api.listProposalSections).mockResolvedValue([section]);
    vi.mocked(api.listProposalItems).mockResolvedValue([item]);
    vi.mocked(api.listProposalMedia).mockResolvedValue([]);

    renderEditor();
    await waitFor(() => screen.getByText('Bem-vindo'));
    expect(screen.getByText(/não pode mais ser editada/)).toBeInTheDocument();
    expect(screen.queryByText('Adicionar seção')).not.toBeInTheDocument();
  });

  it('renders the Prévia tab using the same data', async () => {
    vi.mocked(api.getProposal).mockResolvedValue(draftProposal);
    vi.mocked(api.listProposalSections).mockResolvedValue([section]);
    vi.mocked(api.listProposalItems).mockResolvedValue([item]);
    vi.mocked(api.listProposalMedia).mockResolvedValue([]);

    renderEditor();
    await waitFor(() => screen.getByText('Bem-vindo'));
    fireEvent.click(screen.getByRole('button', { name: 'Prévia' }));
    await waitFor(() => {
      expect(screen.getAllByText('Cancún em família').length).toBeGreaterThan(0);
    });
  });
});
