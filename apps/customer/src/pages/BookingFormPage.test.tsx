import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BookingFormPage } from './BookingFormPage';
import { createBooking, listCustomers, listDepartures, ApiError } from '../lib/api';
import type { Customer } from '../types/customer';
import type { ScheduledDeparture } from '../types/transport';

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
    createBooking: vi.fn(),
    listCustomers: vi.fn().mockResolvedValue([]),
    listDepartures: vi.fn().mockResolvedValue([]),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted() {
  return render(
    <MemoryRouter initialEntries={['/bookings/new']}>
      <Routes>
        <Route path="/bookings/new" element={<BookingFormPage />} />
        <Route path="/bookings/:id" element={<div>Booking details page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const customers: Customer[] = [
  {
    id: 'c1',
    agencyId: 'a1',
    name: 'Cliente Teste',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const departures: ScheduledDeparture[] = [
  {
    id: 'd1',
    agencyId: 'a1',
    productId: 'p1',
    departureAt: '2027-01-10T10:00:00.000Z',
    capacity: 10,
    serviceType: 'OWN',
    cancelled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'd2',
    agencyId: 'a1',
    productId: 'p1',
    departureAt: '2027-01-17T10:00:00.000Z',
    capacity: 10,
    serviceType: 'OWN',
    cancelled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('BookingFormPage', () => {
  it('hides the return-departure field for ONE_WAY and shows it for ROUND_TRIP', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(listDepartures).mockResolvedValue(departures);
    renderRouted();

    await screen.findByLabelText('Cliente (comprador da reserva)');
    expect(screen.queryByLabelText('Saída de volta')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tipo de viagem'), {
      target: { value: 'ROUND_TRIP' },
    });

    expect(screen.getByLabelText('Saída de volta')).toBeInTheDocument();
  });

  it('supports adding and removing passenger fields, enforcing at least one', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(listDepartures).mockResolvedValue(departures);
    renderRouted();

    await screen.findByLabelText('Cliente (comprador da reserva)');
    expect(screen.getAllByPlaceholderText('Nome do passageiro')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar passageiro' }));
    expect(screen.getAllByPlaceholderText('Nome do passageiro')).toHaveLength(2);

    const removeButtons = screen.getAllByRole('button', { name: 'Remover' });
    fireEvent.click(removeButtons[0]!);
    expect(screen.getAllByPlaceholderText('Nome do passageiro')).toHaveLength(1);

    // Cannot remove the last remaining passenger field.
    expect(screen.getByRole('button', { name: 'Remover' })).toBeDisabled();
  });

  it('submits a request body with the full passenger array and no forbidden fields', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(listDepartures).mockResolvedValue(departures);
    vi.mocked(createBooking).mockResolvedValue({
      booking: {
        id: 'b1',
        agencyId: 'a1',
        bookerCustomerId: 'c1',
        tripType: 'ONE_WAY',
        outboundDepartureId: 'd1',
        cancelled: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      passengers: [],
    });
    renderRouted();

    await screen.findByLabelText('Cliente (comprador da reserva)');
    fireEvent.change(screen.getByLabelText('Cliente (comprador da reserva)'), {
      target: { value: 'c1' },
    });
    fireEvent.change(screen.getByLabelText('Saída de ida'), { target: { value: 'd1' } });
    fireEvent.change(screen.getByPlaceholderText('Nome do passageiro'), {
      target: { value: 'Joao' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(createBooking).toHaveBeenCalled());
    const body = vi.mocked(createBooking).mock.calls[0]![0];
    expect(body).toEqual({
      bookerCustomerId: 'c1',
      tripType: 'ONE_WAY',
      outboundDepartureId: 'd1',
      passengers: [{ name: 'Joao' }],
    });
    expect(body).not.toHaveProperty('agencyId');
    expect(body).not.toHaveProperty('id');
    expect(body).not.toHaveProperty('cancelled');

    expect(await screen.findByText('Booking details page')).toBeInTheDocument();
  });

  it('surfaces a clean user-facing message on a capacity-rejection (409) error', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(listDepartures).mockResolvedValue(departures);
    vi.mocked(createBooking).mockRejectedValue(
      new ApiError('Requested passenger count exceeds remaining departure capacity', 'CONFLICT', 409),
    );
    renderRouted();

    await screen.findByLabelText('Cliente (comprador da reserva)');
    fireEvent.change(screen.getByLabelText('Cliente (comprador da reserva)'), {
      target: { value: 'c1' },
    });
    fireEvent.change(screen.getByLabelText('Saída de ida'), { target: { value: 'd1' } });
    fireEvent.change(screen.getByPlaceholderText('Nome do passageiro'), {
      target: { value: 'Joao' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText(
        'Não há assentos suficientes disponíveis nessa saída para o número de passageiros informado.',
      ),
    ).toBeInTheDocument();
  });
});
