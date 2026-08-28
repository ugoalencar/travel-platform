import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AssetsPage } from './AssetsPage';
import * as api from '../../lib/offerGrowthApi';
import { ApiError } from '../../lib/api';
import type { Asset } from '../../types/offerGrowth';

vi.mock('../../lib/offerGrowthApi');

const asset: Asset = {
  id: 'asset-1',
  agencyId: 'agency-a',
  type: 'IMAGE',
  source: 'PESCADOR',
  storageUrl: 'https://cdn.example.com/hero.jpg',
  sourceCaptureId: 'capture-1',
  metaTags: [],
  metaVariants: [],
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

describe('AssetsPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listEntitlements).mockResolvedValue([]);
  });

  it('lists real assets with business-language source and type labels', async () => {
    vi.mocked(api.listAssets).mockResolvedValue([asset]);
    render(<AssetsPage />);

    expect(await screen.findByText('asset-1')).toBeInTheDocument();
    expect(screen.getByText(/Imagem/)).toBeInTheDocument();
    expect(screen.getAllByText(/Pescador/).length).toBeGreaterThan(0);
  });

  it('shows the friendly entitlement-disabled message, not a generic error', async () => {
    vi.mocked(api.listAssets).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
    render(<AssetsPage />);

    expect(await screen.findByRole('status')).toHaveTextContent(/não habilitado/i);
  });
});
