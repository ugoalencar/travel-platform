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
  // Server-joined display name (services/api/src/commercial-cockpit.ts
  // LEFT JOINs customers in listOpportunities). Only present on list reads;
  // absent (e.g. a deleted customer) falls back to customerId in the UI.
  customerName?: string;
  wishId?: string;
  proposalId?: string;
  saleId?: string;
  responsibleUserId?: string;
  destination?: string;
  tripDateFrom?: string;
  tripDateTo?: string;
  expectedValue?: number;
  // DEPRECATED: retained as a read-only historical artifact only (see
  // migration 009_configurable_pipelines.sql). Never written to.
  stage: CommercialStage;
  pipelineId: string;
  stageId: string;
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
  pipelineId: string;
  stageId: string;
  nextActionAt?: string;
}

export interface UpdateOpportunityInput {
  stageId?: string;
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
  pipelineId?: string;
  stageId?: string;
  responsibleUserId?: string;
  customerId?: string;
  destination?: string;
  hasProposal?: boolean;
  hasSale?: boolean;
  hasNextAction?: boolean;
  overdue?: boolean;
}

// ============================================================
// CONFIGURABLE MULTI-PIPELINE (migration 009_configurable_pipelines.sql)
// ============================================================

export const PIPELINE_STAGE_COLORS = [
  'NEUTRAL',
  'BLUE',
  'YELLOW',
  'ORANGE',
  'RED',
  'GREEN',
  'PURPLE',
] as const;
export type PipelineStageColor = (typeof PIPELINE_STAGE_COLORS)[number];

// Fixed token -> CSS class mapping. Never render an arbitrary CSS string
// from the server -- only these seven admin-chosen tokens exist.
export const STAGE_COLOR_CLASSES: Record<PipelineStageColor, string> = {
  NEUTRAL: 'bg-slate-100 text-slate-700 border-slate-300',
  BLUE: 'bg-blue-100 text-blue-700 border-blue-300',
  YELLOW: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  ORANGE: 'bg-orange-100 text-orange-800 border-orange-300',
  RED: 'bg-red-100 text-red-700 border-red-300',
  GREEN: 'bg-green-100 text-green-700 border-green-300',
  PURPLE: 'bg-purple-100 text-purple-700 border-purple-300',
};

export type PipelineStageVisualLevel = 'NORMAL' | 'ATTENTION' | 'SUCCESS';

export interface Pipeline {
  id: string;
  agencyId: string;
  name: string;
  description?: string;
  active: boolean;
  notificationsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineStage {
  id: string;
  agencyId: string;
  pipelineId: string;
  name: string;
  sequence: number;
  colorKey: PipelineStageColor;
  visualLevel: PipelineStageVisualLevel;
  active: boolean;
  notificationsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineAccess {
  id: string;
  agencyId: string;
  pipelineId: string;
  userId: string;
  createdAt: string;
}

export interface CreatePipelineInput {
  name: string;
  description?: string;
  notificationsEnabled?: boolean;
}

export interface UpdatePipelineInput {
  name?: string;
  description?: string | null;
  active?: boolean;
  notificationsEnabled?: boolean;
}

export interface CreateStageInput {
  name: string;
  sequence: number;
  colorKey: PipelineStageColor;
  visualLevel?: PipelineStageVisualLevel;
  notificationsEnabled?: boolean;
}

export interface UpdateStageInput {
  name?: string;
  sequence?: number;
  colorKey?: PipelineStageColor;
  visualLevel?: PipelineStageVisualLevel;
  active?: boolean;
  notificationsEnabled?: boolean;
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
  sentProposalsCount: number;
  acceptedProposalsCount: number;
  openProposalValueSum: string;
  salesThisMonthCount: number;
  salesThisMonthTotal: string;
  pendingSalesCount: number;
  confirmedSalesCount: number;
  paidSalesCount: number;
  overdueReceivablesCount: number;
  cancelledBookingsCount: number;
  pescadorReviewQueueCount: number;
  upcomingTripsCount: number;
  postSalePendingCount: number;
}
