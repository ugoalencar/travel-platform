import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SuppliersPage } from './SuppliersPage';
import { listSuppliers, ApiError } from '../lib/api';
import type { Supplier } from '../types/transport';

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
  return { listSuppliers: vi.fn().mockResolvedValue([]), ApiError: MockApiError };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted() {
  return render(
    <MemoryRouter initialEntries={['/transport/suppliers']}>
      <Routes>
        <Route path="/transport/suppliers" element={<SuppliersPage />} />
        <Route path="/transport/suppliers/new" element={<div>Novo fornecedor page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const suppliers: Supplier[] = [
  {
    id: 's1',
    agencyId: 'a1',
    name: 'Fast Bus Ltda',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('SuppliersPage', () => {
  it('shows a loading state initially', () => {
    vi.mocked(listSuppliers).mockReturnValue(new Promise(() => {}));
    renderRouted();
    expect(screen.getByText('Carregando fornecedores...')).toBeInTheDocument();
  });

  it('renders real data', async () => {
    vi.mocked(listSuppliers).mockResolvedValue(suppliers);
    renderRouted();
    expect(await screen.findByText('Fast Bus Ltda')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    vi.mocked(listSuppliers).mockResolvedValue([]);
    renderRouted();
    expect(await screen.findByText('Nenhum fornecedor cadastrado ainda.')).toBeInTheDocument();
  });

  it('shows an error message on failure', async () => {
    vi.mocked(listSuppliers).mockRejectedValue(new ApiError('Erro', 'INTERNAL_ERROR', 500));
    renderRouted();
    expect(await screen.findByText('Erro')).toBeInTheDocument();
  });

  it('navigates to new supplier form', async () => {
    vi.mocked(listSuppliers).mockResolvedValue([]);
    renderRouted();
    await screen.findByText('Nenhum fornecedor cadastrado ainda.');
    fireEvent.click(screen.getByRole('button', { name: '+ Novo fornecedor' }));
    expect(await screen.findByText('Novo fornecedor page')).toBeInTheDocument();
  });
});
