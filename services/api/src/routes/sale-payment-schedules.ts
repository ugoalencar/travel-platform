import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import { assertAllowedFields, parseObjectBody, parseRequiredString, parseUuidParam } from '../request-parsing';
import { civilDate, moneyCents, validatePaymentCondition } from '../payment-schedule';
import { createPaymentCondition, createSalePaymentSchedule, getSaleBalance, listPaymentConditions,
  recordSalePayment, reviseSalePaymentSchedule, revisePaymentCondition, deactivatePaymentCondition,
  reverseSalePayment,
  type ConditionDefinition, type SalePaymentInput } from '../sale-payment-schedules';

function text(value: unknown, name: string, maximum = 200): string {
  const result = parseRequiredString(value,name).trim();
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
  assertAllowedFields(record,[],['amount','idempotency_key','method','paid_at','receivable_id','reference','notes']);
  const amount = number(record.amount,'amount');
  moneyCents(amount);
  const paidAt = text(record.paid_at,'paid_at',40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(paidAt) || !Number.isFinite(Date.parse(paidAt))) {
    throw new ValidationError('paid_at must be an ISO timestamp with timezone');
  }
  civilDate(paidAt.slice(0,10));
  return { amount,idempotency_key: text(record.idempotency_key,'idempotency_key',150),
    method: text(record.method,'method',100),paid_at: new Date(paidAt).toISOString(),
    receivable_id: record.receivable_id === undefined ? null : parseUuidParam(text(record.receivable_id,'receivable_id'),'receivable_id'),
    reference: record.reference === undefined ? null : text(record.reference,'reference',300),
    notes: record.notes === undefined ? null : text(record.notes,'notes',1000) };
}

export function registerSalePaymentSchedulesRoutes(app: FastifyInstance,
  options: { database: DatabaseRuntime; protectedHooks: preHandlerHookHandler[] }): void {
  const { database,protectedHooks } = options;
  app.get<{ Querystring: { includeInactive?: string } }>('/payment-conditions',{ preHandler: protectedHooks },async (request) => {
    requireRole(UserRole.MANAGER);
    if (request.query.includeInactive !== undefined && request.query.includeInactive !== 'true' && request.query.includeInactive !== 'false') throw new ValidationError('Invalid includeInactive');
    return { conditions: await listPaymentConditions(database,{includeInactive:request.query.includeInactive === 'true'}) };
  });
  app.put<{ Params: { id: string } }>('/payment-conditions/:id',{ preHandler: protectedHooks },async (request) => {
    requireRole(UserRole.ADMIN);
    const id=parseUuidParam(request.params.id,'id');
    return {condition:await revisePaymentCondition(database,id,parseCondition(request.body))};
  });
  app.post<{ Params: { id: string } }>('/payment-conditions/:id/deactivate',{ preHandler: protectedHooks },async (request) => {
    requireRole(UserRole.ADMIN);
    const id=parseUuidParam(request.params.id,'id');
    await deactivatePaymentCondition(database,id);
    return {ok:true};
  });
  app.post('/payment-conditions',{ preHandler: protectedHooks },async (request,reply) => {
    requireRole(UserRole.ADMIN);
    const condition = await createPaymentCondition(database,parseCondition(request.body));
    return reply.code(201).send({ condition });
  });
  app.get<{ Params: { id: string } }>('/sales/:id/balance',{ preHandler: protectedHooks },async (request) => {
    requireRole(UserRole.MANAGER);
    return getSaleBalance(database,parseUuidParam(request.params.id,'id'));
  });
  app.get<{ Params: { id: string } }>('/sales/:id/payment-schedule',{ preHandler: protectedHooks },async (request) => {
    requireRole(UserRole.MANAGER);
    const balance = await getSaleBalance(database,parseUuidParam(request.params.id,'id'));
    return { snapshot: balance.snapshot,receivables: balance.receivables };
  });
  app.post<{ Params: { id: string } }>('/sales/:id/payment-schedule',{ preHandler: protectedHooks },async (request,reply) => {
    requireRole(UserRole.MANAGER);
    const record = parseObjectBody(request.body);
    assertAllowedFields(record,[],['conditionId','installments','paymentMethod']);
    const balance = await createSalePaymentSchedule(database,parseUuidParam(request.params.id,'id'),{
      conditionId: parseUuidParam(text(record.conditionId,'conditionId'),'conditionId'),
      installments: number(record.installments,'installments'),paymentMethod: text(record.paymentMethod,'paymentMethod',100) });
    return reply.code(201).send(balance);
  });
  app.post<{ Params: { id: string } }>('/sales/:id/payments',{ preHandler: protectedHooks },async (request,reply) => {
    requireRole(UserRole.MANAGER);
    const result = await recordSalePayment(database,parseUuidParam(request.params.id,'id'),parsePayment(request.body));
    return reply.code(201).send(result);
  });
  app.post<{ Params: { id: string; paymentId: string } }>('/sales/:id/payments/:paymentId/reverse',{ preHandler: protectedHooks },async (request) => {
    requireRole(UserRole.MANAGER);
    const body=parseObjectBody(request.body);
    assertAllowedFields(body,[],['reason']);
    return reverseSalePayment(database,parseUuidParam(request.params.id,'id'),parseUuidParam(request.params.paymentId,'paymentId'),
      text(body.reason,'reason',500));
  });
  app.post<{ Params: { id: string } }>('/sales/:id/payment-schedule/revise',{ preHandler: protectedHooks },async (request) => {
    requireRole(UserRole.ADMIN);
    const record = parseObjectBody(request.body);
    assertAllowedFields(record,[],['reason']);
    return reviseSalePaymentSchedule(database,parseUuidParam(request.params.id,'id'),text(record.reason,'reason',500));
  });
}
