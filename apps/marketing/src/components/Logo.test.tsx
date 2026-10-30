// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Logo } from './Logo';

afterEach(cleanup);

describe('Logo', () => {
  it('exposes the brand name as its accessible name', () => {
    render(<Logo />);
    expect(screen.getByRole('img', { name: 'Travel Plataforma' })).toBeInTheDocument();
  });

  it('draws the wordmark only when not icon-only', () => {
    const { container, rerender } = render(<Logo />);
    expect(container.querySelectorAll('path')).toHaveLength(16);
    rerender(<Logo iconOnly />);
    expect(container.querySelectorAll('path')).toHaveLength(0);
  });
});
