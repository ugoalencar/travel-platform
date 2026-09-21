import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderRouted } from '../test/render';
import * as api from '../lib/api';
import type { CustomerSegment, FilterDefinition, SegmentRunResult } from '../lib/api';

vi.mock('../lib/api', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    listCustomerSegments: vi.fn(),
    getCustomerSegmentResults: vi.fn(),
    previewCustomerSegment: vi.fn(),
    createCustomerSegment: vi.fn(),
    archiveCustomerSegment: vi.fn(),
  };
});

const activeCustomersFilter: FilterDefinition = {
  operator: 'AND',
  conditions: [{ field: 'customer.status', operator: 'EQ', value: 'ACTIVE' }],
};

const savedSegment: CustomerSegment = {
  id: 'segment-001',
  agencyId: 'agency-001',
  name: 'Clientes com proposta ativa',
  description: 'Segmento comercial',
  scope: 'SHARED',
  isShared: true,
  filterDefinition: activeCustomersFilter,
  createdByUserId: 'user-001',
  createdAt: '2026-09-19T10:00:00.000Z',
  updatedAt: '2026-09-19T10:30:00.000Z',
};

const segmentResults: SegmentRunResult = {
  total: 2,
  page: 1,
  pageSize: 25,
  customers: [
    {
      id: 'cust-001',
      name: 'Ana Curitiba',
      city: 'Curitiba',
      lastContactAt: '2026-08-15T00:00:00.000Z',
      nextDeparture: '2026-10-10T00:00:00.000Z',
      averageTicket: 12000,
    },
    {
      id: 'cust-002',
      name: 'Bruno Santos',
      city: 'São Paulo',
      lastContactAt: null,
      nextDeparture: null,
      averageTicket: 8500,
    },
  ],
};

beforeEach(() => {
  vi.mocked(api.listCustomerSegments).mockResolvedValue([savedSegment]);
  vi.mocked(api.getCustomerSegmentResults).mockResolvedValue(segmentResults);
  vi.mocked(api.previewCustomerSegment).mockResolvedValue(segmentResults);
  vi.mocked(api.createCustomerSegment).mockResolvedValue(savedSegment);
  vi.mocked(api.archiveCustomerSegment).mockResolvedValue(savedSegment);
});

describe('SegmentsPage', () => {
  it('shows each saved segment current dynamic customer count', async () => {
    renderRouted('/segments');

    const row = await screen.findByRole('row', { name: /Clientes com proposta ativa/ });

    await waitFor(() => {
      expect(api.getCustomerSegmentResults).toHaveBeenCalledWith('segment-001', 1, 1);
    });
    expect(within(row).getByText('2 clientes')).toBeInTheDocument();
  });

  it('opens saved segment live results and links customers to Customer 360', async () => {
    renderRouted('/segments');

    const row = await screen.findByRole('row', { name: /Clientes com proposta ativa/ });
    fireEvent.click(within(row).getByRole('button', { name: /Ver resultados/ }));

    expect(await screen.findByRole('heading', { name: 'Resultados do segmento' })).toBeInTheDocument();
    expect(screen.getByText('2 cliente(s) encontrado(s)')).toBeInTheDocument();

    const customerLink = screen.getByRole('link', { name: 'Ana Curitiba' });
    expect(customerLink).toHaveAttribute('href', '/customers/cust-001');
  });
});
