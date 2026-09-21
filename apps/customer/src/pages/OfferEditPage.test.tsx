import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OfferEditPage } from './OfferEditPage';
import { OfferDetailsPage } from './OfferDetailsPage';
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

const baseOffer: Offer = {
  id: 'o1',
  agencyId: 'a1',
  name: 'Pacote Paris',
  description: 'Pacote romantico',
  price: 1500,
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '2099-01-01T00:00:00.000Z',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  featured: false,
  showOnCustomerApp: true,
  displayPriority: 100,
};

function renderRouted(initialEntries: string[] = ['/offers/o1/edit']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/offers/:id" element={<OfferDetailsPage />} />
        <Route path="/offers/:id/edit" element={<OfferEditPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OfferEditPage', () => {
  it('renders at /offers/:id/edit', async () => {
    vi.mocked(getOffer).mockResolvedValue(baseOffer);
    renderRouted();

    expect(
      await screen.findByRole('heading', { name: 'Editar oferta' }),
    ).toBeInTheDocument();
  });

  it('loads and pre-fills existing offer data into the form fields', async () => {
    vi.mocked(getOffer).mockResolvedValue(baseOffer);
    renderRouted();

    expect(await screen.findByLabelText('Nome')).toHaveValue('Pacote Paris');
    expect(screen.getByLabelText('Preço')).toHaveValue(1500);
    expect(screen.getByLabelText('Válido de')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('Válido até')).toHaveValue('2099-01-01');
    expect(screen.getByLabelText('Descrição')).toHaveValue('Pacote romantico');
  });

  it('includes a stored-status select, pre-filled with the current stored status', async () => {
    vi.mocked(getOffer).mockResolvedValue(baseOffer);
    renderRouted();

    const select = await screen.findByLabelText('Status (armazenado)');
    expect(select).toHaveValue('ACTIVE');
  });

  it('has a caption clarifying stored status differs from the effective/expired display', async () => {
    vi.mocked(getOffer).mockResolvedValue(baseOffer);
    renderRouted();

    await screen.findByLabelText('Status (armazenado)');
    expect(screen.getByText(/status efetivo exibido em outras/i)).toBeInTheDocument();
  });

  it('editing a field changes its value', async () => {
    vi.mocked(getOffer).mockResolvedValue(baseOffer);
    renderRouted();

    const nameInput = await screen.findByLabelText('Nome');
    fireEvent.change(nameInput, { target: { value: 'Pacote Roma' } });
    expect(nameInput).toHaveValue('Pacote Roma');
  });

  it('valid submit calls updateOffer(id, input) with only allowed fields', async () => {
    vi.mocked(getOffer).mockResolvedValue(baseOffer);
    vi.mocked(updateOffer).mockResolvedValue({ ...baseOffer, name: 'Pacote Roma' });
    renderRouted();

    const nameInput = await screen.findByLabelText('Nome');
    fireEvent.change(nameInput, { target: { value: 'Pacote Roma' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(updateOffer).toHaveBeenCalledTimes(1));
    expect(updateOffer).toHaveBeenCalledWith('o1', {
      name: 'Pacote Roma',
      price: 1500,
      status: 'ACTIVE',
      description: 'Pacote romantico',
      validFrom: '2026-01-01',
      validUntil: '2099-01-01',
    });
  });

  it('changing the status select sends the new status via updateOffer', async () => {
    vi.mocked(getOffer).mockResolvedValue(baseOffer);
    vi.mocked(updateOffer).mockResolvedValue({ ...baseOffer, status: 'INACTIVE' });
    renderRouted();

    const select = await screen.findByLabelText('Status (armazenado)');
    fireEvent.change(select, { target: { value: 'INACTIVE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(updateOffer).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(updateOffer).mock.calls[0]?.[1] as unknown as Record<
      string,
      unknown
    >;
    expect(payload.status).toBe('INACTIVE');
  });

  it('payload never contains agencyId, id, createdAt, updatedAt, tenantId', async () => {
    vi.mocked(getOffer).mockResolvedValue(baseOffer);
    vi.mocked(updateOffer).mockResolvedValue(baseOffer);
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(updateOffer).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(updateOffer).mock.calls[0]?.[1] as unknown as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty('agencyId');
    expect(payload).not.toHaveProperty('tenantId');
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('createdAt');
    expect(payload).not.toHaveProperty('updatedAt');
  });

  it('missing name shows validation error and does not submit', async () => {
    vi.mocked(getOffer).mockResolvedValue(baseOffer);
    renderRouted();

    const nameInput = await screen.findByLabelText('Nome');
    fireEvent.change(nameInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Nome é obrigatório.')).toBeInTheDocument();
    expect(updateOffer).not.toHaveBeenCalled();
  });

  it('submitting state / button text change', async () => {
    vi.mocked(getOffer).mockResolvedValue(baseOffer);
    let resolvePromise: (value: Offer) => void = () => {};
    vi.mocked(updateOffer).mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('button', { name: 'Salvando...' })).toBeDisabled();

    resolvePromise(baseOffer);
    await waitFor(() => expect(updateOffer).toHaveBeenCalledTimes(1));
  });

  it('cancel does not call updateOffer, navigates to details', async () => {
    vi.mocked(getOffer).mockResolvedValue(baseOffer);
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(updateOffer).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('heading', { name: 'Detalhes da oferta' }),
    ).toBeInTheDocument();
  });

  it('success navigates to /offers/:id', async () => {
    vi.mocked(getOffer).mockResolvedValue(baseOffer);
    vi.mocked(updateOffer).mockResolvedValue(baseOffer);
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByRole('heading', { name: 'Detalhes da oferta' }),
    ).toBeInTheDocument();
  });

  it('400 error shows the backend message', async () => {
    vi.mocked(getOffer).mockResolvedValue(baseOffer);
    vi.mocked(updateOffer).mockRejectedValue(
      new ApiError('Field "validFrom" must not be after "validUntil"', 'VALIDATION_ERROR', 400),
    );
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Field "validFrom" must not be after "validUntil"'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/VALIDATION_ERROR/)).not.toBeInTheDocument();
  });

  it('403 error shows a safe permission message', async () => {
    vi.mocked(getOffer).mockResolvedValue(baseOffer);
    vi.mocked(updateOffer).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Você não tem permissão para editar ofertas.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/FORBIDDEN/)).not.toBeInTheDocument();
  });

  it('404 on load shows a safe message', async () => {
    vi.mocked(getOffer).mockRejectedValue(new ApiError('Offer not found', 'NOT_FOUND', 404));
    renderRouted();

    expect(await screen.findByText('Oferta não encontrada.')).toBeInTheDocument();
  });

  it('loading an offer triggers no write call', async () => {
    vi.mocked(getOffer).mockResolvedValue(baseOffer);
    renderRouted();

    await screen.findByLabelText('Nome');
    expect(createOffer).not.toHaveBeenCalled();
    expect(updateOffer).not.toHaveBeenCalled();
  });
});
