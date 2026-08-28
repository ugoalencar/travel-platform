import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderRouted } from '../test/render';

describe('WishesPage', () => {
  it('shows the full wish list', async () => {
    renderRouted('/wishes');
    expect((await screen.findAllByText(/Portugal/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Grécia/)).toBeInTheDocument();
  });

  it('filters wishes by search term on destination', async () => {
    renderRouted('/wishes');
    const input = await screen.findByPlaceholderText(/Buscar por destino/);
    fireEvent.change(input, { target: { value: 'Japão' } });
    expect(screen.getByText(/Japão/)).toBeInTheDocument();
    expect(screen.queryByText(/Portugal/)).not.toBeInTheDocument();
  });

  it('shows empty state on no matches', async () => {
    renderRouted('/wishes');
    const input = await screen.findByPlaceholderText(/Buscar por destino/);
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText('Nenhum desejo encontrado')).toBeInTheDocument();
  });

  it('links to wish detail', async () => {
    renderRouted('/wishes');
    const wish = (await screen.findAllByText(/Portugal/))[0];
    expect(wish).toBeDefined();
    expect(wish?.closest('a')).toHaveAttribute('href', '/wishes/wish-001');
  });

  it('shows budget and travelers', async () => {
    renderRouted('/wishes');
    await screen.findAllByText(/Portugal/);
    expect(screen.getByText(/R\$\s*35\.000,00/)).toBeInTheDocument();
    expect(screen.getAllByText(/viajantes/).length).toBeGreaterThan(0);
  });
});

describe('WishDetailPage', () => {
  it('shows destination, budget, travelers, and window', async () => {
    renderRouted('/wishes/wish-001');
    expect(await screen.findByRole('heading', { name: /Portugal/ })).toBeInTheDocument();
    expect(screen.getByText('Orçamento')).toBeInTheDocument();
    expect(screen.getByText('Viajantes')).toBeInTheDocument();
    expect(screen.getByText('Período')).toBeInTheDocument();
  });

  it('shows status', async () => {
    renderRouted('/wishes/wish-001');
    await screen.findByRole('heading', { name: /Portugal/ });
    expect(screen.getAllByText('Em proposta').length).toBeGreaterThan(0);
  });

  it('shows linked proposal on the proposals tab', async () => {
    renderRouted('/wishes/wish-001');
    await screen.findByRole('heading', { name: /Portugal/ });
    fireEvent.click(screen.getByRole('tab', { name: 'Propostas' }));
    expect(await screen.findByText(/R\$\s*35.000,00/)).toBeInTheDocument();
  });

  it('allows opening the new wish modal', async () => {
    renderRouted('/wishes/wish-001');
    await screen.findByRole('heading', { name: /Portugal/ });
    fireEvent.click(screen.getByRole('button', { name: /Criar desejo/ }));
    expect(screen.getByRole('dialog', { name: 'Novo desejo' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Portugal/)).toBeInTheDocument();
  });

  it('shows error state for unknown wish', async () => {
    renderRouted('/wishes/unknown');
    expect(await screen.findByText('Desejo não encontrado')).toBeInTheDocument();
  });
});
