import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderRouted } from '../test/render';
import * as api from '../lib/api';
import type { Wish } from '../types/wish';
import type { Customer } from '../types/customer';

vi.mock('../lib/api', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    listWishes: vi.fn(),
    listCustomers: vi.fn(),
    getWish: vi.fn(),
    getCustomer: vi.fn(),
    listTripsByCustomer: vi.fn(),
    createWish: vi.fn(),
    updateWish: vi.fn(),
  };
});

const customerLucas: Customer = {
  id: 'cust-001',
  agencyId: 'agency-demo-001',
  name: 'Lucas Martins',
  email: 'lucas.martins@email.com',
  status: 'ACTIVE',
  createdAt: '2024-03-15T10:00:00.000Z',
  updatedAt: '2026-08-10T14:30:00.000Z',
};

const customerAna: Customer = {
  id: 'cust-002',
  agencyId: 'agency-demo-001',
  name: 'Ana Beatriz Souza',
  status: 'ACTIVE',
  createdAt: '2024-06-20T08:00:00.000Z',
  updatedAt: '2026-07-22T09:15:00.000Z',
};

const wishPortugal: Wish = {
  id: 'wish-001',
  agencyId: 'agency-demo-001',
  customerId: 'cust-001',
  destination: 'Portugal (Lisboa + Porto)',
  startDate: '2026-10-15T00:00:00.000Z',
  endDate: '2026-10-28T00:00:00.000Z',
  budget: 35000,
  travelersCount: 4,
  notes: 'Família com 2 filhos.',
  status: 'PROPOSED',
  createdAt: '2026-06-20T10:00:00.000Z',
  updatedAt: '2026-07-15T14:00:00.000Z',
};

const wishJapan: Wish = {
  id: 'wish-004',
  agencyId: 'agency-demo-001',
  customerId: 'cust-002',
  destination: 'Japão (Tóquio + Kyoto)',
  budget: 45000,
  travelersCount: 2,
  status: 'ACTIVE',
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-20T10:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(api.listWishes).mockResolvedValue([wishPortugal, wishJapan]);
  vi.mocked(api.listCustomers).mockResolvedValue([customerLucas, customerAna]);
  vi.mocked(api.getWish).mockImplementation((id: string) =>
    Promise.resolve([wishPortugal, wishJapan].find((w) => w.id === id) ?? Promise.reject(
      new api.ApiError('not found', 'NOT_FOUND', 404),
    )),
  );
  vi.mocked(api.getCustomer).mockImplementation((id: string) =>
    Promise.resolve([customerLucas, customerAna].find((c) => c.id === id)!),
  );
  vi.mocked(api.listTripsByCustomer).mockResolvedValue([]);
});

describe('WishesPage', () => {
  it('shows the full wish list', async () => {
    renderRouted('/wishes');
    expect((await screen.findAllByText(/Portugal/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Japão/)).toBeInTheDocument();
  });

  it('filters wishes by search term on destination', async () => {
    renderRouted('/wishes');
    const input = await screen.findByPlaceholderText(/Buscar por destino/);
    fireEvent.change(input, { target: { value: 'Japão' } });
    expect(screen.getByText(/Japão/)).toBeInTheDocument();
    expect(screen.queryByText(/Portugal/)).not.toBeInTheDocument();
  });

  it('shows empty state on no matches', async () => {
    renderRouted('/wishes');
    const input = await screen.findByPlaceholderText(/Buscar por destino/);
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText('Nenhum desejo encontrado')).toBeInTheDocument();
  });

  it('links to wish detail', async () => {
    renderRouted('/wishes');
    const wish = (await screen.findAllByText(/Portugal/))[0];
    expect(wish).toBeDefined();
    expect(wish?.closest('a')).toHaveAttribute('href', '/wishes/wish-001');
  });

  it('shows budget and travelers', async () => {
    renderRouted('/wishes');
    await screen.findAllByText(/Portugal/);
    expect(screen.getByText(/R\$\s*35\.000,00/)).toBeInTheDocument();
    expect(screen.getAllByText(/viajantes/).length).toBeGreaterThan(0);
  });

  it('shows an error state and allows retry when the API call fails', async () => {
    vi.mocked(api.listWishes).mockRejectedValueOnce(new api.ApiError('boom', 'UNKNOWN_ERROR', 500));
    renderRouted('/wishes');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    vi.mocked(api.listWishes).mockResolvedValueOnce([wishPortugal, wishJapan]);
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }));
    expect((await screen.findAllByText(/Portugal/)).length).toBeGreaterThan(0);
  });

  it('creates a new wish via the API and refreshes the list', async () => {
    const created: Wish = { ...wishPortugal, id: 'wish-999', destination: 'Islândia' };
    vi.mocked(api.createWish).mockResolvedValue(created);
    renderRouted('/wishes');
    await screen.findAllByText(/Portugal/);
    fireEvent.click(screen.getByRole('button', { name: /Novo desejo/ }));
    fireEvent.change(screen.getByPlaceholderText(/Portugal, Grécia/), { target: { value: 'Islândia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => {
      expect(api.createWish).toHaveBeenCalledWith(
        expect.objectContaining({ destination: 'Islândia' }),
      );
    });
  });
});

