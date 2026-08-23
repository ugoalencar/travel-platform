// Mirrors packages/domain/types.ts CommercialOpportunity/CommercialTask/
// CustomerInteraction, as they come back over the wire (JSON has no Date
// type, so date/timestamp fields arrive as ISO strings).

export const COMMERCIAL_STAGES = [
  'PROSPECTING',
  'INTEREST',
  'QUOTE',
  'PROPOSAL_SENT',
  'WAITING_CUSTOMER',
  'NEGOTIATION',
  'WON',
  'POST_SALE',
  'LOST',
] as const;

export type CommercialStage = (typeof COMMERCIAL_STAGES)[number];

export const STAGE_LABELS: Record<CommercialStage, string> = {
  PROSPECTING: 'Prospecção',
  INTEREST: 'Interesse',
  QUOTE: 'Orçamento',
  PROPOSAL_SENT: 'Proposta enviada',
  WAITING_CUSTOMER: 'Aguardando cliente',
  NEGOTIATION: 'Negociação',
  WON: 'Ganho',
  POST_SALE: 'Pós-venda',
  LOST: 'Perdido',
};

export type CommercialTaskType = 'FOLLOW_UP' | 'CALL' | 'POST_SALE' | 'OTHER';
export type InteractionChannel = 'PHONE' | 'WHATSAPP' | 'EMAIL' | 'IN_PERSON' | 'OTHER';
export type InteractionDirection = 'INBOUND' | 'OUTBOUND';

export interface CommercialOpportunity {
  id: string;
  agencyId: string;
  customerId: string;
  wishId?: string;
  proposalId?: string;
  saleId?: string;
  responsibleUserId?: string;
  destination?: string;
  tripDateFrom?: string;
  tripDateTo?: string;
  expectedValue?: number;
  stage: CommercialStage;
  nextActionAt?: string;
  lastInteractionAt?: string;
  lostReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOpportunityInput {
  customerId: string;
  wishId?: string;
  proposalId?: string;
  saleId?: string;
  responsibleUserId?: string;
  destination?: string;
  tripDateFrom?: string;
  tripDateTo?: string;
  expectedValue?: number;
  stage?: CommercialStage;
  nextActionAt?: string;
}

export interface UpdateOpportunityInput {
  stage?: CommercialStage;
  responsibleUserId?: string | null;
  nextActionAt?: string | null;
  lostReason?: string | null;
  expectedValue?: number | null;
  destination?: string | null;
  tripDateFrom?: string | null;
  tripDateTo?: string | null;
}

export interface OpportunityFilters {
  stage?: CommercialStage;
  responsibleUserId?: string;
  customerId?: string;
  destination?: string;
  hasProposal?: boolean;
  hasSale?: boolean;
  hasNextAction?: boolean;
  overdue?: boolean;
}

export interface CommercialTask {
  id: string;
  agencyId: string;
  customerId: string;
  opportunityId?: string;
  assignedUserId: string;
  type: CommercialTaskType;
  title: string;
  dueAt: string;
  completedAt?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface CreateTaskInput {
  customerId: string;
  opportunityId?: string;
  assignedUserId: string;
  type?: CommercialTaskType;
  title: string;
  dueAt: string;
  notes?: string;
}

export interface UpdateTaskInput {
  assignedUserId?: string;
  title?: string;
  dueAt?: string;
  completedAt?: string | null;
  notes?: string | null;
}

export interface TaskFilters {
  customerId?: string;
  assignedUserId?: string;
  pending?: boolean;
  overdue?: boolean;
}

export interface CustomerInteraction {
  id: string;
  agencyId: string;
  customerId: string;
  opportunityId?: string;
  proposalId?: string;
  saleId?: string;
  userId: string;
  channel: InteractionChannel;
  direction: InteractionDirection;
  occurredAt: string;
  summary: string;
  nextActionAt?: string;
  createdAt: string;
}

export interface CreateInteractionInput {
  customerId: string;
  opportunityId?: string;
  proposalId?: string;
  saleId?: string;
  channel: InteractionChannel;
  direction: InteractionDirection;
  occurredAt?: string;
  summary: string;
  nextActionAt?: string;
}

export interface CustomerSearchResult {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpfMasked: string | null;
  passportMasked: string | null;
}

export interface TravelSearchResult {
  operational: Array<{
    bookingId: string;
    customerId: string;
    departureAt: string;
    originDestination: string;
  }>;
  commercial: Array<{
    tripId: string;
    customerId: string;
    destination: string;
    startDate: string;
    endDate: string;
  }>;
}

export interface DashboardSummary {
  openOpportunitiesCount: number;
  followUpsDueTodayCount: number;
  overdueFollowUpsCount: number;
  proposalsWaitingCount: number;
  openProposalValueSum: string;
  salesThisMonthCount: number;
  salesThisMonthTotal: string;
  upcomingTripsCount: number;
  postSalePendingCount: number;
}
