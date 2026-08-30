import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MockOcrProvider,
  type ExtractionResult,
  type OcrProviderContract,
  type SubmitParams,
} from '../src/ocr-provider';

const submitParams: SubmitParams = {
  agencyId: 'agency-1',
  documentId: 'doc-1',
  attachmentId: 'att-1',
  fileUrl: 'https://storage.example.test/signed/abc',
  documentType: 'PASSAPORTE',
};

describe('OCR provider contract', () => {
  it('is satisfied by the mock provider', () => {
    const provider: OcrProviderContract = new MockOcrProvider();

    expect(typeof provider.name).toBe('string');
    expect(typeof provider.submitForExtraction).toBe('function');
    expect(typeof provider.getExtractionResult).toBe('function');
  });

  it('names no vendor in the module source, so the abstraction stays portable', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../src/ocr-provider.ts'),
      'utf8',
    );
    // Vendor names may appear in the explanatory comment; no vendor SDK may be
    // imported and no vendor endpoint may be referenced.
    expect(source).not.toMatch(/from ['"](?!node:)[^'"]*(google|aws|textract|tesseract)/i);
    expect(source).not.toMatch(/https?:\/\/[^\s'"]*(googleapis|amazonaws)/i);
  });

  it('is satisfiable by an arbitrary third implementation', async () => {
    class StubProvider implements OcrProviderContract {
      readonly name = 'stub';
      submitForExtraction(): Promise<string> {
        return Promise.resolve('stub-1');
      }
      getExtractionResult(taskId: string): Promise<ExtractionResult | null> {
        return Promise.resolve({ taskId, status: 'completed', data: { a: 1 } });
      }
    }

    const provider: OcrProviderContract = new StubProvider();
    const taskId = await provider.submitForExtraction(submitParams);

    await expect(provider.getExtractionResult(taskId)).resolves.toMatchObject({
      status: 'completed',
    });
  });
});

describe('MockOcrProvider', () => {
  it('mints a distinct task id per submission and records what it received', async () => {
    const provider = new MockOcrProvider();

    const first = await provider.submitForExtraction(submitParams);
    const second = await provider.submitForExtraction({ ...submitParams, documentId: 'doc-2' });

    expect(first).not.toBe(second);
    expect(provider.submissions).toHaveLength(2);
    expect(provider.submissions[0]).toEqual(submitParams);
    expect(provider.submissions[1]?.documentId).toBe('doc-2');
  });

  it('returns a completed result in the contract shape', async () => {
    const provider = new MockOcrProvider();
    const taskId = await provider.submitForExtraction(submitParams);

    const result = await provider.getExtractionResult(taskId);

    expect(result).not.toBeNull();
    expect(result?.taskId).toBe(taskId);
    expect(result?.status).toBe('completed');
    expect(result?.confidence).toBeGreaterThan(0);
    expect(result?.confidence).toBeLessThanOrEqual(100);
    expect(result?.data).toMatchObject({ documentType: 'PASSAPORTE' });
  });

  it('returns null for an unknown task id', async () => {
    const provider = new MockOcrProvider();

    await expect(provider.getExtractionResult('nope')).resolves.toBeNull();
  });

  it('honours scripted data and confidence', async () => {
    const provider = new MockOcrProvider({
      data: { holderName: 'JOAO SILVA' },
      confidence: 42,
    });
    const taskId = await provider.submitForExtraction(submitParams);

    const result = await provider.getExtractionResult(taskId);

    expect(result?.data).toEqual({ holderName: 'JOAO SILVA' });
    expect(result?.confidence).toBe(42);
  });

  it('reports a failure with its message when scripted to fail', async () => {
    const provider = new MockOcrProvider({ failWith: 'Unreadable scan' });
    const taskId = await provider.submitForExtraction(submitParams);

    const result = await provider.getExtractionResult(taskId);

    expect(result?.status).toBe('failed');
    expect(result?.error).toBe('Unreadable scan');
    expect(result?.data).toBeUndefined();
  });

  it('reports processing on the first poll when simulating an async backend', async () => {
    const provider = new MockOcrProvider({ simulateAsync: true });
    const taskId = await provider.submitForExtraction(submitParams);

    await expect(provider.getExtractionResult(taskId)).resolves.toMatchObject({
      status: 'processing',
    });
    await expect(provider.getExtractionResult(taskId)).resolves.toMatchObject({
      status: 'completed',
    });
  });

  it('exposes a stable provider name for persistence', () => {
    expect(new MockOcrProvider().name).toBe('mock');
  });
});
