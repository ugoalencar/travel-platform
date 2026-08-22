import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SupplierEditPage } from './SupplierEditPage';
import { getSupplier, updateSupplier } from '../lib/api';

vi.mock('../lib/api', () => ({ getSupplier: vi.fn(), updateSupplier: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted() {
  return render(
    <MemoryRouter initialEntries={['/transport/suppliers/s1/edit']}>
      <Routes>
        <Route path="/transport/suppliers/:id/edit" element={<SupplierEditPage />} />
        <Route path="/transport/suppliers/:id" element={<div>Details page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SupplierEditPage', () => {
  it('loads current values and includes the active toggle', async () => {
    vi.mocked(getSupplier).mockResolvedValue({
      id: 's1',
      agencyId: 'a1',
      name: 'Fast Bus Ltda',
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderRouted();
    expect(await screen.findByDisplayValue('Fast Bus Ltda')).toBeInTheDocument();
    expect(screen.getByLabelText('Ativo')).toBeChecked();
  });

  it('submits updates and navigates to details', async () => {
    vi.mocked(getSupplier).mockResolvedValue({
      id: 's1',
      agencyId: 'a1',
      name: 'Fast Bus Ltda',
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    vi.mocked(updateSupplier).mockResolvedValue({
      id: 's1',
      agencyId: 'a1',
      name: 'Fast Bus Ltda',
      active: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    renderRouted();
    await screen.findByDisplayValue('Fast Bus Ltda');
    fireEvent.click(screen.getByLabelText('Ativo'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Details page')).toBeInTheDocument();
    expect(updateSupplier).toHaveBeenCalledWith('s1', expect.objectContaining({ active: false }));
  });
});
