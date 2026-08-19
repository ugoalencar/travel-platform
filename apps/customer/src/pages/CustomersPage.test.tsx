import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CustomersPage } from './CustomersPage';

vi.mock('../lib/api', () => ({
  listCustomers: vi.fn().mockResolvedValue([]),
  ApiError: class ApiError extends Error {},
}));

afterEach(() => {
  cleanup();
});

describe('CustomersPage', () => {
  it('renders the exact empty-state text when there are no customers', async () => {
    render(<CustomersPage />);

    expect(
      await screen.findByText('Nenhum cliente cadastrado ainda.'),
    ).toBeInTheDocument();
  });
});
