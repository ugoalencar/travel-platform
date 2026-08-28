import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderRouted } from '../test/render';

describe('CustomersPage', () => {
  it('shows the full customer list', async () => {
    renderRouted('/customers');
    expect(await screen.findByText('Lucas Martins')).toBeInTheDocument();
    expect(screen.getByText('Ana Beatriz Souza')).toBeInTheDocument();
    expect(screen.getByText('Fernanda Costa')).toBeInTheDocument();
  });

  it('filters customers by search term', async () => {
    renderRouted('/customers');
    const input = await screen.findByPlaceholderText(/Buscar por nome/);
    fireEvent.change(input, { target: { value: 'Lucas' } });
    expect(screen.getByText('Lucas Martins')).toBeInTheDocument();
    expect(screen.queryByText('Ana Beatriz Souza')).not.toBeInTheDocument();
  });

  it('shows the empty state when search has no matches', async () => {
    renderRouted('/customers');
    const input = await screen.findByPlaceholderText(/Buscar por nome/);
    fireEvent.change(input, { target: { value: 'zzz-inexistente' } });
    expect(screen.getByText('Nenhum cliente encontrado')).toBeInTheDocument();
  });

  it('filters customers by status', async () => {
    renderRouted('/customers');
    await screen.findByText('Lucas Martins');
    fireEvent.click(screen.getByRole('button', { name: 'Inativo' }));
    expect(screen.getByText('Pedro Henrique Almeida')).toBeInTheDocument();
    expect(screen.queryByText('Lucas Martins')).not.toBeInTheDocument();
  });

  it('links to customer detail', async () => {
    renderRouted('/customers');
    const customer = await screen.findByText('Lucas Martins');
    expect(customer.closest('a')).toHaveAttribute('href', '/customers/cust-001');
  });

  it('does not expose cpf/passport raw values in the list', async () => {
    renderRouted('/customers');
    await screen.findByText('Lucas Martins');
    expect(screen.queryByText(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^[A-Z]{2}\d{6,}$/)).not.toBeInTheDocument();
  });
});

describe('CustomerDetailPage', () => {
  it('shows customer profile info and privacy-respecting data', async () => {
    renderRouted('/customers/cust-001');
    expect(await screen.findByRole('heading', { name: 'Lucas Martins' })).toBeInTheDocument();
    expect(screen.getByText('lucas.martins@email.com')).toBeInTheDocument();
    expect(screen.getByText('(11) 99876-5432')).toBeInTheDocument();
  });

  it('shows summary counts', async () => {
    renderRouted('/customers/cust-001');
    await screen.findByRole('heading', { name: 'Lucas Martins' });
    expect(screen.getAllByText('Desejos')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Viagens')[0]).toBeInTheDocument();
  });

  it('shows wishes tab with the customer wishes', async () => {
    renderRouted('/customers/cust-001');
    await screen.findByRole('heading', { name: 'Lucas Martins' });
    fireEvent.click(screen.getByRole('tab', { name: 'Desejos' }));
    await screen.findByText(/Islândia/);
    expect(screen.getByText(/Portugal/)).toBeInTheDocument();
  });

  it('shows proposals tab', async () => {
    renderRouted('/customers/cust-001');
    await screen.findByRole('heading', { name: 'Lucas Martins' });
    fireEvent.click(screen.getByRole('tab', { name: 'Propostas' }));
    expect(await screen.findByText(/Pacote personalizado com voos LATAM/)).toBeInTheDocument();
    expect(screen.getByText('Aceita')).toBeInTheDocument();
  });

  it('shows bookings tab with passengers', async () => {
    renderRouted('/customers/cust-001');
    await screen.findByRole('heading', { name: 'Lucas Martins' });
    fireEvent.click(screen.getByRole('tab', { name: 'Reservas' }));
    expect((await screen.findAllByText('Lucas Martins')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Juliana Martins')).toBeInTheDocument();
  });

  it('shows empty state for an unknown tab entity when no data', async () => {
    renderRouted('/customers/cust-003');
    await screen.findByRole('heading', { name: 'Ricardo Oliveira' });
    fireEvent.click(screen.getByRole('tab', { name: 'Reservas' }));
    expect(await screen.findByText('Nenhuma reserva')).toBeInTheDocument();
  });
});
