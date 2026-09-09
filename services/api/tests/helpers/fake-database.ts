/**
 * A scriptable in-memory `DatabaseRuntime` for Customer 360 service tests.
 *
 * The Customer 360 services are thin, deliberate SQL: every assertion worth
 * making about them is about *what SQL they emit and with which parameters* --
 * that the agency id is always bound, that deletes are soft, that audit rows
 * are inserted in the same transaction. A recording fake makes those
 * assertions directly and keeps this suite runnable without a Docker Postgres,
 * unlike the container-backed integration suites elsewhere in this package.
 *
 * Cross-tenant isolation is asserted by proving the emitted SQL filters on
 * `agency_id` and binds the caller's own agency; the database-level RLS proof
 * lives with the migration tests.
 */

import type { QueryResult, QueryResultRow } from 'pg';
import type { DatabaseRuntime, TenantTransactionClient } from '../../src/database';
import { UserRole } from '../../../../packages/domain/types';

export interface RecordedQuery {
  text: string;
  values: unknown[];
}

export type QueryResponder = (
  query: RecordedQuery,
) => Record<string, unknown>[] | undefined;

export interface FakeDatabase extends DatabaseRuntime {
  /** Every query issued, in order. */
  readonly queries: RecordedQuery[];
  /** Number of `withTenantTransaction` calls that were opened. */
  readonly transactionCount: number;
  /** Queries whose SQL contains the given fragment (case-insensitive). */
  find(fragment: string): RecordedQuery[];
  /** The single query matching a fragment; fails loudly when ambiguous. */
  findOne(fragment: string): RecordedQuery;
}

/**
 * Build a fake runtime.
 *
 * @param responder returns the rows a given query should resolve to, or
 * `undefined` to fall through to an empty result.
 */
export function createFakeDatabase(responder: QueryResponder = () => undefined): FakeDatabase {
  const queries: RecordedQuery[] = [];
  let transactionCount = 0;

  const client: TenantTransactionClient = {
    query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: readonly unknown[],
    ): Promise<QueryResult<T>> {
      const recorded: RecordedQuery = { text, values: values ? [...values] : [] };
      queries.push(recorded);

      const rows = (responder(recorded) ?? []) as T[];
      return Promise.resolve({
        rows,
        rowCount: rows.length,
        command: '',
        oid: 0,
        fields: [],
      } as unknown as QueryResult<T>);
    },
  };

  return {
    queries,
    get transactionCount() {
      return transactionCount;
    },
    async withTenantTransaction<T>(
      operation: (c: TenantTransactionClient) => Promise<T>,
    ): Promise<T> {
      transactionCount += 1;
      return operation(client);
    },
    async withPlatformTransaction<T>(
      operation: (c: TenantTransactionClient) => Promise<T>,
    ): Promise<T> {
      transactionCount += 1;
      return operation(client);
    },
    find(fragment: string): RecordedQuery[] {
      const needle = fragment.toLowerCase();
      return queries.filter((query) => query.text.toLowerCase().includes(needle));
    },
    findOne(fragment: string): RecordedQuery {
      const matches = this.find(fragment);
      if (matches.length !== 1) {
        throw new Error(
          `Expected exactly one query containing "${fragment}", found ${matches.length}`,
        );
      }
      // `matches.length === 1` was just asserted.
      return matches[0] as RecordedQuery;
    },
  };
}

export const AGENCY_A = '10000000-0000-4000-8000-000000000001';
export const AGENCY_B = '20000000-0000-4000-8000-000000000001';
export const USER_A = '11000000-0000-4000-8000-000000000001';
export const USER_B = '21000000-0000-4000-8000-000000000001';
export const CUSTOMER_A = '12000000-0000-4000-8000-000000000001';

export function contextFor(agencyId: string, userId: string) {
  return {
    agencyId,
    userId,
    userRole: UserRole.ADMIN,
    email: `user-${agencyId}@example.test`,
  };
}

export const CONTEXT_A = contextFor(AGENCY_A, USER_A);
export const CONTEXT_B = contextFor(AGENCY_B, USER_B);

const NOW = '2026-08-29T12:00:00.000Z';

/** A `customer_addresses` row with sensible defaults. */
export function addressRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'addr-1',
    agency_id: AGENCY_A,
    customer_id: CUSTOMER_A,
    type: 'RESIDENTIAL',
    is_primary: false,
    cep: '01001-000',
    street: 'Rua Um',
    number: '100',
    complement: null,
    district: 'Centro',
    city: 'Sao Paulo',
    state: 'SP',
    country: 'Brazil',
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    ...overrides,
  };
}

/** A `customer_dependents` row with sensible defaults. */
export function dependentRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'dep-1',
    agency_id: AGENCY_A,
    customer_id: CUSTOMER_A,
    name: 'Maria Silva',
    relationship_type: 'SPOUSE',
    birth_date: null,
    cpf: null,
    nationality: null,
    notes: null,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    ...overrides,
  };
}

/** A `customer_documents` row with sensible defaults. */
export function documentRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'doc-1',
    agency_id: AGENCY_A,
    customer_id: CUSTOMER_A,
    document_type: 'PASSAPORTE',
    document_number: 'AB123456789',
    holder_name: 'JOAO SILVA',
    holder_birth_date: '1990-01-01',
    holder_nationality: 'Brazilian',
    issuing_country: 'BR',
    issuing_authority: 'PF',
    issued_date: '2020-01-01',
    expiry_date: '2030-01-01',
    is_expired: false,
    verification_status: 'PENDING',
    verified_at: null,
    verified_by_user_id: null,
    notes: null,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    ...overrides,
  };
}

/** A `document_attachments` row with sensible defaults. */
export function attachmentRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'att-1',
    agency_id: AGENCY_A,
    document_id: 'doc-1',
    attachment_type: 'FRONT',
    file_name: 'passport.png',
    file_size_bytes: 2048,
    file_mime_type: 'image/png',
    secure_file_key: 'documents/doc-1/abc',
    file_hash: null,
    created_at: NOW,
    deleted_at: null,
    ...overrides,
  };
}

/** A `document_extractions` row with sensible defaults. */
export function extractionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ext-1',
    agency_id: AGENCY_A,
    document_id: 'doc-1',
    provider: 'mock',
    extracted_data: {},
    confidence: null,
    processing_status: 'PENDING',
    processed_at: null,
    error_message: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

/** A `document_verifications` row with sensible defaults. */
export function verificationRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'ver-1',
    agency_id: AGENCY_A,
    document_id: 'doc-1',
    extraction_id: 'ext-1',
    holder_name_match: null,
    holder_birth_date_match: null,
    holder_nationality_match: null,
    document_number_match: null,
    discrepancies: null,
    manual_review_notes: null,
    reviewed_at: null,
    reviewed_by_user_id: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

/** A `document_audit_events` row with sensible defaults. */
export function auditEventRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'evt-1',
    agency_id: AGENCY_A,
    document_id: 'doc-1',
    attachment_id: null,
    user_id: USER_A,
    customer_id: CUSTOMER_A,
    event_type: 'DOCUMENT_CREATED',
    metadata: null,
    created_at: NOW,
    ...overrides,
  };
}

/**
 * Route a responder by the table an INSERT/UPDATE/SELECT touches, so tests can
 * script several statements without inspecting raw SQL.
 */
export function respondByTable(
  table: string,
  rows: Record<string, unknown>[],
): QueryResponder {
  return (query) => (query.text.includes(table) ? rows : undefined);
}
