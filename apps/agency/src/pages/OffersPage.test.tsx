import { afterEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '../test/render';
import { OffersPage } from './OffersPage';
import { listOffers, createOffer, ApiError } from '../lib/api';
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
    listOffers: vi.fn().mockResolvedValue([]),
    createOffer: vi.fn(),
    getOffer: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const activeOffer: Offer = {
  id: 'o1',
  agencyId: 'a1',
  name: 'Portugal em família',
  description: 'Pacote romântico',
  price: 1500,
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '2026-11-30T00:00:00.000Z',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const expiredOffer: Offer = {
  ...activeOffer,
  id: 'o2',
  name: 'Inverno em Bariloche',
  status: 'EXPIRED',
  validUntil: '2026-08-15T00:00:00.000Z',
};

describe('OffersPage', () => {
  it('shows a loading state before offers resolve', () => {
    renderAt(<OffersPage />, '/offers');
    expect(screen.getByText('Carregando ofertas…')).toBeInTheDocument();
  });

  it('renders real offers fetched from GET /offers', async () => {
    vi.mocked(listOffers).mockResolvedValueOnce([activeOffer, expiredOffer]);
    renderAt(<OffersPage />, '/offers');

    expect(await screen.findByText('Portugal em família')).toBeInTheDocument();
    expect(screen.getByText('Inverno em Bariloche')).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(screen.getByText('Expirada')).toBeInTheDocument();
  });

  it('shows the empty state when the agency has no offers', async () => {
    renderAt(<OffersPage />, '/offers');
    expect(await screen.findByText('Nenhum registro em ofertas')).toBeInTheDocument();
  });

  it('shows an error message when the offers request fails', async () => {
    vi.mocked(listOffers).mockRejectedValueOnce(new ApiError('boom', 'INTERNAL', 500));
    renderAt(<OffersPage />, '/offers');
    expect(await screen.findByText('boom')).toBeInTheDocument();
  });

  it('opens the create offer modal when "Novo" button is clicked', async () => {
    const user = userEvent.setup();
    renderAt(<OffersPage />, '/offers');

    const newButton = await screen.findByRole('button', { name: /novo/i });
    await user.click(newButton);

    expect(screen.getByRole('heading', { name: /nova oferta/i })).toBeInTheDocument();
  });

  it('creates a new offer with form data', async () => {
    const user = userEvent.setup();
    const newOffer: Offer = {
      id: 'o3',
      agencyId: 'a1',
      name: 'Novo Pacote',
      price: 2500,
      status: 'ACTIVE',
      createdAt: '2026-08-29T00:00:00.000Z',
      updatedAt: '2026-08-29T00:00:00.000Z',
    };

    vi.mocked(listOffers)
      .mockResolvedValueOnce([activeOffer, expiredOffer])
      .mockResolvedValueOnce([activeOffer, expiredOffer, newOffer]);
    vi.mocked(createOffer).mockResolvedValueOnce(newOffer);

    renderAt(<OffersPage />, '/offers');

    const newButton = await screen.findByRole('button', { name: /novo/i });
    await user.click(newButton);

    const nameInput = screen.getByPlaceholderText(/ex: pacote portugal/i);
    const priceInput = screen.getByPlaceholderText('0,00');

    await user.type(nameInput, 'Novo Pacote');
    await user.type(priceInput, '2500');

    const createButton = screen.getByRole('button', { name: /criar/i });
    await user.click(createButton);

    await waitFor(() => {
      expect(createOffer).toHaveBeenCalledWith({
        name: 'Novo Pacote',
        description: undefined,
        price: 2500,
        validFrom: undefined,
        validUntil: undefined,
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /nova oferta/i })).not.toBeInTheDocument();
    });
  });

  it('validates required fields before creating', async () => {
    const user = userEvent.setup();
    renderAt(<OffersPage />, '/offers');

    const newButton = await screen.findByRole('button', { name: /novo/i });
    await user.click(newButton);

    const createButton = screen.getByRole('button', { name: /criar/i });
    await user.click(createButton);

    expect(await screen.findByText(/informe o nome da oferta/i)).toBeInTheDocument();
  });

  it('shows error message when creation fails', async () => {
    const user = userEvent.setup();
    vi.mocked(listOffers).mockResolvedValueOnce([]);
    vi.mocked(createOffer).mockRejectedValueOnce(
      new ApiError('Validation error', 'VALIDATION_ERROR', 400)
    );

    renderAt(<OffersPage />, '/offers');

    const newButton = await screen.findByRole('button', { name: /novo/i });
    await user.click(newButton);

    const nameInput = screen.getByPlaceholderText(/ex: pacote portugal/i);
    const priceInput = screen.getByPlaceholderText('0,00');

    await user.type(nameInput, 'Novo Pacote');
    await user.type(priceInput, '2500');

    const createButton = screen.getByRole('button', { name: /criar/i });
    await user.click(createButton);

    expect(await screen.findByText(/validation error/i)).toBeInTheDocument();
  });

  it('has clickable Detalhe links for each offer', async () => {
    vi.mocked(listOffers).mockResolvedValueOnce([activeOffer, expiredOffer]);
    renderAt(<OffersPage />, '/offers');

    const detalheLinks = await screen.findAllByText(/detalhe/i);
    expect(detalheLinks.length).toBe(2);

    detalheLinks.forEach((link, index) => {
      const offerId = [activeOffer.id, expiredOffer.id][index];
      expect(link).toHaveAttribute('href', `/offers/${offerId}`);
    });
  });
});
