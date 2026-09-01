// Platform Admin status label translations
export type InvoiceStatus = 'PAID' | 'OPEN' | 'OVERDUE' | 'REFUNDED';
export type PaymentStatus = 'SUCCESSFUL' | 'FAILED' | 'REFUNDED';
export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'TRIAL';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL_SENT' | 'WON' | 'LOST';
export type SupportStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  PAID: 'Pago',
  OPEN: 'Aberto',
  OVERDUE: 'Vencido',
  REFUNDED: 'Reembolsado',
};

export function getInvoiceStatusLabel(status: InvoiceStatus): string {
  return INVOICE_STATUS_LABELS[status] ?? status;
}

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  SUCCESSFUL: 'Bem-sucedido',
  FAILED: 'Falhou',
  REFUNDED: 'Reembolsado',
};

export function getPaymentStatusLabel(status: PaymentStatus): string {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  ACTIVE: 'Ativa',
  PAST_DUE: 'Vencida',
  CANCELLED: 'Cancelada',
  TRIAL: 'Período de Teste',
};

export function getSubscriptionStatusLabel(status: SubscriptionStatus): string {
  return SUBSCRIPTION_STATUS_LABELS[status] ?? status;
}

const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'Novo',
  CONTACTED: 'Contatado',
  QUALIFIED: 'Qualificado',
  PROPOSAL_SENT: 'Proposta Enviada',
  WON: 'Ganho',
  LOST: 'Perdido',
};

export function getLeadStatusLabel(status: LeadStatus): string {
  return LEAD_STATUS_LABELS[status] ?? status;
}

const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em Progresso',
  RESOLVED: 'Resolvido',
  CLOSED: 'Fechado',
};

export function getSupportStatusLabel(status: SupportStatus): string {
  return SUPPORT_STATUS_LABELS[status] ?? status;
}
