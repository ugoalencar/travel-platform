import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { WishDetailsPage } from './WishDetailsPage';
import { WishesPage } from './WishesPage';
import { WishEditPage } from './WishEditPage';
import { getWish, getCustomer, listWishes, ApiError } from '../lib/api';
import type { Wish } from '../types/wish';
import type { Customer } from '../types/customer';

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
    listWishes: vi.fn().mockResolvedValue([]),
    getWish: vi.fn(),
    getCustomer: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[] = ['/wishes/w1']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/wishes" element={<WishesPage />} />
        <Route path="/wishes/:id" element={<WishDetailsPage />} />
        <Route path="/wishes/:id/edit" element={<WishEditPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const fullWish: Wish = {
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

const customer: Customer = {
  id: 'c1',
  agencyId: 'a1',
  name: 'Maria Silva',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('WishDetailsPage', () => {
  it('renders with a loading state first', () => {
    vi.mocked(getWish).mockReturnValue(new Promise(() => {}));
    renderRouted();

    expect(screen.getByText('Carregando desejo...')).toBeInTheDocument();
  });

  it('renders real wish data with all fields, including customer name', async () => {
    vi.mocked(getWish).mockResolvedValue(fullWish);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted();

    expect(await screen.findByText('Paris')).toBeInTheDocument();
    expect(screen.getByText('2026-06-01')).toBeInTheDocument();
    expect(screen.getByText('2026-06-10')).toBeInTheDocument();
    expect(screen.getByText('5000')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Honeymoon')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
  });

  it('falls back to raw customerId when customer lookup fails', async () => {
    vi.mocked(getWish).mockResolvedValue(fullWish);
    vi.mocked(getCustomer).mockRejectedValue(new ApiError('Not found', 'NOT_FOUND', 404));
    renderRouted();

    await screen.findByText('Paris');
    expect(screen.getByText('c1')).toBeInTheDocument();
  });

  it('optional fields render "—" when missing', async () => {
    vi.mocked(getWish).mockResolvedValue({
      id: 'w2',
      agencyId: 'a1',
      customerId: 'c1',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted(['/wishes/w2']);

    await screen.findByText('ACTIVE');
    // destination, startDate, endDate, budget, travelersCount, notes all missing -> 6 dashes
    expect(screen.getAllByText('—')).toHaveLength(6);
  });

  it('404 shows a safe generic message, never implying cross-tenant existence', async () => {
    vi.mocked(getWish).mockRejectedValue(new ApiError('Wish not found', 'NOT_FOUND', 404));
    renderRouted();

    expect(await screen.findByText('Desejo não encontrado.')).toBeInTheDocument();
    expect(screen.queryByText(/outra agência/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NOT_FOUND/)).not.toBeInTheDocument();
  });

  it('generic/other errors show a safe message', async () => {
    vi.mocked(getWish).mockRejectedValue(
      new ApiError('Internal server error', 'INTERNAL_ERROR', 500),
    );
    renderRouted();

    expect(
      await screen.findByText('Não foi possível carregar o desejo. Tente novamente.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/INTERNAL_ERROR/)).not.toBeInTheDocument();
  });

  it('"Editar" navigates to /wishes/:id/edit', async () => {
    vi.mocked(getWish).mockResolvedValue(fullWish);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));

    expect(
      await screen.findByRole('heading', { name: 'Editar desejo' }),
    ).toBeInTheDocument();
  });

  it('"Voltar" navigates to /wishes', async () => {
    vi.mocked(getWish).mockResolvedValue(fullWish);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    vi.mocked(listWishes).mockResolvedValue([]);
    renderRouted();

    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }));

    expect(await screen.findByRole('heading', { name: 'Desejos' })).toBeInTheDocument();
  });

  it('calls getWish with the correct id', async () => {
    vi.mocked(getWish).mockResolvedValue(fullWish);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted();

    await waitFor(() => expect(getWish).toHaveBeenCalledWith('w1'));
  });
});
