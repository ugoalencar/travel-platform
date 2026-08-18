import { getAgencyId } from './tenant-context';
import type {
  Broker,
  Commission,
  CreateInput,
  Customer,
  CustomerAccount,
  Offer,
  Proposal,
  Sale,
  TenantScoped,
  Trip,
  UpdateInput,
  User,
  Wish,
} from './types';

export interface ParameterizedTenantWhere {
  clause: string;
  values: readonly [string];
}

export interface TenantQueryClient {
  query<T>(
    query: string,
    params: readonly unknown[],
  ): Promise<{ rows: T[] } | T[]>;
}

export abstract class TenantRepository<T extends { agencyId: string }> {
  findAll(filters: Partial<T> = {}): Promise<TenantScoped<T>[]> {
    const where = this.buildTenantWhere(filters);
    return this.notImplemented('findAll', where);
  }

  findById(id: string): Promise<TenantScoped<T> | null> {
    const where = this.buildTenantWhere({});
    return this.notImplemented('findById', { ...where, id });
  }

  create(data: CreateInput<T>): Promise<TenantScoped<T>> {
    const scopedData = {
      ...data,
      agencyId: getAgencyId(),
    };

    return this.notImplemented('create', scopedData);
  }

  async update(id: string, data: UpdateInput<T>): Promise<TenantScoped<T>> {
    const agencyId = getAgencyId();
    const existing = await this.findById(id);

    if (!existing) {
      throw new Error('Record not found');
    }

    if (existing.agencyId !== agencyId) {
      throw new Error('Access denied: record belongs to another agency');
    }

    return this.notImplemented('update', { id, data, agencyId });
  }

  async delete(id: string): Promise<void> {
    const agencyId = getAgencyId();
    const existing = await this.findById(id);

    if (!existing) {
      throw new Error('Record not found');
    }

    if (existing.agencyId !== agencyId) {
      throw new Error('Access denied: record belongs to another agency');
    }

    return this.notImplemented('delete', { id, agencyId });
  }

  count(filters: Partial<T> = {}): Promise<number> {
    const where = this.buildTenantWhere(filters);
    return this.notImplemented('count', where);
  }

  protected buildTenantWhere(filters: Partial<T>): Partial<T> & { agencyId: string } {
    return {
      ...filters,
      agencyId: getAgencyId(),
    };
  }

  protected notImplemented<TReturn>(
    operation: string,
    safeParameters: unknown,
  ): Promise<TReturn> {
    return Promise.reject(
      new Error(
        `${operation} not implemented. Tenant-safe parameters prepared: ${JSON.stringify(
          safeParameters,
        )}`,
      ),
    );
  }
}

export class AgencyRepository {
  getCurrentAgencyId(): string {
    return getAgencyId();
  }
}

export class UserRepository extends TenantRepository<User> {}

export class BrokerRepository extends TenantRepository<Broker> {}

export class CustomerRepository extends TenantRepository<Customer> {}

export class CustomerAccountRepository extends TenantRepository<CustomerAccount> {}

export class WishRepository extends TenantRepository<Wish> {}

export class TripRepository extends TenantRepository<Trip> {}

export class OfferRepository extends TenantRepository<Offer> {}

export class ProposalRepository extends TenantRepository<Proposal> {}

export class SaleRepository extends TenantRepository<Sale> {}

export class CommissionRepository extends TenantRepository<Commission> {}

export function tenantWhere(alias?: string): ParameterizedTenantWhere {
  const prefix = alias ? `${validateSqlIdentifier(alias)}.` : '';

  return {
    clause: `${prefix}agency_id = $1`,
    values: [getAgencyId()],
  };
}

export async function tenantQuery<T>(
  client: TenantQueryClient,
  query: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const agencyId = getAgencyId();

  assertParameterizedTenantPredicate(query);

  const result = await client.query<T>(query, [agencyId, ...params]);
  return Array.isArray(result) ? result : result.rows;
}

function assertParameterizedTenantPredicate(query: string): void {
  if (/\bagency_id\s*=\s*['"`]/iu.test(query)) {
    throw new Error('Tenant agency_id filter must use a parameter placeholder');
  }

  if (!/\bagency_id\s*=\s*\$1\b/iu.test(query)) {
    throw new Error('Query missing parameterized agency_id filter at $1');
  }
}

function validateSqlIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(identifier)) {
    throw new Error('Invalid SQL identifier');
  }

  return identifier;
}
