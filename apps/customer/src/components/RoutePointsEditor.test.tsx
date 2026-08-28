import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { RoutePointsEditor } from './RoutePointsEditor';
import { createRoutePoint, listRoutePoints, reorderRoutePoints } from '../lib/api';

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
  return {
    listRoutePoints: vi.fn(),
    createRoutePoint: vi.fn(),
    updateRoutePoint: vi.fn(),
    reorderRoutePoints: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const basePoint = {
  id: 'p1',
  agencyId: 'a1',
  routeId: 'r1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('RoutePointsEditor', () => {
  it('loads and round-trips existing points', async () => {
    vi.mocked(listRoutePoints).mockResolvedValue([
      { ...basePoint, id: 'p1', sequence: 1, name: 'Sao Paulo', checkpointRequired: true, checkpointType: 'DEPARTURE' },
      { ...basePoint, id: 'p2', sequence: 2, name: 'Rio de Janeiro', checkpointRequired: false },
    ]);

    render(<RoutePointsEditor routeId="r1" />);

    expect(await screen.findByDisplayValue('Sao Paulo')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Rio de Janeiro')).toBeInTheDocument();
    expect(screen.getAllByTestId('route-point-row')).toHaveLength(2);
  });

  it('adds a new point via "Adicionar ponto"', async () => {
    vi.mocked(listRoutePoints).mockResolvedValue([]);
    vi.mocked(createRoutePoint).mockResolvedValue({
      ...basePoint,
      id: 'new-1',
      sequence: 1,
      name: 'Nova parada',
      checkpointRequired: false,
    });

    render(<RoutePointsEditor routeId="r1" />);
    await screen.findByRole('button', { name: 'Adicionar ponto' });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ponto' }));
    expect(screen.getAllByTestId('route-point-row')).toHaveLength(1);

    const row = screen.getAllByTestId('route-point-row')[0]!;
    fireEvent.change(within(row).getByLabelText('Nome'), { target: { value: 'Nova parada' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Adicionar' }));

    expect(await within(row).findByRole('button', { name: 'Salvar ponto' })).toBeInTheDocument();
    expect(createRoutePoint).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ name: 'Nova parada', sequence: 1 }),
    );
  });

  it('removes a not-yet-saved point locally', async () => {
    vi.mocked(listRoutePoints).mockResolvedValue([]);
    render(<RoutePointsEditor routeId="r1" />);
    await screen.findByRole('button', { name: 'Adicionar ponto' });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ponto' }));
    expect(screen.getAllByTestId('route-point-row')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    expect(screen.queryAllByTestId('route-point-row')).toHaveLength(0);
  });

  it('toggling "Monitorar este ponto" shows/hides the checkpoint type selector', async () => {
    vi.mocked(listRoutePoints).mockResolvedValue([
      { ...basePoint, sequence: 1, name: 'Parada', checkpointRequired: false },
    ]);

    render(<RoutePointsEditor routeId="r1" />);
    const row = await screen.findByTestId('route-point-row');

    expect(within(row).queryByLabelText('Tipo de checkpoint')).not.toBeInTheDocument();

    fireEvent.click(within(row).getByLabelText('Monitorar este ponto'));
    expect(within(row).getByLabelText('Tipo de checkpoint')).toBeInTheDocument();

    fireEvent.click(within(row).getByLabelText('Monitorar este ponto'));
    expect(within(row).queryByLabelText('Tipo de checkpoint')).not.toBeInTheDocument();
  });

  it('reorders saved points with the up/down buttons', async () => {
    vi.mocked(listRoutePoints).mockResolvedValue([
      { ...basePoint, id: 'p1', sequence: 1, name: 'A', checkpointRequired: false },
      { ...basePoint, id: 'p2', sequence: 2, name: 'B', checkpointRequired: false },
    ]);
    vi.mocked(reorderRoutePoints).mockResolvedValue([
      { ...basePoint, id: 'p2', sequence: 1, name: 'B', checkpointRequired: false },
      { ...basePoint, id: 'p1', sequence: 2, name: 'A', checkpointRequired: false },
    ]);

    render(<RoutePointsEditor routeId="r1" />);
    await screen.findByDisplayValue('A');

    const rows = screen.getAllByTestId('route-point-row');
    fireEvent.click(within(rows[1]!).getByLabelText('Mover para cima'));

    expect(await screen.findAllByDisplayValue('B')).toHaveLength(1);
    expect(reorderRoutePoints).toHaveBeenCalledWith('r1', ['p2', 'p1']);
  });

  it('hides Remover button for persisted points but shows it for new points', async () => {
    vi.mocked(listRoutePoints).mockResolvedValue([
      { ...basePoint, id: 'p1', sequence: 1, name: 'Persisted', checkpointRequired: false },
    ]);

    render(<RoutePointsEditor routeId="r1" />);
    await screen.findByDisplayValue('Persisted');

    const persistedRow = screen.getAllByTestId('route-point-row')[0]!;
    expect(within(persistedRow).queryByRole('button', { name: 'Remover' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ponto' }));
    const rows = screen.getAllByTestId('route-point-row');
    const newRow = rows[rows.length - 1]!;
    expect(within(newRow).getByRole('button', { name: 'Remover' })).toBeInTheDocument();
  });
});
