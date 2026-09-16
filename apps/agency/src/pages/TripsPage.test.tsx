import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderRouted } from '../test/render';
import * as api from '../lib/api';
import type { Trip } from '../types/trip';
import type { Customer } from '../types/customer';

vi.mock('../lib/api', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    listTrips: vi.fn(),
    listCustomers: vi.fn(),
    getTrip: vi.fn(),
    getCustomer: vi.fn(),
    createTrip: vi.fn(),
    updateTrip: vi.fn(),
    listAirServicesByTrip: vi.fn(),
    listLandServicesByTrip: vi.fn(),
    listSales: vi.fn(),
  };
});

const customerLucas: Customer = {
  id: 'cust-001',
  agencyId: 'agency-demo-001',
  protocolNumber: 'CLI-2026-000001',
  name: 'Lucas Martins',
  status: 'ACTIVE',
  createdAt: '2024-03-15T10:00:00.000Z',
  updatedAt: '2026-08-10T14:30:00.000Z',
};

const customerAna: Customer = {
  id: 'cust-002',
  agencyId: 'agency-demo-001',
  protocolNumber: 'CLI-2026-000002',
  name: 'Ana Beatriz Souza',
  status: 'ACTIVE',
  createdAt: '2024-06-20T08:00:00.000Z',
  updatedAt: '2026-07-22T09:15:00.000Z',
};

const tripPortugal: Trip = {
  id: 'trip-001',
  agencyId: 'agency-demo-001',
  customerId: 'cust-001',
  name: 'Família Martins — Portugal',
  destination: 'Lisboa + Porto, Portugal',
  description: 'Rota cultural por Portugal.',
  startDate: '2026-10-15T00:00:00.000Z',
  endDate: '2026-10-28T00:00:00.000Z',
  status: 'CONFIRMED',
  category: 'TERRESTRE',
  notes: 'Documentação em dia.',
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-08-10T14:30:00.000Z',
};

const tripGreece: Trip = {
  id: 'trip-002',
  agencyId: 'agency-demo-001',
  customerId: 'cust-002',
  name: 'Ana & Marcos — Grécia',
  destination: 'Atenas + Santorini, Grécia',
  startDate: '2026-09-01T00:00:00.000Z',
  endDate: '2026-09-14T00:00:00.000Z',
  status: 'CONFIRMED',
  category: 'TERRESTRE',
  createdAt: '2026-07-25T09:00:00.000Z',
  updatedAt: '2026-08-15T11:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(api.listTrips).mockResolvedValue([tripPortugal, tripGreece]);
  vi.mocked(api.listCustomers).mockResolvedValue([customerLucas, customerAna]);
  vi.mocked(api.getTrip).mockImplementation((id: string) =>
    Promise.resolve([tripPortugal, tripGreece].find((t) => t.id === id)!),
  );
  vi.mocked(api.getCustomer).mockImplementation((id: string) =>
    Promise.resolve([customerLucas, customerAna].find((c) => c.id === id)!),
  );
  vi.mocked(api.listAirServicesByTrip).mockResolvedValue([]);
  vi.mocked(api.listLandServicesByTrip).mockResolvedValue([]);
  vi.mocked(api.listSales).mockResolvedValue([]);
});

