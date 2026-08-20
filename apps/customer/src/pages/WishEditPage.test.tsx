import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { WishEditPage } from './WishEditPage';
import { WishDetailsPage } from './WishDetailsPage';
import { getWish, updateWish, getCustomer, ApiError } from '../lib/api';
import type { Wish } from '../types/wish';

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
    getWish: vi.fn(),
    updateWish: vi.fn(),
    getCustomer: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const baseWish: Wish = {
  id: 'w1',
  agencyId: 'a1',
  customerId: 'c1',
  destination: 'Paris',
  startDate: '2026-06-01',
  endDate: '2026-06-10',
  budget: 5000,
  travelersCount: 2,
  notes: 'Honeymoon',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderRouted(initialEntries: string[] = ['/wishes/w1/edit']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/wishes/:id" element={<WishDetailsPage />} />
        <Route path="/wishes/:id/edit" element={<WishEditPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('WishEditPage', () => {
  it('renders at /wishes/:id/edit', async () => {
    vi.mocked(getWish).mockResolvedValue(baseWish);
    renderRouted();

    expect(
      await screen.findByRole('heading', { name: 'Editar desejo' }),
    ).toBeInTheDocument();
  });

  it('loads and pre-fills existing wish data into the form fields', async () => {
    vi.mocked(getWish).mockResolvedValue(baseWish);
    renderRouted();

    expect(await screen.findByLabelText('Destino')).toHaveValue('Paris');
    expect(screen.getByLabelText('Data de início')).toHaveValue('2026-06-01');
    expect(screen.getByLabelText('Data de fim')).toHaveValue('2026-06-10');
    expect(screen.getByLabelText('Orçamento')).toHaveValue(5000);
    expect(screen.getByLabelText('Número de viajantes')).toHaveValue(2);
    expect(screen.getByLabelText('Notas')).toHaveValue('Honeymoon');
  });

  it('no customerId field is rendered', async () => {
    vi.mocked(getWish).mockResolvedValue(baseWish);
    renderRouted();

    await screen.findByLabelText('Destino');
    expect(screen.queryByLabelText('Cliente')).not.toBeInTheDocument();
  });

  it('editing a field changes its value', async () => {
    vi.mocked(getWish).mockResolvedValue(baseWish);
    renderRouted();

    const destInput = await screen.findByLabelText('Destino');
    fireEvent.change(destInput, { target: { value: 'Lisboa' } });
    expect(destInput).toHaveValue('Lisboa');
  });

  it('valid submit calls updateWish(id, input) with only allowed fields', async () => {
    vi.mocked(getWish).mockResolvedValue(baseWish);
    vi.mocked(updateWish).mockResolvedValue({ ...baseWish, destination: 'Lisboa' });
    renderRouted();

    const destInput = await screen.findByLabelText('Destino');
    fireEvent.change(destInput, { target: { value: 'Lisboa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(updateWish).toHaveBeenCalledTimes(1));
    expect(updateWish).toHaveBeenCalledWith('w1', {
      destination: 'Lisboa',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
      budget: 5000,
      travelersCount: 2,
      notes: 'Honeymoon',
    });
  });

  it('payload never contains customerId or status', async () => {
    vi.mocked(getWish).mockResolvedValue(baseWish);
    vi.mocked(updateWish).mockResolvedValue(baseWish);
    renderRouted();

    await screen.findByLabelText('Destino');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(updateWish).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(updateWish).mock.calls[0]?.[1] as unknown as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty('customerId');
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('agencyId');
    expect(payload).not.toHaveProperty('tenantId');
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('createdAt');
  });

  it('submitting state / button text change', async () => {
    vi.mocked(getWish).mockResolvedValue(baseWish);
    let resolvePromise: (value: Wish) => void = () => {};
    vi.mocked(updateWish).mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    renderRouted();

    await screen.findByLabelText('Destino');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('button', { name: 'Salvando...' })).toBeDisabled();

    resolvePromise(baseWish);
    await waitFor(() => expect(updateWish).toHaveBeenCalledTimes(1));
  });

  it('blocks double submit — rapid clicks call updateWish exactly once', async () => {
    vi.mocked(getWish).mockResolvedValue(baseWish);
    let resolvePromise: (value: Wish) => void = () => {};
    vi.mocked(updateWish).mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    renderRouted();

    await screen.findByLabelText('Destino');
    const submitButton = screen.getByRole('button', { name: 'Salvar' });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(updateWish).toHaveBeenCalledTimes(1);

    resolvePromise(baseWish);
    await waitFor(() => expect(updateWish).toHaveBeenCalledTimes(1));
  });

  it('cancel does not call updateWish, navigates to details', async () => {
    vi.mocked(getWish).mockResolvedValue(baseWish);
    vi.mocked(getCustomer).mockRejectedValue(new ApiError('Not found', 'NOT_FOUND', 404));
    renderRouted();

    await screen.findByLabelText('Destino');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(updateWish).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('heading', { name: 'Detalhes do desejo' }),
    ).toBeInTheDocument();
  });

  it('success navigates to /wishes/:id', async () => {
    vi.mocked(getWish).mockResolvedValue(baseWish);
    vi.mocked(updateWish).mockResolvedValue(baseWish);
    vi.mocked(getCustomer).mockRejectedValue(new ApiError('Not found', 'NOT_FOUND', 404));
    renderRouted();

    await screen.findByLabelText('Destino');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByRole('heading', { name: 'Detalhes do desejo' }),
    ).toBeInTheDocument();
  });

  it('400 error shows the backend message', async () => {
    vi.mocked(getWish).mockResolvedValue(baseWish);
    vi.mocked(updateWish).mockRejectedValue(
      new ApiError('Field "budget" must be a number', 'VALIDATION_ERROR', 400),
    );
    renderRouted();

    await screen.findByLabelText('Destino');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Field "budget" must be a number'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/VALIDATION_ERROR/)).not.toBeInTheDocument();
  });

  it('403 error shows a safe permission message', async () => {
    vi.mocked(getWish).mockResolvedValue(baseWish);
    vi.mocked(updateWish).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
    renderRouted();

    await screen.findByLabelText('Destino');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Você não tem permissão para editar desejos.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/FORBIDDEN/)).not.toBeInTheDocument();
  });

  it('404 error on submit shows a safe generic message', async () => {
    vi.mocked(getWish).mockResolvedValue(baseWish);
    vi.mocked(updateWish).mockRejectedValue(new ApiError('Wish not found', 'NOT_FOUND', 404));
    renderRouted();

    await screen.findByLabelText('Destino');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Desejo não encontrado.')).toBeInTheDocument();
    expect(screen.queryByText(/NOT_FOUND/)).not.toBeInTheDocument();
  });

  it('500/unknown error shows a generic safe fallback, never raw text', async () => {
    vi.mocked(getWish).mockResolvedValue(baseWish);
    vi.mocked(updateWish).mockRejectedValue(
      new ApiError('Internal server error', 'INTERNAL_ERROR', 500),
    );
    renderRouted();

    await screen.findByLabelText('Destino');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Não foi possível salvar o desejo. Tente novamente.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/INTERNAL_ERROR/)).not.toBeInTheDocument();
    expect(screen.queryByText('Internal server error')).not.toBeInTheDocument();
  });

  it('stays on the edit form on error and re-enables submit', async () => {
    vi.mocked(getWish).mockResolvedValue(baseWish);
    vi.mocked(updateWish).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
    renderRouted();

    await screen.findByLabelText('Destino');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await screen.findByText('Você não tem permissão para editar desejos.');
    expect(screen.getByRole('heading', { name: 'Editar desejo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).not.toBeDisabled();
  });

  it('404 on load shows a safe message', async () => {
    vi.mocked(getWish).mockRejectedValue(new ApiError('Wish not found', 'NOT_FOUND', 404));
    renderRouted();

    expect(await screen.findByText('Desejo não encontrado.')).toBeInTheDocument();
  });
});
