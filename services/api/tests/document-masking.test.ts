import { describe, expect, it } from 'vitest';
import { DocumentType } from '../../../packages/domain/types';
import {
  maskCPF,
  maskDocumentNumber,
  maskSensitiveFields,
  shouldMaskInLogs,
} from '../src/document-masking';

describe('maskDocumentNumber', () => {
  it('keeps a short identifying prefix and hides the rest', () => {
    const masked = maskDocumentNumber('AB123456789', DocumentType.PASSAPORTE);

    expect(masked).toBe('AB123456***');
    expect(masked).toHaveLength('AB123456789'.length);
    expect(masked).not.toContain('789');
  });

  it('shows only three characters for medium-length numbers', () => {
    expect(maskDocumentNumber('123456', DocumentType.RG)).toBe('123***');
  });

  it('masks short numbers completely rather than leaking most of them', () => {
    expect(maskDocumentNumber('1234', DocumentType.OUTRO)).toBe('****');
    expect(maskDocumentNumber('12', DocumentType.OUTRO)).toBe('**');
  });

  it('never reveals more than half of a nine-character number', () => {
    const value = '123456789';
    const masked = maskDocumentNumber(value, DocumentType.CNH);
    const revealed = masked.replace(/\*/g, '').length;

    expect(revealed).toBeLessThanOrEqual(Math.ceil(value.length / 2));
  });

  it('delegates CPF documents to the CPF formatter', () => {
    expect(maskDocumentNumber('12345678909', DocumentType.CPF)).toBe('123.***.***-**');
  });

  it('returns an empty string for null, undefined and blank input', () => {
    expect(maskDocumentNumber(null)).toBe('');
    expect(maskDocumentNumber(undefined)).toBe('');
    expect(maskDocumentNumber('   ')).toBe('');
  });

  it('works without a document type', () => {
    expect(maskDocumentNumber('AB123456789')).toBe('AB123456***');
  });
});

describe('maskCPF', () => {
  it('formats a bare CPF into the canonical masked shape', () => {
    expect(maskCPF('12345678909')).toBe('123.***.***-**');
  });

  it('accepts an already-formatted CPF', () => {
    expect(maskCPF('123.456.789-09')).toBe('123.***.***-**');
  });

  it('never emits the verifier digits', () => {
    expect(maskCPF('12345678909')).not.toContain('09');
    expect(maskCPF('12345678909')).not.toContain('456');
  });

  it('masks a malformed CPF completely rather than guessing', () => {
    expect(maskCPF('12345')).toBe('*****');
  });

  it('returns an empty string for null, undefined and non-numeric input', () => {
    expect(maskCPF(null)).toBe('');
    expect(maskCPF(undefined)).toBe('');
    expect(maskCPF('abc')).toBe('');
  });
});

describe('shouldMaskInLogs', () => {
  it('recognises sensitive fields in both camelCase and snake_case', () => {
    expect(shouldMaskInLogs('cpf')).toBe(true);
    expect(shouldMaskInLogs('documentNumber')).toBe(true);
    expect(shouldMaskInLogs('document_number')).toBe(true);
    expect(shouldMaskInLogs('secureFileKey')).toBe(true);
    expect(shouldMaskInLogs('holder_birth_date')).toBe(true);
  });

  it('is case-insensitive and tolerant of surrounding whitespace', () => {
    expect(shouldMaskInLogs('  CPF ')).toBe(true);
    expect(shouldMaskInLogs('DocumentNumber')).toBe(true);
  });

  it('leaves non-sensitive fields alone', () => {
    expect(shouldMaskInLogs('documentType')).toBe(false);
    expect(shouldMaskInLogs('customerId')).toBe(false);
    expect(shouldMaskInLogs('city')).toBe(false);
  });

  it('returns false for null, undefined and blank field names', () => {
    expect(shouldMaskInLogs(null)).toBe(false);
    expect(shouldMaskInLogs(undefined)).toBe(false);
    expect(shouldMaskInLogs('  ')).toBe(false);
  });
});

describe('maskSensitiveFields', () => {
  it('masks sensitive values and passes everything else through untouched', () => {
    const masked = maskSensitiveFields({
      customerId: 'cust-1',
      documentType: 'PASSAPORTE',
      documentNumber: 'AB123456789',
      cpf: '123.456.789-09',
    });

    expect(masked.customerId).toBe('cust-1');
    expect(masked.documentType).toBe('PASSAPORTE');
    expect(masked.documentNumber).toBe('AB123456***');
    expect(masked.cpf).toBe('123.***.***-**');
  });

  it('replaces non-string sensitive values with an opaque placeholder', () => {
    const masked = maskSensitiveFields({ documentNumber: 12345678, token: { a: 1 } });

    expect(masked.documentNumber).toBe('***');
    expect(masked.token).toBe('***');
  });

  it('preserves nulls without inventing a masked value', () => {
    expect(maskSensitiveFields({ cpf: null }).cpf).toBeNull();
  });

  it('returns an empty object for null and undefined payloads', () => {
    expect(maskSensitiveFields(null)).toEqual({});
    expect(maskSensitiveFields(undefined)).toEqual({});
  });
});
