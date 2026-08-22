import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SupplierFormPage } from './SupplierFormPage';
import { createSupplier } from '../lib/api';

vi.mock('../lib/api', () => ({ createSupplier: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted() {
  return render(
    <MemoryRouter initialEntries={['/transport/suppliers/new']}>
      <Routes>
        <Route path="/transport/suppliers/new" element={<SupplierFormPage />} />
        <Route path="/transport/suppliers/:id" element={<div>Details page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SupplierFormPage', () => {
  it('requires a name', () => {
    renderRouted();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByText('Nome é obrigatório.')).toBeInTheDocument();
    expect(createSupplier).not.toHaveBeenCalled();
  });

  it('submits only submitted fields', async () => {
    vi.mocked(createSupplier).mockResolvedValue({
      id: 's1',
      agencyId: 'a1',
      name: 'Fast Bus Ltda',
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderRouted();
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Fast Bus Ltda' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Details page')).toBeInTheDocument();
    expect(createSupplier).toHaveBeenCalledWith({ name: 'Fast Bus Ltda' });
  });
});
