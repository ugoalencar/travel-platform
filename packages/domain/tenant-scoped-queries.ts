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

// ARCH-02: this repository layer is intentionally unimplemented pending the
// SQL-vs-Prisma source-of-truth decision (ARCH-01). Every method below must
// still fail closed without a tenant context (getAgencyId() throws
// TenantError first) and must never place tenant data -- ids, filters,
// payloads -- into an Error message, since Error objects routinely end up
// in logs and crash reporters. NotImplementedRepositoryError carries only
// the operation name and the repository's own class name.
export class NotImplementedRepositoryError extends Error {
  constructor(
    public readonly operation: string,
    public readonly repositoryName: string,
  ) {
    super(
      `${repositoryName}.${operation}() is not implemented. This repository is a ` +
        'placeholder pending the persistence-layer architecture decision; no query ' +
        'was executed and no tenant data was read, written, or included in this error.',
    );
    this.name = 'NotImplementedRepositoryError';
  }
}

export abstract class TenantRepository<T extends { agencyId: string }> {
  findAll(_filters: Partial<T> = {}): Promise<TenantScoped<T>[]> {
    getAgencyId();
    return this.notImplemented('findAll');
  }

  findById(_id: string): Promise<TenantScoped<T> | null> {
    getAgencyId();
    return this.notImplemented('findById');
  }

  create(_data: CreateInput<T>): Promise<TenantScoped<T>> {
    getAgencyId();
    return this.notImplemented('create');
  }

  update(_id: string, _data: UpdateInput<T>): Promise<TenantScoped<T>> {
    getAgencyId();
    return this.notImplemented('update');
  }

  delete(_id: string): Promise<void> {
    getAgencyId();
    return this.notImplemented('delete');
  }

  count(_filters: Partial<T> = {}): Promise<number> {
    getAgencyId();
    return this.notImplemented('count');
  }

  /**
   * Available for a future real implementation to derive a tenant-scoped
   * filter. Not used by the placeholder methods above, which have nothing
   * to apply it to.
   */
  protected buildTenantWhere(filters: Partial<T>): Partial<T> & { agencyId: string } {
    return {
      ...filters,
      agencyId: getAgencyId(),
    };
  }

  protected notImplemented<TReturn>(operation: string): Promise<TReturn> {
    return Promise.reject(
      new NotImplementedRepositoryError(operation, this.constructor.name),
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
