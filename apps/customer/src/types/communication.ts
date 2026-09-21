// Mirrors AgencyCommunication as returned by /customer-api/communications.
export type CommunicationType = 'OFFER' | 'NOTICE' | 'CAMPAIGN' | 'INFORMATION';
export type CommunicationPlacement = 'CUSTOMER_APP_HOME' | 'CUSTOMER_APP_OFFERS' | 'AGENCY_DASHBOARD';

export interface CustomerCommunication {
  id: string;
  agencyId: string;
  type: CommunicationType;
  title: string;
  body?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  placement: CommunicationPlacement;
  displayPriority: number;
  status: 'ACTIVE';
  createdAt: string;
  updatedAt: string;
}
