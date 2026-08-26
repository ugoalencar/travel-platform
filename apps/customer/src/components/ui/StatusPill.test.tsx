import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  StatusPill,
  proposalStatusTone,
  saleStatusTone,
  receivableStatusTone,
  offerStatusTone,
} from './StatusPill';

describe('StatusPill', () => {
  it('renders children with the correct tone classes', () => {
    render(<StatusPill tone="positive">Ativa</StatusPill>);
    const pill = screen.getByText('Ativa');
    expect(pill).toBeInTheDocument();
    expect(pill.tagName).toBe('SPAN');
    expect(pill.className).toContain('rounded-full');
    expect(pill.className).toContain('bg-emerald-50');
  });

  it('renders attention tone', () => {
    render(<StatusPill tone="attention">Em aberto</StatusPill>);
    const pill = screen.getByText('Em aberto');
    expect(pill.className).toContain('bg-amber-50');
  });

  it('renders neutral tone', () => {
    render(<StatusPill tone="neutral">Rascunho</StatusPill>);
    const pill = screen.getByText('Rascunho');
    expect(pill.className).toContain('bg-blue-50');
  });

  it('renders inactive tone', () => {
    render(<StatusPill tone="inactive">Cancelada</StatusPill>);
    const pill = screen.getByText('Cancelada');
    expect(pill.className).toContain('bg-slate-100');
  });

  it('accepts custom className', () => {
    render(
      <StatusPill tone="positive" className="custom-class">
        Test
      </StatusPill>,
    );
    expect(screen.getByText('Test').className).toContain('custom-class');
  });
});

describe('proposalStatusTone', () => {
  it('maps ACCEPTED to positive', () => {
    expect(proposalStatusTone('ACCEPTED')).toBe('positive');
  });

  it('maps DRAFT and SENT to neutral', () => {
    expect(proposalStatusTone('DRAFT')).toBe('neutral');
    expect(proposalStatusTone('SENT')).toBe('neutral');
  });

  it('maps DECLINED and EXPIRED to attention', () => {
    expect(proposalStatusTone('DECLINED')).toBe('attention');
    expect(proposalStatusTone('EXPIRED')).toBe('attention');
  });

  it('maps CANCELLED to inactive', () => {
    expect(proposalStatusTone('CANCELLED')).toBe('inactive');
  });
});

describe('saleStatusTone', () => {
  it('maps PAID to positive', () => {
    expect(saleStatusTone('PAID')).toBe('positive');
  });

  it('maps PENDING and CONFIRMED to neutral', () => {
    expect(saleStatusTone('PENDING')).toBe('neutral');
    expect(saleStatusTone('CONFIRMED')).toBe('neutral');
  });

  it('maps REFUNDED to attention', () => {
    expect(saleStatusTone('REFUNDED')).toBe('attention');
  });

  it('maps CANCELLED to inactive', () => {
    expect(saleStatusTone('CANCELLED')).toBe('inactive');
  });
});

describe('receivableStatusTone', () => {
  it('maps PAID to positive', () => {
    expect(receivableStatusTone('PAID')).toBe('positive');
  });

  it('maps OPEN to attention', () => {
    expect(receivableStatusTone('OPEN')).toBe('attention');
  });

  it('maps PARTIALLY_PAID to neutral', () => {
    expect(receivableStatusTone('PARTIALLY_PAID')).toBe('neutral');
  });

  it('maps CANCELLED to inactive', () => {
    expect(receivableStatusTone('CANCELLED')).toBe('inactive');
  });
});

describe('offerStatusTone', () => {
  it('maps ACTIVE to positive', () => {
    expect(offerStatusTone('ACTIVE')).toBe('positive');
  });

  it('maps EXPIRED to attention', () => {
    expect(offerStatusTone('EXPIRED')).toBe('attention');
  });

  it('maps INACTIVE to inactive', () => {
    expect(offerStatusTone('INACTIVE')).toBe('inactive');
  });
});
