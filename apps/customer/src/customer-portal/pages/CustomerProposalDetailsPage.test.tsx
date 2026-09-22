import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerProposalDetailsPage } from './CustomerProposalDetailsPage';
import type { CustomerProposalDetail } from '../../types/customer-portal';

vi.mock('../../lib/customerApi', () => {
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
    getMyProposal: vi.fn(),
    getMyAgencyContact: vi.fn(),
    trackProposalViewed: vi.fn(),
    loadProposalMediaBlobUrl: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const proposal: CustomerProposalDetail = {
  id: 'p1',
  agencyId: 'a1',
  customerId: 'c1',
  offerId: null,
  wishId: null,
  proposedPrice: 5000,
  discount: 500,
  total: 4500,
  validUntil: '2026-12-01T00:00:00.000Z',
  conditions: 'Pagamento em até 10x',
  status: 'SENT',
  title: 'Cancún em família',
  subtitle: '7 noites all-inclusive',
  destinationSummary: 'Cancún, México',
  travelPeriod: '12 a 19 de dezembro',
  travelerSummary: '2 adultos, 1 criança',
  introText: 'Uma viagem inesquecível para toda a família.',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  sections: [
    {
      id: 's1',
      type: 'ITINERARY',
      title: 'Itinerário',
      description: null,
      sortOrder: 0,
      items: [
        {
          id: 'i1',
          type: 'ITINERARY_DAY',
          title: 'Chegada em Cancún',
          description: 'Transfer para o hotel',
          sortOrder: 0,
          dayNumber: 1,
          locationName: null,
          price: null,
        },
      ],
    },
    {
      id: 's2',
      type: 'INCLUSIONS',
      title: 'O que está incluído',
      description: null,
      sortOrder: 1,
      items: [
        {
          id: 'i2',
          type: 'INCLUSION',
          title: 'Café da manhã',
          description: null,
          sortOrder: 0,
          dayNumber: null,
          locationName: null,
          price: null,
        },
      ],
    },
  ],
  media: [],
};

async function renderPage() {
  const api = await import('../../lib/customerApi');
  vi.mocked(api.getMyProposal).mockResolvedValue(proposal);
  vi.mocked(api.getMyAgencyContact).mockResolvedValue({
    name: 'Agência Teste',
    email: 'contato@agencia.test',
    phone: '11999998888',
  });

  return render(
    <MemoryRouter initialEntries={['/customer-portal/proposals/p1']}>
      <Routes>
        <Route path="/customer-portal/proposals/:id" element={<CustomerProposalDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CustomerProposalDetailsPage', () => {
  it('renders the cover, summary fields, sections, and total', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Cancún em família'));

    expect(screen.getByText('7 noites all-inclusive')).toBeInTheDocument();
    expect(screen.getByText('Cancún, México')).toBeInTheDocument();
    expect(screen.getByText('12 a 19 de dezembro')).toBeInTheDocument();
    expect(screen.getByText('Uma viagem inesquecível para toda a família.')).toBeInTheDocument();

    expect(screen.getByText('Itinerário')).toBeInTheDocument();
    expect(screen.getByText('Chegada em Cancún')).toBeInTheDocument();
    expect(screen.getByText('Dia 1')).toBeInTheDocument();

    expect(screen.getByText('O que está incluído')).toBeInTheDocument();
    expect(screen.getByText('Café da manhã')).toBeInTheDocument();

    expect(screen.getByText('R$ 4.500,00')).toBeInTheDocument();
  });

  it('tracks PROPOSAL_VIEWED once the proposal loads', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Cancún em família'));
    const api = await import('../../lib/customerApi');
    expect(api.trackProposalViewed).toHaveBeenCalledWith('p1');
  });

  it('shows the "Falar com meu agente" CTA for a SENT proposal with agency contact info', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Falar com meu agente', { exact: false }));
    expect(screen.getByRole('link', { name: /Falar com meu agente/ })).toBeInTheDocument();
  });

  it('does not show the CTA for an ACCEPTED proposal', async () => {
    const api = await import('../../lib/customerApi');
    vi.mocked(api.getMyProposal).mockResolvedValue({ ...proposal, status: 'ACCEPTED' });
    vi.mocked(api.getMyAgencyContact).mockResolvedValue({
      name: 'Agência Teste',
      email: 'contato@agencia.test',
      phone: '11999998888',
    });

    render(
      <MemoryRouter initialEntries={['/customer-portal/proposals/p1']}>
        <Routes>
          <Route path="/customer-portal/proposals/:id" element={<CustomerProposalDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Cancún em família'));
    expect(screen.queryByRole('link', { name: /Falar com meu agente/ })).not.toBeInTheDocument();
  });
});
