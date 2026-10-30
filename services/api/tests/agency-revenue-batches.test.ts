import { describe,expect,it,vi } from 'vitest';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { closeRevenueBatch,parseSettlementPolicy,settlementWindow,receiveRevenueBatch } from '../src/agency-revenue-batches';
import type { DatabaseRuntime } from '../src/database';

describe('revenue settlement windows',()=>{
  it('clamps monthly closing days and adds real calendar days including leap years',()=>{
    expect(settlementWindow('2024-02',31,5)).toEqual({start:'2024-01-31',end:'2024-02-29',expected:'2024-03-05'});
    expect(settlementWindow('2026-01',15,20)).toEqual({start:'2025-12-15',end:'2026-01-15',expected:'2026-02-04'});
  });
  it.each(['2026-00','2026-13','x','0000-01'])('rejects invalid month %s',month=>expect(()=>settlementWindow(month,15,1)).toThrow());
  it('requires an explicit calendar only for batch settlement',()=>{
    expect(parseSettlementPolicy({settlementMode:'PER_SALE'})).toEqual({settlementMode:'PER_SALE',closingDay:null,paymentDays:null});
    expect(()=>parseSettlementPolicy({settlementMode:'BATCH_WINDOW'})).toThrow();
    expect(()=>parseSettlementPolicy({settlementMode:'BATCH_WINDOW',closingDay:31,paymentDays:-1})).toThrow();
    expect(()=>parseSettlementPolicy({settlementMode:'PER_SALE',agencyId:'other'})).toThrow();
  });
  it('refuses writes for managers before opening a transaction',async()=>{
    const withTenantTransaction=vi.fn();
    const database={withTenantTransaction} as unknown as DatabaseRuntime;
    await runWithTenantContext({agencyId:'a',userId:'u',userRole:UserRole.MANAGER,email:'u@example.test'},async()=>{
      await expect(closeRevenueBatch(database,'2026-01')).rejects.toMatchObject({code:'FORBIDDEN'});
      await expect(receiveRevenueBatch(database,'batch',null)).rejects.toMatchObject({code:'FORBIDDEN'});
    });
    expect(withTenantTransaction).not.toHaveBeenCalled();
  });
});
