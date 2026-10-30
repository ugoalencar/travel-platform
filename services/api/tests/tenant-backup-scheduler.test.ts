import { describe, expect, it } from 'vitest';
import { calculateNextBackupRun, parseBackupScheduleInput } from '../src/tenant-backup-scheduler';

describe('tenant backup schedule parser', () => {
  it('accepts a daily local time and a valid IANA timezone', () => {
    expect(parseBackupScheduleInput({ enabled: true, dailyTime: '02:15', timezone: 'America/Sao_Paulo' })).toEqual({
      enabled: true, dailyTime: '02:15', timezone: 'America/Sao_Paulo',
    });
  });

  it('rejects unknown fields, invalid times, invalid timezones, and nonboolean enabled values', () => {
    expect(() => parseBackupScheduleInput({ enabled: true, dailyTime: '2:15', timezone: 'America/Sao_Paulo' })).toThrow();
    expect(() => parseBackupScheduleInput({ enabled: true, dailyTime: '25:00', timezone: 'America/Sao_Paulo' })).toThrow();
    expect(() => parseBackupScheduleInput({ enabled: true, dailyTime: '02:15', timezone: 'Mars/Olympus' })).toThrow();
    expect(() => parseBackupScheduleInput({ enabled: 'true', dailyTime: '02:15', timezone: 'America/Sao_Paulo' })).toThrow();
    expect(() => parseBackupScheduleInput({ enabled: true, dailyTime: '02:15', timezone: 'UTC', agencyId: 'foreign' })).toThrow();
  });
});

describe('next daily backup time', () => {
  it('returns the next matching local minute and local run date', () => {
    const result = calculateNextBackupRun(new Date('2026-10-28T04:00:00.000Z'), '02:15', 'America/Sao_Paulo');
    expect(result).toEqual({ nextRunAt: new Date('2026-10-28T05:15:00.000Z'), nextLocalDate: '2026-10-28' });
  });

  it('moves to the following local day when today’s time has already passed', () => {
    const result = calculateNextBackupRun(new Date('2026-10-28T06:00:00.000Z'), '02:15', 'America/Sao_Paulo');
    expect(result).toEqual({ nextRunAt: new Date('2026-10-29T05:15:00.000Z'), nextLocalDate: '2026-10-29' });
  });

  it('skips a nonexistent daylight-saving local minute instead of firing at the wrong local time', () => {
    const result = calculateNextBackupRun(new Date('2026-03-08T05:00:00.000Z'), '02:30', 'America/New_York');
    expect(result.nextLocalDate).toBe('2026-03-09');
  });
});
