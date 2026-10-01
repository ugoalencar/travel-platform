/**
 * CPF validation (digits only, with check-digit verification). Same
 * algorithm as services/api/src/import/validator.ts — deliberate copy:
 * Travel Lite does not import runtime code from services/api.
 */

const CPF_RE = /^\d{11}$/;

export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeCpf(value);
  if (!CPF_RE.test(cpf)) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calculateDigit = (base: number[], factor: number): number => {
    let sum = 0;
    for (let i = 0; i < base.length; i += 1) {
      sum += (base[i] ?? 0) * (factor - i);
    }
    const rest = (sum * 10) % 11;
    return rest >= 10 ? 0 : rest;
  };

  const digits = cpf.split('').map(Number);
  const first = calculateDigit(digits.slice(0, 9), 10);
  if (first !== digits[9]) return false;
  const second = calculateDigit(digits.slice(0, 10), 11);
  return second === digits[10];
}
