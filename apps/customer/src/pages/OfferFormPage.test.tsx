import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OfferFormPage } from './OfferFormPage';
import { OffersPage } from './OffersPage';
import { createOffer, listOffers, ApiError } from '../lib/api';
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
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[] = ['/offers/new']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/offers" element={<OffersPage />} />
        <Route path="/offers/new" element={<OfferFormPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const createdOffer: Offer = {
  id: 'o1',
  agencyId: 'a1',
  name: 'Pacote Paris',
  price: 1500,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  featured: false,
  showOnCustomerApp: true,
  displayPriority: 100,
};

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Pacote Paris' } });
  fireEvent.change(screen.getByLabelText('Preço'), { target: { value: '1500' } });
}

describe('OfferFormPage', () => {
  it('renders the create form heading', () => {
    renderRouted();
    expect(screen.getByRole('heading', { name: 'Nova oferta' })).toBeInTheDocument();
  });

  it('valid submit calls createOffer with only name/price, no status/agencyId/id/timestamps', async () => {
    vi.mocked(createOffer).mockResolvedValue(createdOffer);
    renderRouted();

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(createOffer).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createOffer).mock.calls[0]?.[0] as unknown as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({ name: 'Pacote Paris', price: 1500 });
    expect(payload).not.toHaveProperty('agencyId');
    expect(payload).not.toHaveProperty('tenantId');
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('createdAt');
    expect(payload).not.toHaveProperty('updatedAt');
  });

  it('missing name shows validation error and does not submit', async () => {
    renderRouted();

    fireEvent.change(screen.getByLabelText('Preço'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Nome é obrigatório.')).toBeInTheDocument();
    expect(createOffer).not.toHaveBeenCalled();
  });

  it('missing price shows validation error and does not submit', async () => {
    renderRouted();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Pacote Paris' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Preço é obrigatório.')).toBeInTheDocument();
    expect(createOffer).not.toHaveBeenCalled();
  });

  it('negative price shows validation error and does not submit', async () => {
    renderRouted();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Pacote Paris' } });
    fireEvent.change(screen.getByLabelText('Preço'), { target: { value: '-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Preço deve ser um número não negativo.'),
    ).toBeInTheDocument();
    expect(createOffer).not.toHaveBeenCalled();
  });

  it('navigates to the created offer details page on success', async () => {
    vi.mocked(createOffer).mockResolvedValue(createdOffer);
    renderRouted();

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(createOffer).toHaveBeenCalledTimes(1));
  });

  it('cancel does not call createOffer and navigates back to /offers', async () => {
    vi.mocked(listOffers).mockResolvedValue([]);
    renderRouted();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(createOffer).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Ofertas' })).toBeInTheDocument();
  });

  it('400 error displays the backend message', async () => {
    vi.mocked(createOffer).mockRejectedValue(
      new ApiError('Field "price" must not be negative', 'VALIDATION_ERROR', 400),
    );
    renderRouted();

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Field "price" must not be negative'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/VALIDATION_ERROR/)).not.toBeInTheDocument();
  });

  it('403 error shows a safe permission message', async () => {
    vi.mocked(createOffer).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
    renderRouted();

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Você não tem permissão para criar ofertas.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/FORBIDDEN/)).not.toBeInTheDocument();
  });

  it('500/unknown error shows a generic safe message', async () => {
    vi.mocked(createOffer).mockRejectedValue(
      new ApiError('Internal server error', 'INTERNAL_ERROR', 500),
    );
    renderRouted();

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Não foi possível salvar a oferta. Tente novamente.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/INTERNAL_ERROR/)).not.toBeInTheDocument();
  });

  it('status is not rendered as an editable field on create', () => {
    renderRouted();
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument();
  });
});
