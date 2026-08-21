import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TripEditPage } from './TripEditPage';
import { TripDetailsPage } from './TripDetailsPage';
import { getTrip, updateTrip, getCustomer, ApiError } from '../lib/api';
import type { Trip } from '../types/trip';

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
    getTrip: vi.fn(),
    updateTrip: vi.fn(),
    getCustomer: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const baseTrip: Trip = {
  id: 't1',
  agencyId: 'a1',
  customerId: 'c1',
  name: 'Lua de mel Paris',
  destination: 'Paris',
  description: 'Viagem de casamento',
  startDate: '2026-06-01',
  endDate: '2026-06-10',
  status: 'PLANNED',
  notes: 'Rotor dmg',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderRouted(initialEntries: string[] = ['/trips/t1/edit']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/trips/:id" element={<TripDetailsPage />} />
        <Route path="/trips/:id/edit" element={<TripEditPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TripEditPage', () => {
  it('renders at /trips/:id/edit', async () => {
    vi.mocked(getTrip).mockResolvedValue(baseTrip);
    renderRouted();

    expect(
      await screen.findByRole('heading', { name: 'Editar viagem' }),
    ).toBeInTheDocument();
  });

  it('loads and pre-fills existing trip data into the form fields', async () => {
    vi.mocked(getTrip).mockResolvedValue(baseTrip);
    renderRouted();

    expect(await screen.findByLabelText('Nome')).toHaveValue('Lua de mel Paris');
    expect(screen.getByLabelText('Destino')).toHaveValue('Paris');
    expect(screen.getByLabelText('Data de início')).toHaveValue('2026-06-01');
    expect(screen.getByLabelText('Data de fim')).toHaveValue('2026-06-10');
    expect(screen.getByLabelText('Descrição')).toHaveValue('Viagem de casamento');
    expect(screen.getByLabelText('Notas')).toHaveValue('Rotor dmg');
  });

  it('no customerId or saleId fields are rendered', async () => {
    vi.mocked(getTrip).mockResolvedValue(baseTrip);
    renderRouted();

    await screen.findByLabelText('Nome');
    expect(screen.queryByLabelText('Cliente')).not.toBeInTheDocument();
    expect(screen.queryByText('saleId')).not.toBeInTheDocument();
  });

  it('status is not rendered as an editable field', async () => {
    vi.mocked(getTrip).mockResolvedValue(baseTrip);
    renderRouted();

    await screen.findByLabelText('Nome');
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
  });

  it('editing a field changes its value', async () => {
    vi.mocked(getTrip).mockResolvedValue(baseTrip);
    renderRouted();

    const nameInput = await screen.findByLabelText('Nome');
    fireEvent.change(nameInput, { target: { value: 'Aventura Lisboa' } });
    expect(nameInput).toHaveValue('Aventura Lisboa');
  });

  it('valid submit calls updateTrip(id, input) with only allowed fields', async () => {
    vi.mocked(getTrip).mockResolvedValue(baseTrip);
    vi.mocked(updateTrip).mockResolvedValue({ ...baseTrip, name: 'Aventura Lisboa' });
    renderRouted();

    const nameInput = await screen.findByLabelText('Nome');
    fireEvent.change(nameInput, { target: { value: 'Aventura Lisboa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
    expect(updateTrip).toHaveBeenCalledWith('t1', {
      name: 'Aventura Lisboa',
      destination: 'Paris',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
      description: 'Viagem de casamento',
      notes: 'Rotor dmg',
    });
  });

  it('payload never contains customerId, status, saleId, agencyId', async () => {
    vi.mocked(getTrip).mockResolvedValue(baseTrip);
    vi.mocked(updateTrip).mockResolvedValue(baseTrip);
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(updateTrip).mock.calls[0]?.[1] as unknown as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty('customerId');
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('saleId');
    expect(payload).not.toHaveProperty('agencyId');
    expect(payload).not.toHaveProperty('tenantId');
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('createdAt');
  });

  it('submitting state / button text change', async () => {
    vi.mocked(getTrip).mockResolvedValue(baseTrip);
    let resolvePromise: (value: Trip) => void = () => {};
    vi.mocked(updateTrip).mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('button', { name: 'Salvando...' })).toBeDisabled();

    resolvePromise(baseTrip);
    await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
  });

  it('blocks double submit — rapid clicks call updateTrip exactly once', async () => {
    vi.mocked(getTrip).mockResolvedValue(baseTrip);
    let resolvePromise: (value: Trip) => void = () => {};
    vi.mocked(updateTrip).mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    renderRouted();

    await screen.findByLabelText('Nome');
    const submitButton = screen.getByRole('button', { name: 'Salvar' });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(updateTrip).toHaveBeenCalledTimes(1);

    resolvePromise(baseTrip);
    await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
  });

  it('cancel does not call updateTrip, navigates to details', async () => {
    vi.mocked(getTrip).mockResolvedValue(baseTrip);
    vi.mocked(getCustomer).mockRejectedValue(new ApiError('Not found', 'NOT_FOUND', 404));
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(updateTrip).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('heading', { name: 'Detalhes da viagem' }),
    ).toBeInTheDocument();
  });

  it('success navigates to /trips/:id', async () => {
    vi.mocked(getTrip).mockResolvedValue(baseTrip);
    vi.mocked(updateTrip).mockResolvedValue(baseTrip);
    vi.mocked(getCustomer).mockRejectedValue(new ApiError('Not found', 'NOT_FOUND', 404));
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByRole('heading', { name: 'Detalhes da viagem' }),
    ).toBeInTheDocument();
  });

  it('400 error shows the backend message', async () => {
    vi.mocked(getTrip).mockResolvedValue(baseTrip);
    vi.mocked(updateTrip).mockRejectedValue(
      new ApiError('Field "startDate" must not be after "endDate"', 'VALIDATION_ERROR', 400),
    );
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Field "startDate" must not be after "endDate"'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/VALIDATION_ERROR/)).not.toBeInTheDocument();
  });

  it('403 error shows a safe permission message', async () => {
    vi.mocked(getTrip).mockResolvedValue(baseTrip);
    vi.mocked(updateTrip).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Você não tem permissão para editar viagens.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/FORBIDDEN/)).not.toBeInTheDocument();
  });

  it('500/unknown error shows a generic safe fallback', async () => {
    vi.mocked(getTrip).mockResolvedValue(baseTrip);
    vi.mocked(updateTrip).mockRejectedValue(
      new ApiError('Internal server error', 'INTERNAL_ERROR', 500),
    );
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Não foi possível salvar a viagem. Tente novamente.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/INTERNAL_ERROR/)).not.toBeInTheDocument();
  });

  it('404 on load shows a safe message', async () => {
    vi.mocked(getTrip).mockRejectedValue(new ApiError('Trip not found', 'NOT_FOUND', 404));
    renderRouted();

    expect(await screen.findByText('Viagem não encontrada.')).toBeInTheDocument();
  });
});
