import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SupplierDetailsPage } from './SupplierDetailsPage';
import { getSupplier, ApiError } from '../lib/api';

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
  return { getSupplier: vi.fn(), ApiError: MockApiError };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted() {
  return render(
    <MemoryRouter initialEntries={['/transport/suppliers/s1']}>
      <Routes>
        <Route path="/transport/suppliers/:id" element={<SupplierDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SupplierDetailsPage', () => {
  it('renders supplier fields on success', async () => {
    vi.mocked(getSupplier).mockResolvedValue({
      id: 's1',
      agencyId: 'a1',
      name: 'Fast Bus Ltda',
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderRouted();
    expect(await screen.findByText('Fast Bus Ltda')).toBeInTheDocument();
  });

  it('shows a 404 message when not found', async () => {
    vi.mocked(getSupplier).mockRejectedValue(new ApiError('not found', 'NOT_FOUND', 404));
    renderRouted();
    expect(await screen.findByText('Fornecedor não encontrado.')).toBeInTheDocument();
  });
});
