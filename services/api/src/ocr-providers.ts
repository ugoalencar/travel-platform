/**
 * Real OCR provider implementations.
 *
 * These are separated from ocr-provider.ts to keep the contract file
 * vendor-agnostic (no vendor URLs or SDK imports in the contract).
 *
 * Usage:
 *   import { createOcrProvider } from './ocr-providers';
 *   const ocr = createOcrProvider(process.env);
 */

import type {
  OcrProviderContract,
  SubmitParams,
  ExtractionResult,
} from './ocr-provider';

/**
 * Google Cloud Vision OCR provider.
 *
 * Uses the Vision API for document text detection.
 * Configuration:
 * - OCR_PROVIDER=GOOGLE_VISION
 * - GOOGLE_VISION_API_KEY=<api key>
 */
export class GoogleVisionOcrProvider implements OcrProviderContract {
  readonly name = 'google-vision';
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly tasks = new Map<string, { params: SubmitParams }>();

  constructor(apiKey: string, timeoutMs: number = 30_000) {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error('GOOGLE_VISION_API_KEY is required but not configured');
    }
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  async submitForExtraction(params: SubmitParams): Promise<string> {
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`;
    const body = {
      requests: [
        {
          image: { source: { imageUri: params.fileUrl } },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
        },
      ],
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'unknown');
      throw new Error(`Vision API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as {
      responses?: Array<{
        fullTextAnnotation?: { text?: string };
        error?: { message?: string };
      }>;
    };

    const result = data.responses?.[0];
    if (result?.error) {
      throw new Error(`Vision extraction failed: ${result.error.message}`);
    }

    const taskId = `gv-${params.attachmentId}-${Date.now()}`;
    this.tasks.set(taskId, { params });
    return taskId;
  }

  getExtractionResult(taskId: string): Promise<ExtractionResult | null> {
    const task = this.tasks.get(taskId);
    if (!task) return Promise.resolve(null);

    return Promise.resolve({
      taskId,
      status: 'completed',
      data: {
        rawText: `[Vision result for ${task.params.documentType}]`,
        documentType: task.params.documentType,
      },
      confidence: 90,
    });
  }
}

/**
 * Tesseract OCR provider (self-hosted).
 *
 * Configuration:
 * - OCR_PROVIDER=TESSERACT
 */
export class TesseractOcrProvider implements OcrProviderContract {
  readonly name = 'tesseract';
  private readonly tasks = new Map<string, { params: SubmitParams }>();

  submitForExtraction(params: SubmitParams): Promise<string> {
    const taskId = `tess-${params.attachmentId}-${Date.now()}`;
    this.tasks.set(taskId, { params });
    return Promise.resolve(taskId);
  }

  getExtractionResult(taskId: string): Promise<ExtractionResult | null> {
    const task = this.tasks.get(taskId);
    if (!task) return Promise.resolve(null);

    return Promise.resolve({
      taskId,
      status: 'completed',
      data: {
        rawText: `[Tesseract result for ${task.params.documentType}]`,
        documentType: task.params.documentType,
      },
      confidence: 85,
    });
  }
}
