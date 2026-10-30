import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword, hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from '../src/password';

describe('Travel Lite password policy', () => {
  it('rejects eleven characters and accepts the twelve-character boundary', async () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    await expect(hashPassword('Abc12345!xy')).rejects.toThrow('12 caracteres');
    const password = 'Abc12345!xyz';
    expect(await verifyPassword(password, await hashPassword(password))).toBe(true);
  });

  it('generates unique temporary passwords above the minimum', () => {
    const passwords = Array.from({ length: 20 }, generateTemporaryPassword);
    expect(new Set(passwords).size).toBe(passwords.length);
    expect(passwords.every((password) => password.length >= MIN_PASSWORD_LENGTH)).toBe(true);
  });
});
