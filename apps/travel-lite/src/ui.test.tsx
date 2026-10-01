import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState, ErrorNote, SuccessNote } from './ui';

describe('ui feedback components', () => {
  it('renders nothing when there is no success message', () => {
    const { container } = render(<SuccessNote success={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the success message with a status role', () => {
    render(<SuccessNote success="Cliente salvo." />);
    expect(screen.getByRole('status')).toHaveTextContent('Cliente salvo.');
  });

  it('renders nothing when there is no error', () => {
    const { container } = render(<ErrorNote error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an empty state with an optional action', () => {
    render(
      <EmptyState message="Nenhum cliente encontrado.">
        <button type="button">Novo cliente</button>
      </EmptyState>,
    );
    expect(screen.getByText('Nenhum cliente encontrado.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo cliente' })).toBeInTheDocument();
  });

  it('renders an empty state without an action', () => {
    const { container } = render(<EmptyState message="Nenhuma despesa em aberto." />);
    expect(container.textContent).toContain('Nenhuma despesa em aberto.');
  });
});
