// ============================================================
// TENANT CONTEXT TYPES
// REGRA: USER -> AGENCY -> RESOURCE
// Nunca: USER -> RESOURCE
// ============================================================

export interface TenantContext {
  agencyId: string;
  userId: string;
  userRole: UserRole;
  email: string;
  // Optional: set only by the customer-portal auth path
  // (establishCustomerTenantContext in tenant-context.ts). Undefined for
  // every existing staff/admin request. Never read this field directly --
  // use getCustomerId() (throws if unset), mirroring getUserId().
  customerId?: string;
}

export interface Agency {
  id: string;
  name: string;
  slug: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  address?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  plan: Plan;
  status: Status;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  agencyId: string;
  email: string;
  name: string;
  role: UserRole;
  status: Status;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Broker {
  id: string;
  agencyId: string;
  name: string;
  email: string;
  phone?: string;
  commission: number;
  status: Status;
  createdAt: Date;
  updatedAt: Date;
}

export interface Customer {
  id: string;
  agencyId: string;
  name: string;
  email?: string;
  phone?: string;
  cpf?: string;
  passport?: string;
  address?: Record<string, unknown>;
  notes?: string;
  status: Status;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerAccount {
  id: string;
  agencyId: string;
  customerId: string;
  email: string;
  passwordHash: string;
  status: CustomerAccountStatus;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Wish {
  id: string;
  agencyId: string;
  customerId: string;
  destination?: string;
  startDate?: Date;
  endDate?: Date;
  budget?: number;
  travelersCount?: number;
  notes?: string;
  status: WishStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Offer {
  id: string;
  agencyId: string;
  name: string;
  description?: string;
  price: number;
  validFrom?: Date;
  validUntil?: Date;
  status: OfferStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Proposal {
  id: string;
  agencyId: string;
  customerId: string;
  offerId?: string;
  wishId?: string;
  userId?: string;
  proposedPrice: number;
  discount: number;
  total: number;
  validUntil?: Date;
  conditions?: string;
  notes?: string;
  status: ProposalStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Sale {
  id: string;
  agencyId: string;
  customerId: string;
  proposalId?: string;
  brokerId?: string;
  userId: string;
  amount: number;
  discount: number;
  total: number;
  status: SaleStatus;
  notes?: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Commission {
  id: string;
  agencyId: string;
  saleId: string;
  brokerId?: string;
  userId?: string;
  amount: number;
  percentage?: number;
  status: CommissionStatus;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Trip {
  id: string;
  agencyId: string;
  customerId: string;
  saleId?: string;
  name: string;
  destination: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  status: TripStatus;
  notes?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// ENUMS
// ============================================================

export enum Plan {
  FREE = 'FREE',
  BASIC = 'BASIC',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
}

export enum Status {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  AGENT = 'AGENT',
  VIEWER = 'VIEWER',
}

export enum CustomerAccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  LOCKED = 'LOCKED',
}

export enum WishStatus {
  ACTIVE = 'ACTIVE',
  MATCHED = 'MATCHED',
  PROPOSED = 'PROPOSED',
  FULFILLED = 'FULFILLED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum OfferStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  EXPIRED = 'EXPIRED',
}

export enum ProposalStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum SaleStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum CommissionStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

export enum TripStatus {
  PLANNED = 'PLANNED',
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

// ============================================================
// TRANSPORTATION DOMAIN
// ============================================================

export interface Route {
  id: string;
  agencyId: string;
  origin: string;
  destination: string;
  estimatedDuration?: number;
  distance?: number;
  notes?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Supplier {
  id: string;
  agencyId: string;
  name: string;
  document?: string;
  contact?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransportProduct {
  id: string;
  agencyId: string;
  name: string;
  tripType: TripType;
  outboundRouteId: string;
  returnRouteId?: string;
  price: number;
  active: boolean;
  publiclyBookable: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduledDeparture {
  id: string;
  agencyId: string;
  productId: string;
  departureAt: Date;
  arrivalExpectedAt?: Date;
  capacity: number;
  supplierId?: string;
  serviceType: DepartureServiceType;
  // No Booking table exists yet; nothing consumes capacity. This is a
  // stub, not a real derived value: availableSeats === capacity until
  // Booking integration exists (see 003_transportation.sql / brief).
  cancelled: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum TripType {
  ONE_WAY = 'ONE_WAY',
  ROUND_TRIP = 'ROUND_TRIP',
}

export enum DepartureServiceType {
  OWN = 'OWN',
  SUBCONTRACTED = 'SUBCONTRACTED',
  RESELL = 'RESELL',
}

// RoutePoint: an ordered itinerary point on a Route. Check-in is
// OPTIONAL PER POINT (checkpointRequired), not a global rule.
//  - checkpointRequired = false: itinerary-only, no operational
//    obligation, no pending item, no schedule-compliance calculation.
//  - checkpointRequired = true: enters operational monitoring; a
//    future Operation entity (not built here) would generate a
//    corresponding checkpoint for a driver/guide to confirm.
// plannedOffsetMinutes is minutes after a ScheduledDeparture's
// departureAt (NOT an absolute timestamp); expected-absolute-time is
// a future derivation (departureAt + plannedOffsetMinutes), not
// persisted anywhere in this scope.
// Route's origin/destination strings are unchanged; by convention the
// first/last RoutePoint in sequence typically correspond to them, but
// there is no enforced sync and no "origin RoutePoint" subtype.
export interface RoutePoint {
  id: string;
  agencyId: string;
  routeId: string;
  sequence: number;
  name: string;
  checkpointRequired: boolean;
  checkpointType?: CheckpointType;
  plannedOffsetMinutes?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum CheckpointType {
  ARRIVAL = 'ARRIVAL',
  DEPARTURE = 'DEPARTURE',
  BOTH = 'BOTH',
}

// Booking: the operational reservation. Booking != Sale -- Sale (not
// present in this branch) owns pricing/discount/tax/currency/payment;
// none of that is modeled here. bookerCustomerId is who owns the
// reservation and is NOT necessarily traveling; passengers are a
// separate concept (BookingPassenger), not Customer records.
// No approved cancellation/refund/no-show workflow exists; `cancelled`
// is a single boolean (mirrors ScheduledDeparture.cancelled) meaning
// only "does not consume capacity" -- no other business meaning.
export interface Booking {
  id: string;
  agencyId: string;
  bookerCustomerId: string;
  tripType: TripType;
  outboundDepartureId: string;
  returnDepartureId?: string;
  cancelled: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Minimal passenger identity only -- NOT a Customer, no FK to
// customers, no document/manifest fields beyond an optional free-text
// note (explicit instruction not to over-model passenger data).
export interface BookingPassenger {
  id: string;
  agencyId: string;
  bookingId: string;
  name: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// FIELD OPERATIONS DOMAIN
// ============================================================
// TransportOperation = EXECUTION marker for a ScheduledDeparture
// (which remains the PLAN). At most one Operation per Departure.
// OperationCheckpoint rows hang off it. See
// 006_field_operations.sql for the full scope-decision notes.
export interface TransportOperation {
  id: string;
  agencyId: string;
  departureId: string;
  createdAt: Date;
  updatedAt: Date;
}

// OperationCheckpoint: EXECUTION record generated (one per monitored
// RoutePoint, i.e. checkpointRequired = true) when a
// TransportOperation is created. checkpointType is snapshotted from
// the RoutePoint at generation time. arrivalCheckedAt/
// departureCheckedAt are separate, real timestamps set only by a
// server-side confirmation action -- never client-supplied, never
// pre-filled/defaulted to an expected time. expectedAt and delay are
// NOT part of this persisted shape -- they are derived on read by the
// API layer and attached to the API response type
// (OperationCheckpointWithExpected below), never stored.
export interface OperationCheckpoint {
  id: string;
  agencyId: string;
  operationId: string;
  routePointId: string;
  checkpointType: CheckpointType;
  arrivalCheckedAt?: Date;
  departureCheckedAt?: Date;
  notes?: string;
  location?: string;
  createdAt: Date;
  updatedAt: Date;
}

// API-response shape for a checkpoint including its derived
// expectedAt (departure.departureAt + routePoint.plannedOffsetMinutes),
// computed at read time and never persisted.
export interface OperationCheckpointWithExpected extends OperationCheckpoint {
  expectedAt?: Date;
}

// ============================================================
// COMMERCIAL COCKPIT (migration 007_commercial_cockpit.sql)
// Additive-only. CommercialOpportunity.stage is a separate, independent
// mutable lifecycle -- never derived from or written back to
// Wish.status / Proposal.status / Sale.status.
// ============================================================

export enum CommercialStage {
  PROSPECTING = 'PROSPECTING',
  INTEREST = 'INTEREST',
  QUOTE = 'QUOTE',
  PROPOSAL_SENT = 'PROPOSAL_SENT',
  WAITING_CUSTOMER = 'WAITING_CUSTOMER',
  NEGOTIATION = 'NEGOTIATION',
  WON = 'WON',
  POST_SALE = 'POST_SALE',
  LOST = 'LOST',
}

export const CLOSED_COMMERCIAL_STAGES: readonly CommercialStage[] = [
  CommercialStage.WON,
  CommercialStage.LOST,
];

export enum CommercialTaskType {
  FOLLOW_UP = 'FOLLOW_UP',
  CALL = 'CALL',
  POST_SALE = 'POST_SALE',
  OTHER = 'OTHER',
}

export enum InteractionChannel {
  PHONE = 'PHONE',
  WHATSAPP = 'WHATSAPP',
  EMAIL = 'EMAIL',
  IN_PERSON = 'IN_PERSON',
  OTHER = 'OTHER',
}

export enum InteractionDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

export interface CommercialOpportunity {
  id: string;
  agencyId: string;
  customerId: string;
  wishId?: string;
  proposalId?: string;
  saleId?: string;
  responsibleUserId?: string;
  destination?: string;
  tripDateFrom?: Date;
  tripDateTo?: Date;
  expectedValue?: number;
  // DEPRECATED: retained only as a read-only historical artifact after
  // migration 008_configurable_pipelines.sql moved the live lifecycle to
  // pipelineId/stageId. Never written to by any route after 008. See that
  // migration's header comment for the "keep vs drop" rationale.
  stage: CommercialStage;
  pipelineId: string;
  stageId: string;
  nextActionAt?: Date;
  lastInteractionAt?: Date;
  lostReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// CONFIGURABLE MULTI-PIPELINE (migration 008_configurable_pipelines.sql)
// ============================================================

export enum PipelineStageColor {
  NEUTRAL = 'NEUTRAL',
  BLUE = 'BLUE',
  YELLOW = 'YELLOW',
  ORANGE = 'ORANGE',
  RED = 'RED',
  GREEN = 'GREEN',
  PURPLE = 'PURPLE',
}

export enum PipelineStageVisualLevel {
  NORMAL = 'NORMAL',
  ATTENTION = 'ATTENTION',
  SUCCESS = 'SUCCESS',
}

export interface Pipeline {
  id: string;
  agencyId: string;
  name: string;
  description?: string;
  active: boolean;
  notificationsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
}

// Grants a specific user explicit visibility into a specific pipeline.
// DEFAULT-OPEN-UNTIL-RESTRICTED: a pipeline with ZERO PipelineAccess rows
// is visible to every agency staff member (OWNER/ADMIN always see every
// pipeline regardless of grants). Once at least one PipelineAccess row
// exists for a pipeline, only OWNER/ADMIN plus the explicitly granted
// userIds may see it. See services/api/src/pipeline-config.ts
// resolveVisiblePipelineAccess() for the enforcement point.
export interface PipelineAccess {
  id: string;
  agencyId: string;
  pipelineId: string;
  userId: string;
  createdAt: Date;
}

export interface CommercialTask {
  id: string;
  agencyId: string;
  customerId: string;
  opportunityId?: string;
  assignedUserId: string;
  type: CommercialTaskType;
  title: string;
  dueAt: Date;
  completedAt?: Date;
  notes?: string;
  createdBy: string;
  createdAt: Date;
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
  occurredAt: Date;
  summary: string;
  nextActionAt?: Date;
  createdAt: Date;
}

// ============================================================
// TENANT-SCOPED QUERY TYPES
// ============================================================

export type TenantScoped<T> = T & { agencyId: string };

export type CreateInput<T> = Omit<T, 'id' | 'agencyId' | 'createdAt' | 'updatedAt'>;
export type UpdateInput<T> = Partial<
  Omit<T, 'id' | 'agencyId' | 'createdAt' | 'updatedAt'>
>;
