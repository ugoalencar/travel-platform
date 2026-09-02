import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';

// Mock the API module
vi.mock('../lib/api', () => ({
  ApiError: class ApiError extends Error {
    code: string;
    status: number;
    constructor(message: string, code: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
  listProposals: vi.fn(() => Promise.resolve([])),
  getProposal: vi.fn(() => Promise.reject(new Error('Not found'))),
  listBookings: vi.fn(() => Promise.resolve([])),
  getBooking: vi.fn(() => Promise.reject(new Error('Not found'))),
}));

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('UI-03 sales journey prototype', () => {
  it('renders the proposal list page with journey rail', async () => {
    renderRoute('/proposals');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Jornada comercial' })).toBeInTheDocument();
    });

    expect(screen.getAllByText('Wish').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Proposal').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Booking').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sale').length).toBeGreaterThan(0);
  });

  it('renders the booking list page with journey rail', async () => {
    renderRoute('/bookings');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Reservas operacionais' })).toBeInTheDocument();
    });

    expect(screen.getAllByText('Booking').length).toBeGreaterThan(0);
  });

  it('renders the sales list page', async () => {
    renderRoute('/sales');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Vendas realizadas' })).toBeInTheDocument();
    });
  });

  it('renders the proposal builder page', async () => {
    renderRoute('/proposals/test-id/edit');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Builder de proposta' })).toBeInTheDocument();
    });
  });

  it('renders the proposal preview page', async () => {
    renderRoute('/proposals/test-id/preview');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Prévia de proposta' })).toBeInTheDocument();
    });
  });
});