describe('WishDetailPage', () => {
  it('shows destination, budget, travelers, and window', async () => {
    renderRouted('/wishes/wish-001');
    expect(await screen.findByRole('heading', { name: /Portugal/ })).toBeInTheDocument();
    expect(screen.getByText('Orçamento')).toBeInTheDocument();
    expect(screen.getByText('Viajantes')).toBeInTheDocument();
    expect(screen.getByText('Período')).toBeInTheDocument();
  });

  it('shows status', async () => {
    renderRouted('/wishes/wish-001');
    await screen.findByRole('heading', { name: /Portugal/ });
    expect(screen.getAllByText('Em proposta').length).toBeGreaterThan(0);
  });

  it('allows opening the new wish modal', async () => {
    renderRouted('/wishes/wish-001');
    await screen.findByRole('heading', { name: /Portugal/ });
    fireEvent.click(screen.getByRole('button', { name: /Criar desejo/ }));
    expect(screen.getByRole('dialog', { name: 'Novo desejo' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Portugal/)).toBeInTheDocument();
  });

  it('persists a new wish created from the wish-detail modal via the API (fixes the prior no-op)', async () => {
    const created: Wish = { ...wishPortugal, id: 'wish-999' };
    vi.mocked(api.createWish).mockResolvedValue(created);
    renderRouted('/wishes/wish-001');
    await screen.findByRole('heading', { name: /Portugal/ });
    fireEvent.click(screen.getByRole('button', { name: /Criar desejo/ }));
    fireEvent.change(screen.getByPlaceholderText(/Portugal, Grécia/), { target: { value: 'Nova Zelândia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => {
      expect(api.createWish).toHaveBeenCalledWith(
        expect.objectContaining({ destination: 'Nova Zelândia' }),
      );
    });
  });

  it('edits the wish via the API', async () => {
    const updated: Wish = { ...wishPortugal, destination: 'Espanha' };
    vi.mocked(api.updateWish).mockResolvedValue(updated);
    renderRouted('/wishes/wish-001');
    await screen.findByRole('heading', { name: /Portugal/ });
    fireEvent.click(screen.getByRole('button', { name: /Editar/ }));
    const dialog = screen.getByRole('dialog', { name: 'Editar desejo' });
    const destinationInput = dialog.querySelectorAll('input')[0]!;
    fireEvent.change(destinationInput, { target: { value: 'Espanha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => {
      expect(api.updateWish).toHaveBeenCalledWith('wish-001', expect.objectContaining({ destination: 'Espanha' }));
    });
  });

  it('shows error state for unknown wish', async () => {
    renderRouted('/wishes/unknown');
    expect(await screen.findByText('Desejo não encontrado')).toBeInTheDocument();
  });
});
