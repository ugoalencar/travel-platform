import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportsPage } from './ReportsPage';
import * as api from '../lib/api';

// Mock API
vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}));

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display loading state initially', () => {
    (api.api.get as any).mockImplementation(
      () => new Promise(() => {
        /* Never resolves to keep loading state */
      }),
    );

    render(<ReportsPage />);
    expect(screen.getByRole('heading', { name: /Relatórios/i })).toBeInTheDocument();
  });

  it('should load reports from API', async () => {
    (api.api.get as any).mockImplementation((url: string) => {
      if (url.includes('/commercial/reports/sales')) {
        return Promise.resolve({
          data: {
            sales: [
              { period: 'Jun/2026', count: 5, total: '28000' },
              { period: 'Jul/2026', count: 8, total: '45000' },
            ],
          },
        });
      }
      if (url.includes('/commercial/reports/bookings')) {
        return Promise.resolve({
          data: {
            bookings: [
              { status: 'ACTIVE', count: 10 },
              { status: 'CANCELLED', count: 2 },
            ],
          },
        });
      }
      if (url.includes('/commercial/reports/proposals')) {
        return Promise.resolve({
          data: {
            proposals: {
              sent: 10,
              accepted: 6,
              conversionRate: '60.00',
            },
          },
        });
      }
      if (url.includes('/commercial/reports/destinations')) {
        return Promise.resolve({
          data: {
            destinations: [
              { destination: 'Portugal', bookingCount: 5, tripCount: 3 },
              { destination: 'Grécia', bookingCount: 3, tripCount: 2 },
            ],
          },
        });
      }
      if (url.includes('/commercial/reports/trips')) {
        return Promise.resolve({
          data: {
            trips: [
              { status: 'PLANNED', count: 5 },
              { status: 'CONFIRMED', count: 3 },
              { status: 'IN_PROGRESS', count: 1 },
              { status: 'COMPLETED', count: 2 },
              { status: 'CANCELLED', count: 0 },
            ],
          },
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Vendas no período/i)).toBeInTheDocument();
    });

    // Check that summary stats are displayed
    expect(screen.getByText(/Taxa de conversão/i)).toBeInTheDocument();
    expect(screen.getByText(/60\.00%/)).toBeInTheDocument();

    // Check that sales data is displayed
    expect(screen.getByText(/Vendas por período/i)).toBeInTheDocument();
    expect(screen.getByText(/Jun\/2026/)).toBeInTheDocument();

    // Check that destinations are displayed
    expect(screen.getByText(/Portugal/)).toBeInTheDocument();
    expect(screen.getByText(/Grécia/)).toBeInTheDocument();
  });

  it('should handle API errors gracefully', async () => {
    (api.api.get as any).mockRejectedValue(
      new Error('Network error'),
    );

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Erro ao carregar relatórios/i)).toBeInTheDocument();
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });
  });

  it('should handle rate limit errors', async () => {
    (api.api.get as any).mockRejectedValue({
      status: 429,
    });

    render(<ReportsPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Rate limit exceeded/i),
      ).toBeInTheDocument();
    });
  });

  it('should handle authorization errors', async () => {
    (api.api.get as any).mockRejectedValue({
      status: 403,
      data: { message: 'Forbidden' },
    });

    render(<ReportsPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/You do not have permission/i),
      ).toBeInTheDocument();
    });
  });

  it('should allow changing date range', async () => {
    const user = userEvent.setup();
    let capturedUrl = '';

    (api.api.get as any).mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ data: { sales: [] } });
    });

    render(<ReportsPage />);

    const startDateInput = screen.getByLabelText(/Data Inicial/i) as HTMLInputElement;
    const endDateInput = screen.getByLabelText(/Data Final/i) as HTMLInputElement;

    await user.clear(startDateInput);
    await user.type(startDateInput, '2026-02-01');

    await waitFor(() => {
      expect((api.api.get as any)).toHaveBeenCalledWith(
        expect.stringContaining('start_date=2026-02-01'),
      );
    });

    await user.clear(endDateInput);
    await user.type(endDateInput, '2026-03-31');

    await waitFor(() => {
      expect((api.api.get as any)).toHaveBeenCalledWith(
        expect.stringContaining('end_date=2026-03-31'),
      );
    });
  });

  it('should display empty states when no data', async () => {
    (api.api.get as any).mockImplementation(() =>
      Promise.resolve({
        data: {
          sales: [],
          bookings: [],
          proposals: { sent: 0, accepted: 0, conversionRate: '0.00' },
          destinations: [],
          trips: [],
        },
      }),
    );

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Nenhum dado de vendas/i)).toBeInTheDocument();
      expect(screen.getByText(/Nenhum destino com dados/i)).toBeInTheDocument();
    });
  });

  it('should format currency correctly', async () => {
    (api.api.get as any).mockImplementation((url: string) => {
      if (url.includes('/commercial/reports/sales')) {
        return Promise.resolve({
          data: {
            sales: [{ period: 'Jun/2026', count: 5, total: '28000.00' }],
          },
        });
      }
      return Promise.resolve({ data: { bookings: [], proposals: {}, destinations: [], trips: [] } });
    });

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByText(/R\$\s*28\.000/)).toBeInTheDocument();
    });
  });

  it('should fetch all reports in parallel', async () => {
    (api.api.get as any).mockImplementation(() =>
      Promise.resolve({
        data: { sales: [], bookings: [], proposals: {}, destinations: [], trips: [] },
      }),
    );

    render(<ReportsPage />);

    await waitFor(() => {
      // Should call all 5 report endpoints
      expect((api.api.get as any).mock.calls.length).toBe(5);
    });

    // Verify all expected endpoints were called
    const calls = (api.api.get as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((url: string) => url.includes('/commercial/reports/sales'))).toBe(true);
    expect(calls.some((url: string) => url.includes('/commercial/reports/bookings'))).toBe(true);
    expect(calls.some((url: string) => url.includes('/commercial/reports/proposals'))).toBe(true);
    expect(calls.some((url: string) => url.includes('/commercial/reports/destinations'))).toBe(true);
    expect(calls.some((url: string) => url.includes('/commercial/reports/trips'))).toBe(true);
  });
});
