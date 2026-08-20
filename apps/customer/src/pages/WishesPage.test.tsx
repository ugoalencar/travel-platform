import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { WishesPage } from './WishesPage';
import { WishFormPage } from './WishFormPage';
import { WishDetailsPage } from './WishDetailsPage';
import { listWishes, getWish, ApiError } from '../lib/api';
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
    listWishes: vi.fn().mockResolvedValue([]),
    listCustomers: vi.fn().mockResolvedValue([]),
    getWish: vi.fn(),
    getCustomer: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[] = ['/wishes']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/wishes" element={<WishesPage />} />
        <Route path="/wishes/new" element={<WishFormPage />} />
        <Route path="/wishes/:id" element={<WishDetailsPage />} />
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

describe('WishesPage', () => {
  it('renders with a loading state first', () => {
    vi.mocked(listWishes).mockReturnValue(new Promise(() => {}));
    renderRouted();

    expect(screen.getByText('Carregando desejos...')).toBeInTheDocument();
  });

  it('renders real wish data with fields', async () => {
    vi.mocked(listWishes).mockResolvedValue([fullWish]);
    renderRouted();

    expect(await screen.findByText('Paris')).toBeInTheDocument();
    expect(screen.getByText('5000')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('2026-06-01')).toBeInTheDocument();
    expect(screen.getByText('2026-06-10')).toBeInTheDocument();
  });

  it('optional fields render "—" when missing', async () => {
    vi.mocked(listWishes).mockResolvedValue([
      {
        id: 'w2',
        agencyId: 'a1',
        customerId: 'c1',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    renderRouted();

    await screen.findByText('ACTIVE');
    // destination, budget, travelersCount, startDate, endDate all missing -> 5 dashes
    expect(screen.getAllByText('—')).toHaveLength(5);
  });

  it('empty state', async () => {
    vi.mocked(listWishes).mockResolvedValue([]);
    renderRouted();

    expect(
      await screen.findByText('Nenhum desejo cadastrado ainda.'),
    ).toBeInTheDocument();
  });

  it('safe error state', async () => {
    vi.mocked(listWishes).mockRejectedValue(
      new ApiError('Internal server error', 'INTERNAL_ERROR', 500),
    );
    renderRouted();

    expect(await screen.findByText('Internal server error')).toBeInTheDocument();
  });

  it('navigates to /wishes/new when "+ Novo desejo" is clicked', async () => {
    vi.mocked(listWishes).mockResolvedValue([]);
    renderRouted();

    await screen.findByRole('heading', { name: 'Desejos' });
    fireEvent.click(screen.getByRole('button', { name: '+ Novo desejo' }));

    expect(
      await screen.findByRole('heading', { name: 'Novo desejo' }),
    ).toBeInTheDocument();
  });

  it('"Detalhes" navigates to /wishes/:id', async () => {
    vi.mocked(listWishes).mockResolvedValue([fullWish]);
    vi.mocked(getWish).mockReturnValue(new Promise(() => {}));
    renderRouted();

    fireEvent.click(await screen.findByRole('button', { name: 'Detalhes' }));

    expect(
      await screen.findByRole('heading', { name: 'Detalhes do desejo' }),
    ).toBeInTheDocument();
  });
});
