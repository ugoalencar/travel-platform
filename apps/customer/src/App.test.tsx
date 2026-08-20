import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

vi.mock('./lib/api', () => ({
  listCustomers: vi.fn().mockResolvedValue([]),
  createCustomer: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

function renderApp(initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <App />
    </MemoryRouter>,
  );
}

describe('App', () => {
  it('renders without crashing', () => {
    renderApp();
    expect(screen.getByText('Travel Platform')).toBeInTheDocument();
  });

  it('redirects "/" to "/customers" and renders the CustomersPage', async () => {
    renderApp(['/']);
    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
  });

  it('renders CustomersPage when navigating to "/customers"', async () => {
    renderApp(['/customers']);
    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
  });

  it('renders the sidebar shell with Travel Platform branding', () => {
    renderApp();
    expect(screen.getByText('Travel Platform')).toBeInTheDocument();
  });

  it('renders "Clientes" as a real navigation link', () => {
    renderApp();
    const link = screen.getByRole('link', { name: 'Clientes' });
    expect(link).toHaveAttribute('href', '/customers');
  });

  it('renders placeholder nav items as non-interactive elements', () => {
    renderApp();
    const dashboard = screen.getByText('Dashboard');
    const desejos = screen.getByText('Desejos');

    expect(dashboard.tagName).not.toBe('A');
    expect(dashboard.tagName).not.toBe('BUTTON');
    expect(dashboard).toHaveAttribute('aria-disabled', 'true');
    expect(dashboard).not.toHaveAttribute('href');

    expect(desejos.tagName).not.toBe('A');
    expect(desejos.tagName).not.toBe('BUTTON');
    expect(desejos).toHaveAttribute('aria-disabled', 'true');
    expect(desejos).not.toHaveAttribute('href');
  });

  it('does not navigate when a placeholder nav item is clicked', async () => {
    renderApp(['/customers']);
    const dashboard = screen.getByText('Dashboard');
    dashboard.click();

    // Still on /customers — the Clientes heading remains rendered and no
    // navigation occurred since placeholder items carry no routing wiring.
    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
  });

  it('navigates to /customers/new when "+ Novo cliente" is clicked', async () => {
    renderApp(['/customers']);
    await screen.findByRole('heading', { name: 'Clientes' });

    fireEvent.click(screen.getByRole('button', { name: '+ Novo cliente' }));

    expect(
      await screen.findByRole('heading', { name: 'Novo cliente' }),
    ).toBeInTheDocument();
  });
});
