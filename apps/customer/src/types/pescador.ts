export type ExternalOfferCaptureStatus =
  | 'CAPTURED'
  | 'NORMALIZED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PUBLISHED';

export interface ExternalOfferCapture {
  id: string;
  agencyId: string;
  sourceUrl: string;
  sourceName: string;
  capturedAt: string;
  rawContent: string;
  normalizedTitle?: string;
  normalizedDescription?: string;
  foundPrice?: number;
  currency?: string;
  validUntil?: string;
  status: ExternalOfferCaptureStatus;
  reviewedAt?: string;
  reviewedByUserId?: string;
  publishedOfferId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExternalOfferCaptureInput {
  sourceUrl: string;
  sourceName: string;
  rawContent: string;
  normalizedTitle?: string;
  normalizedDescription?: string;
  foundPrice?: number;
  currency?: string;
  validUntil?: string;
}
