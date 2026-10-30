import { describe, expect, it } from 'vitest';
import { getManagedBackupReadiness, parseBackupScheduleMutation } from '../src/tenant-backup-managed';

describe('managed backup configuration', () => {
  it('reports ready only when private storage and the versioned keyring are configured', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    expect(getManagedBackupReadiness({
      STORAGE_PROVIDER: 'supabase', SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'fictional-service-role', TENANT_BACKUP_KEYRING_JSON: JSON.stringify({ v1: key }),
      TENANT_BACKUP_CURRENT_KEY_VERSION: 'v1',
    })).toEqual({ storageConfigured: true, encryptionConfigured: true, ready: true });
    expect(getManagedBackupReadiness({ STORAGE_PROVIDER: 'local', TENANT_BACKUP_KEYRING_JSON: JSON.stringify({ v1: key }), TENANT_BACKUP_CURRENT_KEY_VERSION: 'v1' }).ready).toBe(false);
  });

  it('requires a password and strict schedule fields before persistence', () => {
    expect(parseBackupScheduleMutation({ enabled: true, dailyTime: '02:15', timezone: 'America/Sao_Paulo', currentPassword: 'pass' }))
      .toEqual({ enabled: true, dailyTime: '02:15', timezone: 'America/Sao_Paulo', currentPassword: 'pass' });
    expect(() => parseBackupScheduleMutation({ enabled: true, dailyTime: '2:15', timezone: 'America/Sao_Paulo', currentPassword: 'pass' })).toThrow();
    expect(() => parseBackupScheduleMutation({ enabled: true, dailyTime: '02:15', timezone: 'Invalid/Zone', currentPassword: 'pass' })).toThrow();
    expect(() => parseBackupScheduleMutation({ enabled: false, dailyTime: '02:15', timezone: 'UTC' })).toThrow(/currentPassword/);
  });
});
