export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'FINISHED' | 'CANCELLED';

export interface Campaign {
  id: string;
  agencyId: string;
  name: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  publicationStartsAt?: string;
  publicationEndsAt?: string;
  timezone: string;
  status: CampaignStatus;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}
