import { describe, expect, it } from 'vitest';
import {
  getProposalStatusLabel,
  getSaleStatusLabel,
  getTripStatusLabel,
  getReceivableStatusLabel,
  getOfferStatusLabel,
  getBookingStatusLabel,
} from './statusLabels';

describe('statusLabels', () => {
  it('maps every real ProposalStatus value to a Portuguese label', () => {
    expect(getProposalStatusLabel('DRAFT')).toBe('Rascunho');
    expect(getProposalStatusLabel('SENT')).toBe('Enviada');
    expect(getProposalStatusLabel('ACCEPTED')).toBe('Aceita');
    expect(getProposalStatusLabel('DECLINED')).toBe('Recusada');
    expect(getProposalStatusLabel('EXPIRED')).toBe('Expirada');
    expect(getProposalStatusLabel('CANCELLED')).toBe('Cancelada');
  });

  it('maps every real SaleStatus value to a Portuguese label', () => {
    expect(getSaleStatusLabel('PENDING')).toBe('Pendente');
    expect(getSaleStatusLabel('CONFIRMED')).toBe('Confirmada');
    expect(getSaleStatusLabel('PAID')).toBe('Paga');
    expect(getSaleStatusLabel('CANCELLED')).toBe('Cancelada');
    expect(getSaleStatusLabel('REFUNDED')).toBe('Reembolsada');
  });

  it('maps every TripStatus value to a Portuguese label', () => {
    expect(getTripStatusLabel('PLANNED')).toBe('Planejada');
    expect(getTripStatusLabel('CONFIRMED')).toBe('Confirmada');
    expect(getTripStatusLabel('IN_PROGRESS')).toBe('Em andamento');
    expect(getTripStatusLabel('COMPLETED')).toBe('Concluída');
    expect(getTripStatusLabel('CANCELLED')).toBe('Cancelada');
  });

  it('maps every real FinancialObligationStatus (Receivable) value to a Portuguese label', () => {
    expect(getReceivableStatusLabel('OPEN')).toBe('Aberto');
    expect(getReceivableStatusLabel('PARTIALLY_PAID')).toBe('Parcial');
    expect(getReceivableStatusLabel('PAID')).toBe('Paga');
    expect(getReceivableStatusLabel('CANCELLED')).toBe('Cancelada');
  });

  it('maps every real OfferStatus (effective status) value to a Portuguese label', () => {
    expect(getOfferStatusLabel('ACTIVE')).toBe('Ativa');
    expect(getOfferStatusLabel('INACTIVE')).toBe('Inativa');
    expect(getOfferStatusLabel('EXPIRED')).toBe('Expirada');
  });

  it('maps Booking.cancelled (boolean, not an enum) to a Portuguese label', () => {
    expect(getBookingStatusLabel(false)).toBe('Ativa');
    expect(getBookingStatusLabel(true)).toBe('Cancelada');
  });
});
