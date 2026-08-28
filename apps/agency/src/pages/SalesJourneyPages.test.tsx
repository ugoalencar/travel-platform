import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from '../App';

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('UI-03 sales journey prototype', () => {
  it('renders the Wish to Proposal to Booking to Sale flow on the proposal list', () => {
    renderRoute('/proposals');

    expect(screen.getByRole('heading', { name: 'Jornada comercial' })).toBeInTheDocument();
    expect(screen.getAllByText('Wish').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Proposal').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Booking').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sale').length).toBeGreaterThan(0);
    expect(screen.getByText('Família em Portugal')).toBeInTheDocument();
  });

  it('shows proposal detail with commercial actions and travel composition', () => {
    renderRoute('/proposals/prop-001');

    expect(screen.getByRole('heading', { name: 'Proposta Portugal em família' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Preview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Converter' })).toBeInTheDocument();
    expect(screen.getByText(/Hotel Alfama Rio/)).toBeInTheDocument();
    expect(screen.getByText('Experiencias')).toBeInTheDocument();
  });

  it('renders the proposal builder prototype with editable commercial sections', () => {
    renderRoute('/proposals/prop-001/edit');

    expect(screen.getByRole('heading', { name: 'Builder de proposta' })).toBeInTheDocument();
    expect(screen.getByLabelText('Cliente')).toHaveValue('Lucas Martins');
    expect(screen.getByLabelText('Destino')).toHaveValue('Lisboa + Porto, Portugal');
    expect(screen.getByText('Servicos selecionados')).toBeInTheDocument();
    expect(screen.getByText('Resumo de preco')).toBeInTheDocument();
  });

  it('shows booking detail with confirmation, payment and document indicators', () => {
    renderRoute('/bookings/bk-001');

    expect(screen.getByRole('heading', { name: 'Reserva operacional' })).toBeInTheDocument();
    expect(screen.getByText('Fornecedor')).toBeInTheDocument();
    expect(screen.getByText('Douro Ground Partners')).toBeInTheDocument();
    expect(screen.getByText('Pagamento')).toBeInTheDocument();
    expect(screen.getAllByText('Pago').length).toBeGreaterThan(0);
    expect(screen.getByText('Passaportes validados')).toBeInTheDocument();
  });

  it('renders the commercial sale summary with values derived from the fixture', () => {
    renderRoute('/sales/sale-001');

    expect(screen.getByRole('heading', { name: 'Resumo comercial' })).toBeInTheDocument();
    expect(screen.getByText('Valor bruto')).toBeInTheDocument();
    expect(screen.getByText('Custo')).toBeInTheDocument();
    expect(screen.getByText('Margem')).toBeInTheDocument();
    expect(screen.getByText('Reserva bk-001')).toBeInTheDocument();
  });

  it('keeps traveler preview free from internal commercial and staff data', () => {
    renderRoute('/proposals/prop-001/preview');

    expect(screen.getByRole('heading', { name: 'Portugal em família' })).toBeInTheDocument();
    expect(screen.getByText('Confirmar interesse')).toBeInTheDocument();
    expect(screen.queryByText(/custo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/margem/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nota interna/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/consultora/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/audit/i)).not.toBeInTheDocument();
  });
});
