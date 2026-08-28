import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderRouted } from './test/render';

describe('App', () => {
  it('renders the dashboard by default', async () => {
    renderRouted('/');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('renders the sidebar navigation links', async () => {
    renderRouted('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    const nav = screen.getByRole('navigation');
    expect(nav.querySelector('a[href="/customers"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/wishes"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/trips"]')).not.toBeNull();
  });

  it('navigates to the customers list from the sidebar', async () => {
    renderRouted('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    fireEvent.click(screen.getByRole('link', { name: /Clientes/ }));
    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
  });

  it('navigates to the wishes list from the sidebar', async () => {
    renderRouted('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    fireEvent.click(screen.getByRole('link', { name: /Desejos/ }));
    expect(await screen.findByRole('heading', { name: 'Desejos' })).toBeInTheDocument();
  });

  it('navigates to the trips list from the sidebar', async () => {
    renderRouted('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    fireEvent.click(screen.getByRole('link', { name: /Viagens/ }));
    expect(await screen.findByRole('heading', { name: 'Viagens' })).toBeInTheDocument();
  });

  it('renders a customer detail page', async () => {
    renderRouted('/customers/cust-001');
    expect(await screen.findByRole('heading', { name: 'Lucas Martins' })).toBeInTheDocument();
  });

  it('renders a wish detail page', async () => {
    renderRouted('/wishes/wish-001');
    expect(await screen.findByRole('heading', { name: /Portugal/ })).toBeInTheDocument();
  });

  it('renders a trip detail page', async () => {
    renderRouted('/trips/trip-001');
    expect(await screen.findByRole('heading', { name: 'Família Martins — Portugal' })).toBeInTheDocument();
  });

  it('shows an error state for an unknown customer', async () => {
    renderRouted('/customers/unknown-id');
    expect(await screen.findByText('Cliente não encontrado')).toBeInTheDocument();
  });

  it('renders the not-found page for unknown routes', async () => {
    renderRouted('/unknown-route');
    expect(await screen.findByText('Página não encontrada')).toBeInTheDocument();
  });
});
