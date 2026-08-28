import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderRouted } from '../test/render';

describe('TripsPage', () => {
  it('shows the full trip list', async () => {
    renderRouted('/trips');
    expect(await screen.findByText('Família Martins — Portugal')).toBeInTheDocument();
    expect(screen.getByText('Ana & Marcos — Grécia')).toBeInTheDocument();
  });

  it('filters trips by search term on destination', async () => {
    renderRouted('/trips');
    const input = await screen.findByPlaceholderText(/Buscar por nome, destino/);
    fireEvent.change(input, { target: { value: 'Grécia' } });
    expect(screen.getByText('Ana & Marcos — Grécia')).toBeInTheDocument();
    expect(screen.queryByText('Família Martins — Portugal')).not.toBeInTheDocument();
  });

  it('shows empty state on no matches', async () => {
    renderRouted('/trips');
    const input = await screen.findByPlaceholderText(/Buscar por nome, destino/);
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText('Nenhuma viagem encontrada')).toBeInTheDocument();
  });

  it('links to trip detail', async () => {
    renderRouted('/trips');
    const trip = await screen.findByText('Família Martins — Portugal');
    expect(trip.closest('a')).toHaveAttribute('href', '/trips/trip-001');
  });
});

describe('TripDetailPage', () => {
  it('shows trip overview with destination, dates, and status', async () => {
    renderRouted('/trips/trip-001');
    expect(await screen.findByRole('heading', { name: 'Família Martins — Portugal' })).toBeInTheDocument();
    expect(screen.getAllByText(/Lisboa \+ Porto, Portugal/).length).toBeGreaterThan(0);
    expect(screen.getByText('Destino')).toBeInTheDocument();
    expect(screen.getByText('Período')).toBeInTheDocument();
    expect(screen.getAllByText('Confirmada').length).toBeGreaterThan(0);
  });

  it('shows the itinerary timeline for the Portugal trip', async () => {
    renderRouted('/trips/trip-001');
    await screen.findByRole('heading', { name: 'Família Martins — Portugal' });
    fireEvent.click(screen.getByRole('tab', { name: 'Itinerário' }));
    expect(await screen.findByText(/Alfama/)).toBeInTheDocument();
    expect(screen.getAllByText(/Sintra/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Vale do Douro/).length).toBeGreaterThan(0);
  });

  it('shows related proposals and bookings', async () => {
    renderRouted('/trips/trip-001');
    await screen.findByRole('heading', { name: 'Família Martins — Portugal' });
    fireEvent.click(screen.getByRole('tab', { name: 'Relacionados' }));
    expect(screen.getAllByText('Propostas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reservas').length).toBeGreaterThan(0);
  });

  it('shows error state for unknown trip', async () => {
    renderRouted('/trips/unknown');
    expect(await screen.findByText('Viagem não encontrada')).toBeInTheDocument();
  });
});
