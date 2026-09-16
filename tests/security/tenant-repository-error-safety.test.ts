import { describe, it, expect } from 'vitest';
import { UserRole } from '../../packages/domain/types';
import { runWithTenantContext, TenantError } from '../../packages/domain/tenant-context';
import {
  CustomerRepository,
  NotImplementedRepositoryError,
  SaleRepository,
} from '../../packages/domain/tenant-scoped-queries';

// ARCH-02 regression: the repository layer is an intentional placeholder
// (see NotImplementedRepositoryError's own comment) pending the ARCH-01
// SQL-vs-Prisma decision. Before this fix, notImplemented() serialized the
// caller's parameters -- agencyId, record ids, and any payload passed to
// create()/update() -- into the Error's message via JSON.stringify(). Any
// PII passed to create()/update() (CPF, email, notes) would land there too,
// and Error objects routinely get written to logs or sent to crash
// reporters. This test asserts no tenant identifier or payload value ever
// reaches the message, regardless of what the caller passes in.

const agencyId = 'agency-secret-0000-000000000001';
const sensitiveCustomerId = 'customer-id-should-not-leak';
const sensitiveCpf = '123.456.789-00';
const sensitiveEmail = 'leaked-pii@example.test';
const sensitiveNotes = 'Confidential: VIP customer, do not disclose';

function tenantContext() {
  return {
    agencyId,
    userId: 'user-0000-000000000001',
    userRole: UserRole.ADMIN,
    email: 'staff@example.test',
  };
}

describe('Tenant repository placeholder error safety', () => {
  it('rejects with NotImplementedRepositoryError and no leaked data for findAll/findById/count', async () => {
    const repository = new CustomerRepository();

    await runWithTenantContext(tenantContext(), async () => {
      await expect(repository.findAll({})).rejects.toBeInstanceOf(
        NotImplementedRepositoryError,
      );
      await expect(repository.findById(sensitiveCustomerId)).rejects.toBeInstanceOf(
        NotImplementedRepositoryError,
      );
      await expect(repository.count({})).rejects.toBeInstanceOf(NotImplementedRepositoryError);
    });
  });

  it('never includes the tenant id, record id, or payload fields in the error message', async () => {
    const repository = new CustomerRepository();

    await runWithTenantContext(tenantContext(), async () => {
      const errors = await Promise.all([
        repository.findAll({ name: sensitiveNotes }).catch((error: unknown) => error),
        repository.findById(sensitiveCustomerId).catch((error: unknown) => error),
        repository
          .create({
            name: 'Real Customer',
            protocolNumber: 'CLI-2026-000001',
            email: sensitiveEmail,
            cpf: sensitiveCpf,
            notes: sensitiveNotes,
            status: 'ACTIVE' as never,
          })
          .catch((error: unknown) => error),
        repository
          .update(sensitiveCustomerId, { email: sensitiveEmail, cpf: sensitiveCpf })
          .catch((error: unknown) => error),
        repository.delete(sensitiveCustomerId).catch((error: unknown) => error),
        repository.count({ name: sensitiveNotes }).catch((error: unknown) => error),
      ]);

      for (const error of errors) {
        expect(error).toBeInstanceOf(NotImplementedRepositoryError);
        const message = (error as Error).message;

        expect(message).not.toContain(agencyId);
        expect(message).not.toContain(sensitiveCustomerId);
        expect(message).not.toContain(sensitiveCpf);
        expect(message).not.toContain(sensitiveEmail);
        expect(message).not.toContain(sensitiveNotes);
      }
    });
  });

  it('names the operation and the concrete repository without echoing call parameters', async () => {
    const repository = new SaleRepository();

    await runWithTenantContext(tenantContext(), async () => {
      let caught: unknown;

      try {
        await repository.create({ amount: 999999, discount: 0, total: 999999 } as never);
      } catch (error: unknown) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(NotImplementedRepositoryError);
      const error = caught as NotImplementedRepositoryError;
      expect(error.operation).toBe('create');
      expect(error.repositoryName).toBe('SaleRepository');
      expect(error.message).toContain('SaleRepository.create()');
      expect(error.message).not.toContain('999999');
    });
  });

  it('fails closed: repository methods require tenant context before anything else', async () => {
    const repository = new CustomerRepository();

    // getAgencyId() is called synchronously before any Promise is
    // returned, so a missing tenant context throws immediately rather
    // than rejecting -- capture both styles the same way.
    async function callOutsideTenantContext(operation: () => unknown): Promise<unknown> {
      try {
        await operation();
        return undefined;
      } catch (error: unknown) {
        return error;
      }
    }

    const findAllError = await callOutsideTenantContext(() => repository.findAll({}));
    const createError = await callOutsideTenantContext(() => repository.create({} as never));
    const deleteError = await callOutsideTenantContext(() =>
      repository.delete(sensitiveCustomerId),
    );

    for (const error of [findAllError, createError, deleteError]) {
      expect(error).toBeInstanceOf(TenantError);
      expect(error).not.toBeInstanceOf(NotImplementedRepositoryError);
    }
  });
});
