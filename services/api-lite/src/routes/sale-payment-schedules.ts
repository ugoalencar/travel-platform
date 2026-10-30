import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requireAdministrator, requirePermission, scopeFor } from '../access';
import { getTenantContext } from '../tenant-context';

import type { LiteDatabase } from '../database';
import { ValidationError } from '../errors';
import { parseObjectBody, requiredString, requiredUuid } from '../validation';
import { civilDate, moneyCents, validatePaymentCondition } from '../payment-schedule';
import { createPaymentCondition, createSalePaymentSchedule, getSaleBalance, listPaymentConditions,
  recordSalePayment, reviseSalePaymentSchedule, type ConditionDefinition, type SalePaymentInput } from '../sale-payment-schedules';

function text(value: unknown, name: string, maximum = 200): string {
  const result = requiredString({ [name]: value },name).trim();
  if (result.length > maximum) throw new ValidationError(`Field ${name} is too long`);
  return result;
}
function number(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ValidationError(`Invalid ${name}`);
  return value;
}
function boolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new ValidationError(`Invalid ${name}`);
  return value;
}
function member<T extends string>(value: unknown, choices: readonly T[], name: string): T {
  const found = choices.find((choice) => choice === value);
  if (found === undefined) throw new ValidationError(`Invalid ${name}`);
  return found;
}
function strings(value: unknown, name: string, uuid: boolean): string[] {
  if (!Array.isArray(value) || value.length > 200) throw new ValidationError(`Invalid ${name}`);
  const result = value.map((item: unknown) => uuid ? parseUuidParam(text(item,name),name) : text(item,name,100));
  if (new Set(result).size !== result.length) throw new ValidationError(`Duplicate ${name}`);
  return result;
}
function parseCondition(body: unknown): ConditionDefinition {
  const record = parseObjectBody(body);
  assertAllowedFields(record,[],['name','scheduleKind','maxInstallments','minInstallmentAmount','interestFree',
    'downPaymentMode','downPaymentValue','downPaymentRequired','balanceDeadlineAnchor','balanceDeadlineOffsetDays',
    'allowsPartialPayments','paymentMethods','categoryIds','productIds']);
  const result: ConditionDefinition = { name: text(record.name,'name'),version: 1,
    scheduleKind: member(record.scheduleKind,['SINGLE','EQUAL_INSTALLMENTS','DOWN_PAYMENT_PLUS_BALANCE'],'scheduleKind'),
    maxInstallments: number(record.maxInstallments,'maxInstallments'),
    minInstallmentAmount: record.minInstallmentAmount === null ? null : number(record.minInstallmentAmount,'minInstallmentAmount'),
    interestFree: boolean(record.interestFree,'interestFree'),
    downPaymentMode: member(record.downPaymentMode,['NONE','PERCENT','AMOUNT'],'downPaymentMode'),
    downPaymentValue: number(record.downPaymentValue,'downPaymentValue'),
    downPaymentRequired: boolean(record.downPaymentRequired,'downPaymentRequired'),
    balanceDeadlineAnchor: member(record.balanceDeadlineAnchor,['SALE_DATE','TRAVEL_START'],'balanceDeadlineAnchor'),
    balanceDeadlineOffsetDays: number(record.balanceDeadlineOffsetDays,'balanceDeadlineOffsetDays'),
    allowsPartialPayments: boolean(record.allowsPartialPayments,'allowsPartialPayments'),
    paymentMethods: strings(record.paymentMethods,'paymentMethods',false),
    categoryIds: strings(record.categoryIds,'categoryIds',true),productIds: strings(record.productIds,'productIds',true) };
  if (result.paymentMethods.length === 0) throw new ValidationError('At least one payment method is required');
  validatePaymentCondition(result);
  return result;
}
function parsePayment(body: unknown): SalePaymentInput {
  const record = parseObjectBody(body);
  assertAllowedFields(record,[],['amount','idempotency_key','method','paid_at','receivable_id','reference','notes','account_id']);
  const amount = number(record.amount,'amount');
  moneyCents(amount);
  const paidAt = text(record.paid_at,'paid_at',40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(paidAt) || !Number.isFinite(Date.parse(paidAt))) {
    throw new ValidationError('paid_at must be an ISO timestamp with timezone');
  }
  civilDate(paidAt.slice(0,10));
  return { amount,account_id: parseUuidParam(text(record.account_id,'account_id'),'account_id'),idempotency_key: text(record.idempotency_key,'idempotency_key',150),
    method: text(record.method,'method',100),paid_at: new Date(paidAt).toISOString(),
    receivable_id: record.receivable_id === undefined ? null : parseUuidParam(text(record.receivable_id,'receivable_id'),'receivable_id'),
    reference: record.reference === undefined ? null : text(record.reference,'reference',300),
    notes: record.notes === undefined ? null : text(record.notes,'notes',1000) };
}

