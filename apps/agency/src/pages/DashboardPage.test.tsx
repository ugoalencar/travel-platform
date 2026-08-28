import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderRouted } from '../test/render';

describe('DashboardPage', () => {
  it('shows all sales summary stat cards', async () => {
    renderRouted('/');
    expect(await screen.findByText('Vendas (mês)')).toBeInTheDocument();
    expect(screen.getAllByText('Propostas abertas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Viagens ativas').length).toBeGreaterThan(0);
    expect(screen.getByText('Reservas pendentes')).toBeInTheDocument();
    expect(screen.getByText('Clientes ativos')).toBeInTheDocument();
    expect(screen.getByText('Próximas partidas')).toBeInTheDocument();
  });

  it('shows action list', async () => {
    renderRouted('/');
    expect(await screen.findByText('Ações recentes')).toBeInTheDocument();
    expect(screen.getAllByText('Proposta aceita').length).toBeGreaterThan(0);
  });

  it('shows alerts', async () => {
    renderRouted('/');
    expect(await screen.findByText('Alertas')).toBeInTheDocument();
    expect(screen.getByText('Proposta expirando')).toBeInTheDocument();
  });

  it('shows open proposals section', async () => {
    renderRouted('/');
    expect((await screen.findAllByText('Propostas abertas')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ricardo Oliveira/).length).toBeGreaterThan(0);
  });

  it('shows active trips section', async () => {
    renderRouted('/');
    expect((await screen.findAllByText('Viagens ativas')).length).toBeGreaterThan(0);
    expect(screen.getByText('Família Martins — Portugal')).toBeInTheDocument();
  });

  it('links to a trip detail from the active trips card', async () => {
    renderRouted('/');
    const tripLink = (await screen.findByText('Família Martins — Portugal')).closest('a');
    expect(tripLink).toHaveAttribute('href', '/trips/trip-001');
  });
});
