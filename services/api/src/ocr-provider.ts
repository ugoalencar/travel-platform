/**
 * Customer 360 -- OCR provider contract.
 *
 * The extraction service depends on this interface and nothing else. No vendor
 * SDK is imported here, and no vendor name appears in the persisted schema
 * beyond the free-text `document_extractions.provider` label. Swapping Google
 * Vision for Textract, Tesseract, or an in-house model is a matter of writing
 * a new class that satisfies `OcrProviderContract` and passing it in.
 *
 * The contract is deliberately two-phase (submit, then poll) because every
 * realistic hosted OCR backend is asynchronous. A synchronous provider simply
 * resolves its result immediately, as {@link MockOcrProvider} does.
 */

/** Terminal and in-flight states an extraction task can report. */
export type OcrExtractionStatus = 'processing' | 'completed' | 'failed';

export interface SubmitParams {
  agencyId: string;
  documentId: string;
  attachmentId: string;
  /**
   * A resolver-issued, time-limited reference to the file's bytes. Never a
   * filesystem path and never a user-supplied string -- see
   * `document-attachments.ts` for how secure file keys are minted.
   */
  fileUrl: string;
  documentType: string;
}

export interface ExtractionResult {
  taskId: string;
  status: OcrExtractionStatus;
  /**
   * Provider-shaped field bag, persisted verbatim into the `extracted_data`
   * JSONB column. Left deliberately untyped so a provider can surface fields
   * this codebase does not model yet without a migration.
   */
  data?: Record<string, unknown>;
  /** Confidence on a 0-100 scale. */
  confidence?: number;
  /**
   * Per-field confidence on a 0-100 scale, keyed by the same field names as
   * {@link data}. Optional: a provider that only reports one overall score
   * may omit this and callers fall back to {@link confidence} for every
   * field. Never used to auto-apply a field -- see document-verification.ts
   * and NON_NEGOTIABLES.md: a candidate's confidence, however high, never
   * substitutes for human review.
   */
  fieldConfidences?: Record<string, number>;
  error?: string;
}

export interface OcrProviderContract {
  /** Stable identifier persisted as `document_extractions.provider`. */
  readonly name: string;

  /** Hand a document to the provider; resolves to the provider's task id. */
  submitForExtraction(params: SubmitParams): Promise<string>;

  /** Poll a previously submitted task. Resolves null for an unknown task id. */
  getExtractionResult(taskId: string): Promise<ExtractionResult | null>;
}

/** Fields the platform knows how to verify against a customer document. */
export interface CanonicalExtractedFields {
  holderName?: string;
  holderBirthDate?: string;
  holderNationality?: string;
  documentNumber?: string;
  issuingCountry?: string;
  expiryDate?: string;
}

export interface MockOcrProviderOptions {
  /** Fields the mock should report for every submission. */
  data?: Record<string, unknown>;
  confidence?: number;
  /** Fields the mock should report per-field confidence for. */
  fieldConfidences?: Record<string, number>;
  /** When set, submissions resolve to a failed result carrying this message. */
  failWith?: string;
  /**
   * When true, the first poll of a task reports `processing` and only the
   * next one reports a terminal state -- useful for exercising the polling
   * branch of the extraction flow.
   */
  simulateAsync?: boolean;
}

/**
 * In-memory provider used by tests and local development.
 *
 * Records every submission so assertions can check exactly what the extraction
 * service handed to the provider, and returns deterministic sample data.
 */
export class MockOcrProvider implements OcrProviderContract {
  readonly name = 'mock';

  private readonly options: MockOcrProviderOptions;
  private readonly tasks = new Map<string, { params: SubmitParams; polls: number }>();
  private counter = 0;

  constructor(options: MockOcrProviderOptions = {}) {
    this.options = options;
  }

  /** Every submission this provider has received, in order. */
  get submissions(): SubmitParams[] {
    return [...this.tasks.values()].map((task) => task.params);
  }

  submitForExtraction(params: SubmitParams): Promise<string> {
    this.counter += 1;
    const taskId = `mock-task-${this.counter}`;
    this.tasks.set(taskId, { params, polls: 0 });
    return Promise.resolve(taskId);
  }

  getExtractionResult(taskId: string): Promise<ExtractionResult | null> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return Promise.resolve(null);
    }

    task.polls += 1;

    if (this.options.simulateAsync === true && task.polls === 1) {
      return Promise.resolve({ taskId, status: 'processing' });
    }

    if (this.options.failWith !== undefined) {
      return Promise.resolve({
        taskId,
        status: 'failed',
        error: this.options.failWith,
      });
    }

    return Promise.resolve({
      taskId,
      status: 'completed',
      data: this.options.data ?? defaultMockData(task.params),
      confidence: this.options.confidence ?? 95,
      ...(this.options.fieldConfidences !== undefined
        ? { fieldConfidences: this.options.fieldConfidences }
        : {}),
    });
  }
}

function defaultMockData(params: SubmitParams): Record<string, unknown> {
  return {
    holderName: 'MOCK HOLDER',
    holderBirthDate: '1990-01-01',
    holderNationality: 'Brazilian',
    documentNumber: 'MOCK000000',
    documentType: params.documentType,
  };
}