export function registerSalePaymentSchedulesRoutes(app: FastifyInstance,
  database: LiteDatabase, protectedHooks: preHandlerHookHandler[]): void {
  app.get('/payment-conditions',{ preHandler: protectedHooks },async () => {
    scopeFor(getTenantContext(), 'sales.read_all', 'sales.read_own');
    return { conditions: await listPaymentConditions(database) };
  });
  app.post('/payment-conditions',{ preHandler: protectedHooks },async (request,reply) => {
    requireAdministrator(getTenantContext());
    const condition = await createPaymentCondition(database,parseCondition(request.body));
    return reply.code(201).send({ condition });
  });
  app.get<{ Params: { id: string } }>('/sales/:id/balance',{ preHandler: protectedHooks },async (request) => {
    scopeFor(getTenantContext(), 'sales.read_all', 'sales.read_own');
    return getSaleBalance(database,parseUuidParam(request.params.id,'id'));
  });
  app.get<{ Params: { id: string } }>('/sales/:id/payment-schedule',{ preHandler: protectedHooks },async (request) => {
    scopeFor(getTenantContext(), 'sales.read_all', 'sales.read_own');
    const balance = await getSaleBalance(database,parseUuidParam(request.params.id,'id'));
    return { snapshot: balance.snapshot,receivables: balance.receivables };
  });
  app.post<{ Params: { id: string } }>('/sales/:id/payment-schedule',{ preHandler: protectedHooks },async (request,reply) => {
    scopeFor(getTenantContext(), 'sales.read_all', 'sales.read_own');
    requirePermission(getTenantContext(), 'finance.manage');
    const record = parseObjectBody(request.body);
    assertAllowedFields(record,[],['conditionId','installments','paymentMethod']);
    requirePermission(getTenantContext(), 'finance.manage');
    const balance = await createSalePaymentSchedule(database,parseUuidParam(request.params.id,'id'),{
      conditionId: parseUuidParam(text(record.conditionId,'conditionId'),'conditionId'),
      installments: number(record.installments,'installments'),paymentMethod: text(record.paymentMethod,'paymentMethod',100) });
    return reply.code(201).send(balance);
  });
  app.post<{ Params: { id: string } }>('/sales/:id/payments',{ preHandler: protectedHooks },async (request,reply) => {
    scopeFor(getTenantContext(), 'sales.read_all', 'sales.read_own');
    requirePermission(getTenantContext(), 'finance.manage');
    const result = await recordSalePayment(database,parseUuidParam(request.params.id,'id'),parsePayment(request.body));
    return reply.code(201).send(result);
  });
  app.post<{ Params: { id: string } }>('/sales/:id/payment-schedule/revise',{ preHandler: protectedHooks },async (request) => {
    requireAdministrator(getTenantContext());
    const record = parseObjectBody(request.body);
    assertAllowedFields(record,[],['reason']);
    requirePermission(getTenantContext(), 'finance.manage');
    return reviseSalePaymentSchedule(database,parseUuidParam(request.params.id,'id'),text(record.reason,'reason',500));
  });
}

function parseUuidParam(value: string, name: string): string {
  return requiredUuid({ [name]: value }, name);
}
function assertAllowedFields(record: Record<string, unknown>, _ignored: string[], allowed: string[]): void {
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw new ValidationError('Campo desconhecido');
}