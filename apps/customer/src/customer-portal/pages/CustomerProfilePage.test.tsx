import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerProfilePage } from './CustomerProfilePage';
import type { CustomerProfile } from '../../types/customer-portal';

vi.mock('../../lib/customerApi', () => {
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
    getMyProfile: vi.fn(),
    getMyAgencyContact: vi.fn().mockResolvedValue(null),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const profile: CustomerProfile = {
  id: 'c1',
  name: 'Cliente Demo',
  email: 'cliente@example.test',
  phone: '11999990000',
  cpfMasked: '********900',
  passportMasked: null,
  address: null,
};

describe('CustomerProfilePage', () => {
  it('renders the read-only profile with a masked cpf, never the raw value', async () => {
    const { getMyProfile } = await import('../../lib/customerApi');
    vi.mocked(getMyProfile).mockResolvedValue(profile);

    render(
      <MemoryRouter initialEntries={['/customer-portal/profile']}>
        <Routes>
          <Route path="/customer-portal/profile" element={<CustomerProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Cliente Demo')).toBeInTheDocument();
    });
    expect(screen.getByText('********900')).toBeInTheDocument();
    expect(screen.queryByText('12345678900')).not.toBeInTheDocument();
  });

  it('renders the address when present', async () => {
    const { getMyProfile } = await import('../../lib/customerApi');
    vi.mocked(getMyProfile).mockResolvedValue({
      ...profile,
      address: { street: 'Rua Teste', city: 'São Paulo' },
    });

    render(
      <MemoryRouter initialEntries={['/customer-portal/profile']}>
        <Routes>
          <Route path="/customer-portal/profile" element={<CustomerProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Rua Teste/)).toBeInTheDocument();
    });
  });

  it('renders agency contact info when available', async () => {
    const { getMyProfile, getMyAgencyContact } = await import('../../lib/customerApi');
    vi.mocked(getMyProfile).mockResolvedValue(profile);
    vi.mocked(getMyAgencyContact).mockResolvedValue({
      name: 'Agência Teste',
      phone: '11988887777',
      email: 'contato@agencia.test',
    });

    render(
      <MemoryRouter initialEntries={['/customer-portal/profile']}>
        <Routes>
          <Route path="/customer-portal/profile" element={<CustomerProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('11988887777')).toBeInTheDocument();
    });
    expect(screen.getByText('contato@agencia.test')).toBeInTheDocument();
  });
});
