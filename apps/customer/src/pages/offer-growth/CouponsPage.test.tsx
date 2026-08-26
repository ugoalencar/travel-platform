import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CouponsPage } from './CouponsPage';
import * as api from '../../lib/offerGrowthApi';
import { ApiError } from '../../lib/api';
import type { Coupon } from '../../types/offerGrowth';

vi.mock('../../lib/offerGrowthApi');

const coupon: Coupon = {
  id: 'coupon-1',
  agencyId: 'agency-a',
  code: 'CANCUN300',
  name: 'Desconto Cancun',
  type: 'FIXED_AMOUNT',
  value: 300,
  active: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

function renderPage() {
  render(
    <MemoryRouter>
      <CouponsPage />
    </MemoryRouter>,
  );
}

describe('CouponsPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listCoupons).mockResolvedValue([coupon]);
    vi.mocked(api.listCampaigns).mockResolvedValue([]);
    vi.mocked(api.listOffers).mockResolvedValue([]);
    vi.mocked(api.createCoupon).mockResolvedValue({ ...coupon, id: 'coupon-2', code: 'NOVO10' });
  });

  it('lists coupons with Portuguese type labels', async () => {
    renderPage();
    expect(await screen.findByText('CANCUN300')).toBeInTheDocument();
    expect(screen.getByText('Valor fixo')).toBeInTheDocument();
  });

  it('shows the coupon validity period when startsAt/expiresAt are present', async () => {
    vi.mocked(api.listCoupons).mockResolvedValue([
      { ...coupon, startsAt: '2026-09-01T00:00:00.000Z', expiresAt: '2026-09-30T00:00:00.000Z' },
    ]);
    renderPage();
    expect(await screen.findByText('01/09/2026 – 30/09/2026')).toBeInTheDocument();
  });

  it('shows a fallback message when no validity period is set', async () => {
    renderPage();
    expect(await screen.findByText('Sem validade definida')).toBeInTheDocument();
  });

  it('creates a coupon through the real form', async () => {
    renderPage();
    await screen.findByText('CANCUN300');

    fireEvent.click(screen.getByRole('button', { name: 'Novo cupom' }));
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'novo10' } });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Cupom novo' } });
    fireEvent.change(screen.getByLabelText(/Valor \(R\$\)/), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));

    await vi.waitFor(() =>
      expect(api.createCoupon).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'NOVO10', name: 'Cupom novo', type: 'FIXED_AMOUNT', value: 10 }),
      ),
    );
  });

  it('shows the friendly entitlement-disabled message, not a generic error', async () => {
    vi.mocked(api.listCoupons).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
    renderPage();

    expect(await screen.findByRole('status')).toHaveTextContent(/não habilitado/i);
  });
});