describe('TripsPage', () => {
  it('shows the full trip list', async () => {
    renderRouted('/trips');
    expect(await screen.findByText('Família Martins — Portugal')).toBeInTheDocument();
    expect(screen.getByText('Ana & Marcos — Grécia')).toBeInTheDocument();
  });

  it('filters trips by search term on destination', async () => {
    renderRouted('/trips');
    const input = await screen.findByPlaceholderText(/Buscar por nome, destino/);
    fireEvent.change(input, { target: { value: 'Grécia' } });
    expect(screen.getByText('Ana & Marcos — Grécia')).toBeInTheDocument();
    expect(screen.queryByText('Família Martins — Portugal')).not.toBeInTheDocument();
  });

  it('shows empty state on no matches', async () => {
    renderRouted('/trips');
    const input = await screen.findByPlaceholderText(/Buscar por nome, destino/);
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText('Nenhuma viagem encontrada')).toBeInTheDocument();
  });

  it('links to trip detail', async () => {
    renderRouted('/trips');
    const trip = await screen.findByText('Família Martins — Portugal');
    expect(trip.closest('a')).toHaveAttribute('href', '/trips/trip-001');
  });

  it('shows an error state and allows retry when the API call fails', async () => {
    vi.mocked(api.listTrips).mockRejectedValueOnce(new api.ApiError('boom', 'UNKNOWN_ERROR', 500));
    renderRouted('/trips');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    vi.mocked(api.listTrips).mockResolvedValueOnce([tripPortugal, tripGreece]);
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }));
    expect(await screen.findByText('Família Martins — Portugal')).toBeInTheDocument();
  });

  it('creates a new trip via the API and refreshes the list', async () => {
    const created: Trip = { ...tripPortugal, id: 'trip-999', name: 'Nova viagem' };
    vi.mocked(api.createTrip).mockResolvedValue(created);
    renderRouted('/trips');
    await screen.findByText('Família Martins — Portugal');
    fireEvent.click(screen.getByRole('button', { name: /Nova viagem/ }));
    fireEvent.change(screen.getByPlaceholderText(/Família Martins/), { target: { value: 'Nova viagem' } });
    fireEvent.change(screen.getByPlaceholderText(/Lisboa \+ Porto/), { target: { value: 'Roma' } });
    const dialog = screen.getByRole('dialog', { name: 'Nova viagem' });
    const dateInputs = dialog.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0]!, { target: { value: '2026-12-01' } });
    fireEvent.change(dateInputs[1]!, { target: { value: '2026-12-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => {
      expect(api.createTrip).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Nova viagem', destination: 'Roma' }),
      );
    });
  });
});

describe('TripDetailPage', () => {
  it('shows trip overview with destination, dates, and status', async () => {
    renderRouted('/trips/trip-001');
    expect(await screen.findByRole('heading', { name: 'Família Martins — Portugal' })).toBeInTheDocument();
    expect(screen.getAllByText(/Lisboa \+ Porto, Portugal/).length).toBeGreaterThan(0);
    expect(screen.getByText('Destino')).toBeInTheDocument();
    expect(screen.getByText('Período')).toBeInTheDocument();
    expect(screen.getAllByText('Confirmada').length).toBeGreaterThan(0);
  });

  it('shows related tab without crashing (proposals out of CORE-A scope)', async () => {
    renderRouted('/trips/trip-001');
    await screen.findByRole('heading', { name: 'Família Martins — Portugal' });
    fireEvent.click(screen.getByRole('tab', { name: 'Relacionados' }));
    expect(screen.getAllByText('Propostas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vendas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Aéreo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Terrestre').length).toBeGreaterThan(0);
  });

  it('edits the trip via the API', async () => {
    const updated: Trip = { ...tripPortugal, name: 'Família Martins — Portugal (atualizado)' };
    vi.mocked(api.updateTrip).mockResolvedValue(updated);
    renderRouted('/trips/trip-001');
    await screen.findByRole('heading', { name: 'Família Martins — Portugal' });
    fireEvent.click(screen.getByRole('button', { name: /Editar/ }));
    const dialog = screen.getByRole('dialog', { name: 'Editar viagem' });
    const nameInput = dialog.querySelectorAll('input')[0]!;
    fireEvent.change(nameInput, { target: { value: 'Família Martins — Portugal (atualizado)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => {
      expect(api.updateTrip).toHaveBeenCalledWith(
        'trip-001',
        expect.objectContaining({ name: 'Família Martins — Portugal (atualizado)' }),
      );
    });
  });

  it('shows error state for unknown trip', async () => {
    vi.mocked(api.getTrip).mockRejectedValueOnce(new api.ApiError('not found', 'NOT_FOUND', 404));
    renderRouted('/trips/unknown');
    expect(await screen.findByText('Viagem não encontrada')).toBeInTheDocument();
  });
});
