export interface PaymentCondition {
  id: string;
  name: string;
  version: number;
  scheduleKind: 'SINGLE' | 'EQUAL_INSTALLMENTS' | 'DOWN_PAYMENT_PLUS_BALANCE';
  maxInstallments: number;
  minInstallmentAmount: number | null;
  interestFree: boolean;
  downPaymentMode: 'NONE' | 'PERCENT' | 'AMOUNT';
  downPaymentValue: number;
  downPaymentRequired: boolean;
  balanceDeadlineAnchor: 'SALE_DATE' | 'TRAVEL_START';
  balanceDeadlineOffsetDays: number;
  allowsPartialPayments: boolean;
  paymentMethods: string[];
  categoryIds: string[];
  productIds: string[];
  active?: boolean;
}

export interface PaymentScheduleItem {
  kind: 'SINGLE' | 'INSTALLMENT' | 'DOWN_PAYMENT' | 'BALANCE';
  amount: number;
  dueDate: string;
}

export interface SalePaymentSnapshot {
  version: number;
  condition: PaymentCondition;
  paymentMethod: string;
  travelerInstallments: number;
  saleDate: string;
  travelStart: string | null;
  total: number;
  schedule: Array<PaymentScheduleItem & { installmentNumber: number; installmentCount: number }>;
}

export interface SaleBalance {
  total: number;
  received: number;
  remaining: number;
  status: 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
  receivables: Array<{
    id: string; kind: PaymentScheduleItem['kind']; amount: number; paid: number;
    due: string; status: string; late: boolean;
  }>;
  next_due: string | null;
  last_payment_at: string | null;
  settled_at: string | null;
  down_payment_pending: boolean;
  balance_deadline: string | null;
  late: boolean;
  payments?: Array<{ id: string; amount: number; method: string | null; paid_at: string; reversed: boolean }>;
  snapshot: SalePaymentSnapshot | null;
}

export interface ApplySalePaymentScheduleInput {
  conditionId: string;
  installments: number;
  paymentMethod: string;
}

export interface SalePaymentInput {
  amount: number;
  idempotency_key: string;
  method: string;
  paid_at: string;
  receivable_id?: string;
  reference?: string;
  notes?: string;
}

function cents(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value >= 1e12 || !/^\d+(\.\d{1,2})?$/.test(String(value))) {
    throw new Error('Informe um valor com até duas casas decimais.');
  }
  const [whole = '0', decimal = ''] = String(value).split('.');
  return Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
}

function civilDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Informe uma data válida para a venda e o embarque.');
  }
  return date;
}

function dateText(date: Date): string {
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) {
    throw new Error('Vencimento fora do intervalo permitido.');
  }
  return date.toISOString().slice(0, 10);
}

export function previewPaymentSchedule(
  condition: PaymentCondition, total: number, installments: number, saleDate: string, travelStart: string | null,
): PaymentScheduleItem[] {
  if (!condition.interestFree) throw new Error('Somente condições sem juros são permitidas.');
  const totalCents = cents(total);
  if (totalCents <= 0) throw new Error('O total da venda deve ser positivo.');
  civilDate(saleDate);
  const anchor = condition.balanceDeadlineAnchor === 'TRAVEL_START' ? travelStart : saleDate;
  if (!anchor) throw new Error('Informe a data de embarque na venda para calcular os vencimentos.');
  const deadline = civilDate(anchor);
  deadline.setUTCDate(deadline.getUTCDate() + condition.balanceDeadlineOffsetDays);
  const dueDate = dateText(deadline);
  const minimum = condition.minInstallmentAmount === null ? 0 : cents(condition.minInstallmentAmount);
  const maximum = Math.min(condition.maxInstallments, minimum > 0 ? Math.floor(totalCents / minimum) : totalCents);
  if (!Number.isInteger(installments) || installments < 1 || installments > maximum) {
    throw new Error('Quantidade de parcelas fora dos limites da condição.');
  }
  if (condition.scheduleKind === 'SINGLE') return [{ kind: 'SINGLE', amount: total, dueDate }];
  if (condition.scheduleKind === 'DOWN_PAYMENT_PLUS_BALANCE') {
    if (installments !== 1) throw new Error('Entrada e saldo não usam quantidade fixa de parcelas.');
    const entry = condition.downPaymentMode === 'AMOUNT' ? cents(condition.downPaymentValue)
      : Number((BigInt(totalCents) * BigInt(Math.round(condition.downPaymentValue * 10000)) + 500000n) / 1000000n);
    if (entry <= 0 || entry >= totalCents) throw new Error('A entrada deve ser positiva e menor que o total.');
    return [
      { kind: 'DOWN_PAYMENT', amount: entry / 100, dueDate: saleDate },
      { kind: 'BALANCE', amount: (totalCents - entry) / 100, dueDate },
    ];
  }
  const base = Math.floor(totalCents / installments);
  return Array.from({ length: installments }, (_, index) => {
    const month = civilDate(dueDate);
    const originalDay = month.getUTCDate();
    month.setUTCDate(1);
    month.setUTCMonth(month.getUTCMonth() + index);
    const last = new Date(month.getTime());
    last.setUTCMonth(last.getUTCMonth() + 1, 0);
    month.setUTCDate(Math.min(originalDay, last.getUTCDate()));
    return { kind: 'INSTALLMENT', amount: (index === installments - 1 ? totalCents - base * index : base) / 100,
      dueDate: dateText(month) };
  });
}
