import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '../test/render';
import { OfferDetailPage } from './OfferDetailPage';
import { getOffer, updateOffer, createOffer, ApiError } from '../lib/api';
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
    getOffer: vi.fn(),
    updateOffer: vi.fn(),
    createOffer: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockOffer: Offer = {
  id: 'o1',
  agencyId: 'a1',
  name: 'Portugal em família',
  description: 'Pacote romântico com tudo incluído',
  price: 1500,
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '2026-11-30T00:00:00.000Z',
  status: 'ACTIVE',
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-08-29T15:30:00.000Z',
};

describe('OfferDetailPage', () => {
  it('shows loading state while fetching offer', () => {
    vi.mocked(getOffer).mockImplementation(() => new Promise(() => {})); // Never resolves
    renderAt(<OfferDetailPage />, '/offers/o1');
    expect(screen.getByText(/carregando oferta/i)).toBeInTheDocument();
  });

  it('renders offer details when loaded', async () => {
    vi.mocked(getOffer).mockResolvedValueOnce(mockOffer);
    renderAt(<OfferDetailPage />, '/offers/o1');

    expect(await screen.findByText('Portugal em família')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.500,00')).toBeInTheDocument();
    expect(screen.getByText('Pacote romântico com tudo incluído')).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
  });

  it('shows error when offer fetch fails', async () => {
    vi.mocked(getOffer).mockRejectedValueOnce(
      new ApiError('Failed to load', 'INTERNAL', 500)
    );
    renderAt(<OfferDetailPage />, '/offers/o1');

    expect(await screen.findByText(/failed to load/i)).toBeInTheDocument();
  });

  it('shows not found when offer does not exist', async () => {
    vi.mocked(getOffer).mockRejectedValueOnce(
      new ApiError('Not found', 'NOT_FOUND', 404)
    );
    renderAt(<OfferDetailPage />, '/offers/o1');

    expect(await screen.findByText(/oferta não encontrada/i)).toBeInTheDocument();
  });

  it('opens edit modal when edit button is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(getOffer).mockResolvedValueOnce(mockOffer);
    renderAt(<OfferDetailPage />, '/offers/o1');

    await screen.findByText('Portugal em família');

    const editButton = screen.getByRole('button', { name: /editar/i });
    await user.click(editButton);

    expect(screen.getByRole('heading', { name: /editar oferta/i })).toBeInTheDocument();
  });

  it('updates offer when edit form is submitted', async () => {
    const user = userEvent.setup();
    const updatedOffer: Offer = { ...mockOffer, name: 'Portugal Atualizado', price: 1800 };

    vi.mocked(getOffer).mockResolvedValueOnce(mockOffer);
    vi.mocked(updateOffer).mockResolvedValueOnce(updatedOffer);

    renderAt(<OfferDetailPage />, '/offers/o1');

    await screen.findByText('Portugal em família');

    const editButton = screen.getByRole('button', { name: /editar/i });
    await user.click(editButton);

    const nameInput = screen.getAllByPlaceholderText(/ex: pacote portugal/i)[0]!;
    await user.clear(nameInput);
    await user.type(nameInput, 'Portugal Atualizado');

    const priceInput = screen.getAllByPlaceholderText('0,00')[0]!;
    await user.clear(priceInput);
    await user.type(priceInput, '1800');

    const saveButton = screen.getByRole('button', { name: /salvar/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(updateOffer).toHaveBeenCalledWith('o1', expect.objectContaining({
        name: 'Portugal Atualizado',
        price: 1800,
      }));
    });

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /editar oferta/i })).not.toBeInTheDocument();
      expect(screen.getByText('Portugal Atualizado')).toBeInTheDocument();
    });
  });

  it('opens duplicate modal when duplicate button is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(getOffer).mockResolvedValueOnce(mockOffer);
    renderAt(<OfferDetailPage />, '/offers/o1');

    await screen.findByText('Portugal em família');

    const duplicateButton = screen.getByRole('button', { name: /duplicar/i });
    await user.click(duplicateButton);

    expect(screen.getByRole('heading', { name: /duplicar oferta/i })).toBeInTheDocument();
  });

  it('duplicates offer with appended copy label', async () => {
    const user = userEvent.setup();
    const newOffer: Offer = {
      ...mockOffer,
      id: 'o2',
      name: 'Portugal em família (Cópia)',
    };

    vi.mocked(getOffer).mockResolvedValueOnce(mockOffer);
    vi.mocked(createOffer).mockResolvedValueOnce(newOffer);

    renderAt(<OfferDetailPage />, '/offers/o1');

    await screen.findByText('Portugal em família');

    const duplicateButton = screen.getByRole('button', { name: /duplicar/i });
    await user.click(duplicateButton);

    const nameInput = screen.getAllByPlaceholderText(/ex: pacote portugal/i)[1];
    expect(nameInput).toHaveValue('Portugal em família (Cópia)');

    const duplicateCreateButton = screen.getAllByRole('button', { name: /duplicar/i })[1]!;
    await user.click(duplicateCreateButton);

    await waitFor(() => {
      expect(createOffer).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Portugal em família (Cópia)',
        price: mockOffer.price,
      }));
    });
  });

  it('opens archive confirmation modal', async () => {
    const user = userEvent.setup();
    vi.mocked(getOffer).mockResolvedValueOnce(mockOffer);
    renderAt(<OfferDetailPage />, '/offers/o1');

    await screen.findByText('Portugal em família');

    const archiveButton = screen.getByRole('button', { name: /arquivar/i });
    await user.click(archiveButton);

    expect(screen.getByRole('heading', { name: /arquivar oferta/i })).toBeInTheDocument();
  });

  it('archives offer when confirmed', async () => {
    const user = userEvent.setup();
    const archivedOffer: Offer = { ...mockOffer, status: 'INACTIVE' };

    vi.mocked(getOffer).mockResolvedValueOnce(mockOffer);
    vi.mocked(updateOffer).mockResolvedValueOnce(archivedOffer);

    renderAt(<OfferDetailPage />, '/offers/o1');

    await screen.findByText('Portugal em família');

    const archiveButton = screen.getByRole('button', { name: /arquivar/i });
    await user.click(archiveButton);

    const confirmArchiveButton = screen.getAllByRole('button', { name: /arquivar/i })[1]!;
    await user.click(confirmArchiveButton);

    await waitFor(() => {
      expect(updateOffer).toHaveBeenCalledWith('o1', { status: 'INACTIVE' });
    });

    await waitFor(() => {
      expect(screen.getByText('Inativa')).toBeInTheDocument();
    });
  });

  it('hides archive button when offer is already inactive', async () => {
    const inactiveOffer: Offer = { ...mockOffer, status: 'INACTIVE' };
    vi.mocked(getOffer).mockResolvedValueOnce(inactiveOffer);
    renderAt(<OfferDetailPage />, '/offers/o1');

    await screen.findByText('Portugal em família');

    const archiveButtons = screen.queryAllByRole('button', { name: /arquivar/i });
    expect(archiveButtons.length).toBe(0);
  });

  it('validates date range when editing', async () => {
    const user = userEvent.setup();
    vi.mocked(getOffer).mockResolvedValueOnce(mockOffer);
    renderAt(<OfferDetailPage />, '/offers/o1');

    await screen.findByText('Portugal em família');

    const editButton = screen.getByRole('button', { name: /editar/i });
    await user.click(editButton);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const fromInput = screen.getAllByDisplayValue('2026-01-01')[0]!;
    const toInput = screen.getAllByDisplayValue('2026-11-30')[0]!;

    await user.clear(toInput);
    await user.type(toInput, '2025-12-31');

    const saveButton = screen.getByRole('button', { name: /salvar/i });
    await user.click(saveButton);

    expect(await screen.findByText(/data inicial não pode ser posterior/i)).toBeInTheDocument();
  });

  it('has back link to offers list', async () => {
    vi.mocked(getOffer).mockResolvedValueOnce(mockOffer);
    renderAt(<OfferDetailPage />, '/offers/o1');

    await screen.findByText('Portugal em família');

    const backLink = screen.getByText(/ofertas/i);
    expect(backLink).toHaveAttribute('href', '/offers');
  });
});
