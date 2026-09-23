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
  // Optional: set only by the partner-portal auth path
  // (establishPartnerTenantContext in tenant-context.ts). Undefined for
  // every existing staff/admin/customer request. Never read this field
  // directly -- use getPartnerId() (throws if unset), mirroring
  // getCustomerId().
  partnerId?: string;
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
  /** Human-readable registration reference, e.g. "CLI-2026-000123"
   * (068_protocol_numbers.sql) -- generated once at creation, never
   * reused, distinct from the internal UUID id. */
  protocolNumber: string;
  name: string;
  email?: string;
  phone?: string;
  cpf?: string;
  passport?: string;
  rg?: string;
  nationalIdType?: string;
  birthDate?: Date;
  nationality?: string;
  whatsapp?: string;
  socialName?: string;
  maritalStatus?: string;
  profession?: string;
  idIssuingAuthority?: string;
  idIssuedDate?: Date;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  emergencyContactWhatsapp?: string;
  emergencyContactEmail?: string;
  emergencyContactNotes?: string;
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
  /** Destacada no carrossel do Agency Dashboard */
  featured: boolean;
  /** Visível no Customer App */
  showOnCustomerApp: boolean;
  /** Segmento de clientes elegível (null = todos) */
  targetSegmentId?: string;
  /** Prioridade de exibição (maior = primeiro) */
  displayPriority: number;
  /** URL da imagem para exibição (fallback manual -- ver coverMediaAssetId) */
  imageUrl?: string;
  /** Asset da Media Library selecionado como capa; tem precedência sobre imageUrl quando presente */
  coverMediaAssetId?: string;
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
  // Proposal Visual 2.0 -- cover/summary fields. Cover image lives in
  // ProposalMedia (is_cover = true), not here.
  title?: string;
  subtitle?: string;
  destinationSummary?: string;
  travelPeriod?: string;
  travelerSummary?: string;
  introText?: string;
  // Set once, the first time the proposal is sent. Minimal immutability
  // marker -- see docs/product/PROPOSAL_VISUAL_2.md.
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export enum ProposalSectionType {
  OVERVIEW = 'OVERVIEW',
  DESTINATIONS = 'DESTINATIONS',
  TRANSPORT = 'TRANSPORT',
  ACCOMMODATION = 'ACCOMMODATION',
  EXPERIENCES = 'EXPERIENCES',
  ITINERARY = 'ITINERARY',
  INCLUSIONS = 'INCLUSIONS',
  EXCLUSIONS = 'EXCLUSIONS',
  COMMERCIAL_TERMS = 'COMMERCIAL_TERMS',
  PAYMENT_OPTIONS = 'PAYMENT_OPTIONS',
  MEDIA = 'MEDIA',
  DOCUMENTS = 'DOCUMENTS',
  NOTES = 'NOTES',
}

export interface ProposalSection {
  id: string;
  agencyId: string;
  proposalId: string;
  type: ProposalSectionType;
  title: string;
  description?: string;
  sortOrder: number;
  isVisibleToCustomer: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export enum ProposalItemType {
  TEXT = 'TEXT',
  DESTINATION = 'DESTINATION',
  TRANSPORT = 'TRANSPORT',
  ACCOMMODATION = 'ACCOMMODATION',
  EXPERIENCE = 'EXPERIENCE',
  ITINERARY_DAY = 'ITINERARY_DAY',
  INCLUSION = 'INCLUSION',
  EXCLUSION = 'EXCLUSION',
  CONDITION = 'CONDITION',
  PAYMENT_OPTION = 'PAYMENT_OPTION',
  IMAGE = 'IMAGE',
}

export interface ProposalItem {
  id: string;
  agencyId: string;
  proposalSectionId: string;
  type: ProposalItemType;
  title?: string;
  description?: string;
  sortOrder: number;
  dayNumber?: number;
  locationName?: string;
  price?: number;
  referenceType?: string;
  referenceId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Media Library -- central, agency-owned asset library. Supersedes
// Proposal Visual 2.0's ProposalMedia (which was per-proposal-only).
// See docs/product/MEDIA_LIBRARY.md.
// ============================================================

export enum MediaAssetType {
  IMAGE = 'IMAGE',
}

export enum MediaAssetStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum MediaAssetSource {
  UPLOAD = 'UPLOAD',
}

export enum MediaAssetUsageContext {
  OFFER = 'OFFER',
  PROPOSAL = 'PROPOSAL',
  COMMUNICATION = 'COMMUNICATION',
}

export enum MediaAssetUsageKind {
  COVER = 'COVER',
  GALLERY = 'GALLERY',
}

export interface MediaAsset {
  id: string;
  agencyId: string;
  title: string;
  description?: string;
  assetType: MediaAssetType;
  mimeType: string;
  fileSizeBytes: number;
  secureFileKey: string;
  width?: number;
  height?: number;
  altText?: string;
  tags: string[];
  status: MediaAssetStatus;
  source: MediaAssetSource;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date;
}

export interface MediaAssetLink {
  id: string;
  agencyId: string;
  mediaAssetId: string;
  entityType: MediaAssetUsageContext;
  entityId: string;
  usage: MediaAssetUsageKind;
  sortOrder: number;
  createdAt: Date;
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

// ============================================================
// SALE ITEMS / PROPOSAL OPTIONAL ITEMS / UPSELL ("Turbine sua Viagem")
// Agent 08. See services/api/src/sale-items.ts for the financial
// integration rationale (own line-level subtotal, no parallel formula
// for the Sale/Proposal authoritative total or the Sale margin calc).
// ============================================================

export type SaleItemStatus = 'ACTIVE' | 'CANCELLED';
export type LineItemSource = 'MANUAL' | 'UPSELL_SUGGESTION';

export interface SaleItem {
  id: string;
  agencyId: string;
  saleId: string;
  productId?: string;
  description: string;
  supplierId?: string;
  travelers: unknown[];
  qty: number;
  unitCost: number;
  unitPrice: number;
  taxes: number;
  fees: number;
  discount: number;
  commission: number;
  lineTotal: number;
  lineMargin: number;
  currency: string;
  status: SaleItemStatus;
  source: LineItemSource;
  payableId?: string;
  createdByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ProposalOptionalItemStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';

export interface ProposalOptionalItem {
  id: string;
  agencyId: string;
  proposalId: string;
  productId?: string;
  description: string;
  supplierId?: string;
  travelers: unknown[];
  qty: number;
  unitCost: number;
  unitPrice: number;
  taxes: number;
  fees: number;
  discount: number;
  commission: number;
  lineTotal: number;
  currency: string;
  status: ProposalOptionalItemStatus;
  source: LineItemSource;
  createdByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type UpsellConditionType =
  | 'DESTINATION_MATCHES'
  | 'INTERNATIONAL_TRIP'
  | 'HAS_MINOR_TRAVELER'
  | 'NO_INSURANCE_ITEM'
  | 'ACTIVE_CAMPAIGN';

export interface UpsellRule {
  id: string;
  agencyId: string;
  name: string;
  conditionType: UpsellConditionType;
  conditionValue?: string;
  suggestedDescription: string;
  suggestedProductId?: string;
  suggestedUnitPrice: number;
  suggestedUnitCost: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type UpsellSuggestionStatus = 'PENDING' | 'ACCEPTED' | 'DISMISSED';

export interface UpsellSuggestion {
  id: string;
  agencyId: string;
  ruleId?: string;
  saleId?: string;
  proposalId?: string;
  description: string;
  suggestedUnitPrice: number;
  suggestedUnitCost: number;
  status: UpsellSuggestionStatus;
  resultingSaleItemId?: string;
  resultingProposalOptionalItemId?: string;
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

export enum PlatformUserRole {
  PLATFORM_OWNER = 'PLATFORM_OWNER',
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  SUPPORT_ADMIN = 'SUPPORT_ADMIN',
  BILLING_ADMIN = 'BILLING_ADMIN',
  MARKETING_ADMIN = 'MARKETING_ADMIN',
  READ_ONLY_AUDITOR = 'READ_ONLY_AUDITOR',
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

export enum FinancialObligationStatus {
  OPEN = 'OPEN',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

export enum PaymentDirection {
  IN = 'IN',
  OUT = 'OUT',
}

export interface Receivable {
  id: string;
  agencyId: string;
  saleId?: string;
  customerId: string;
  description: string;
  amount: number;
  /** Sum of payment_allocations applied to this receivable so far. */
  paidAmount: number;
  /** amount - paidAmount; the outstanding balance still owed. */
  remainingAmount: number;
  dueAt: Date;
  status: FinancialObligationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export enum PayableBeneficiaryType {
  SUPPLIER = 'SUPPLIER',
  EMPLOYEE = 'EMPLOYEE',
  OTHER = 'OTHER',
}

export interface Payable {
  id: string;
  agencyId: string;
  saleId?: string;
  supplierId?: string;
  commissionId?: string;
  transportOperationId?: string;
  operationalCostId?: string;
  categoryId?: string;
  costCenterId?: string;
  description: string;
  amount: number;
  dueAt: Date;
  status: FinancialObligationStatus;
  beneficiaryType?: PayableBeneficiaryType;
  employeeId?: string;
  commissionEntryId?: string;
  payrollEntryId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  agencyId: string;
  direction: PaymentDirection;
  amount: number;
  occurredAt: Date;
  method?: string;
  reference?: string;
  notes?: string;
  createdBy: string;
  createdAt: Date;
}

export interface PaymentAllocation {
  id: string;
  agencyId: string;
  paymentId: string;
  receivableId?: string;
  payableId?: string;
  amount: number;
  createdAt: Date;
}

export interface OperationalCost {
  id: string;
  agencyId: string;
  saleId?: string;
  transportOperationId?: string;
  supplierId?: string;
  description: string;
  costType: string;
  expectedAmount?: number;
  actualAmount?: number;
  incurredAt: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum FinancialCategoryType {
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

export interface FinancialCategory {
  id: string;
  agencyId: string;
  name: string;
  type: FinancialCategoryType;
  description: string | undefined;
  parentCategoryId: string | undefined;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CostCenter {
  id: string;
  agencyId: string;
  name: string;
  code: string | undefined;
  description: string | undefined;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export enum CommissionCalculationType {
  PERCENT_SALE = 'PERCENT_SALE',
  PERCENT_MARGIN = 'PERCENT_MARGIN',
  FIXED = 'FIXED',
  PRODUCT = 'PRODUCT',
  DESTINATION = 'DESTINATION',
  TIERED_TARGET = 'TIERED_TARGET',
}

export interface CommissionPlan {
  id: string;
  agencyId: string;
  name: string;
  calculationType: CommissionCalculationType;
  percentage: number | undefined;
  fixedAmount: number | undefined;
  rules: Record<string, unknown> | undefined;
  active: boolean;
  validFrom: Date | undefined;
  validUntil: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export enum EmploymentType {
  EMPLOYEE = 'EMPLOYEE',
  CONTRACTOR = 'CONTRACTOR',
  PARTNER = 'PARTNER',
  FREELANCER = 'FREELANCER',
  OTHER = 'OTHER',
}

export enum EmployeeStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ON_LEAVE = 'ON_LEAVE',
  TERMINATED = 'TERMINATED',
}

export interface Employee {
  id: string;
  agencyId: string;
  name: string;
  cpf: string | undefined;
  rg: string | undefined;
  birthDate: Date | undefined;
  addressLine: string | undefined;
  addressCity: string | undefined;
  addressState: string | undefined;
  addressZipCode: string | undefined;
  phone: string | undefined;
  email: string | undefined;
  hireDate: Date | undefined;
  terminationDate: Date | undefined;
  employmentType: EmploymentType;
  roleTitle: string | undefined;
  department: string | undefined;
  costCenterId: string | undefined;
  managerId: string | undefined;
  status: EmployeeStatus;
  baseSalary: number | undefined;
  bankName: string | undefined;
  bankBranch: string | undefined;
  bankAccount: string | undefined;
  bankPixKey: string | undefined;
  notes: string | undefined;
  userId: string | undefined;
  defaultCommissionPlanId: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export enum CommissionEntryStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PAYABLE = 'PAYABLE',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

export interface CommissionEntry {
  id: string;
  agencyId: string;
  employeeId: string;
  saleId: string;
  tripId: string | undefined;
  // Exactly one of commissionPlanId (legacy, global-plan path) or
  // commissionRuleId+productType (per-employee-per-product path) is set
  // -- enforced by commission_entries_lineage_check (080 migration).
  commissionPlanId: string | undefined;
  commissionRuleId: string | undefined;
  productType: EmployeeCommissionProductType | undefined;
  sourceItemId: string | undefined;
  sourceItemType: string | undefined;
  quantity: number | undefined;
  calculationBase: number;
  rate: number | undefined;
  amount: number;
  status: CommissionEntryStatus;
  approvedAt: Date | undefined;
  approvedBy: string | undefined;
  paidAt: Date | undefined;
  notes: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Employee Commission Rules (Comissionamento por Funcionário e Produto)
// -- evolves the commission domain above (CommissionPlan/CommissionEntry)
// to support per-employee, per-product-type rules. Deliberately a
// separate, narrower concept from CommissionPlan (which stays as-is for
// broad/global plans) -- see docs/product/COMISSIONAMENTO_FUNCIONARIOS.md
// "Estado atual" for the full audit of why this isn't a rename/reuse of
// an existing type.
// ============================================================

export enum EmployeeCommissionProductType {
  AIR = 'AIR',
  EXCURSION = 'EXCURSION',
  LAND = 'LAND',
  INSURANCE = 'INSURANCE',
  PACKAGE = 'PACKAGE',
  HOTEL = 'HOTEL',
  TRANSFER = 'TRANSFER',
}

export enum EmployeeCommissionCalculationType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
}

export enum EmployeeCommissionBasis {
  PRODUCT_TOTAL = 'PRODUCT_TOTAL',
  PACKAGE_TOTAL = 'PACKAGE_TOTAL',
  PER_PASSENGER = 'PER_PASSENGER',
  PER_TICKET = 'PER_TICKET',
  FIXED_PER_PASSENGER = 'FIXED_PER_PASSENGER',
  FIXED_PER_TICKET = 'FIXED_PER_TICKET',
  FIXED_PER_SALE = 'FIXED_PER_SALE',
}

export enum EmployeeCommissionRuleStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export interface EmployeeCommissionRule {
  id: string;
  agencyId: string;
  employeeId: string;
  productType: EmployeeCommissionProductType;
  calculationType: EmployeeCommissionCalculationType;
  calculationBasis: EmployeeCommissionBasis;
  percentageRate: number | undefined;
  fixedAmount: number | undefined;
  currency: string;
  validFrom: Date | undefined;
  validUntil: Date | undefined;
  status: EmployeeCommissionRuleStatus;
  createdByUserId: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// CUSTOMER SEGMENTATION -- saved filter RULES, never a frozen member
// list. Membership is always recomputed at read time by
// services/api/src/customer-segmentation.ts.
// ============================================================

export type CustomerSegmentScope = 'PERSONAL' | 'SHARED';

export interface CustomerSegment {
  id: string;
  agencyId: string;
  name: string;
  description: string | undefined;
  scope: CustomerSegmentScope;
  ownerEmployeeId: string | undefined;
  isShared: boolean;
  filterDefinition: unknown;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | undefined;
}

export enum EmployeeDeductionType {
  ADVANCE = 'ADVANCE',
  ABSENCE = 'ABSENCE',
  BENEFIT = 'BENEFIT',
  LOAN = 'LOAN',
  ADJUSTMENT = 'ADJUSTMENT',
  OTHER = 'OTHER',
}

export interface EmployeeDeduction {
  id: string;
  agencyId: string;
  employeeId: string;
  competence: Date;
  type: EmployeeDeductionType;
  description: string | undefined;
  amount: number;
  notes: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export enum PayrollEntryStatus {
  OPEN = 'OPEN',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

export interface PayrollEntry {
  id: string;
  agencyId: string;
  employeeId: string;
  competence: Date;
  baseSalary: number;
  benefits: number;
  bonuses: number;
  commissionsTotal: number;
  reimbursements: number;
  additions: number;
  discountsTotal: number;
  netAmount: number;
  status: PayrollEntryStatus;
  dueDate: Date | undefined;
  paidAt: Date | undefined;
  notes: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export enum RevenueStatus {
  OPEN = 'OPEN',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

export interface Revenue {
  id: string;
  agencyId: string;
  saleId: string | undefined;
  bookingId: string | undefined;
  customerId: string;
  categoryId: string;
  description: string;
  amount: number;
  currency: string;
  competencyDate: Date;
  dueDate: Date;
  receiptDate: Date | undefined;
  paymentMethod: string | undefined;
  status: RevenueStatus;
  notes: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export enum ExpenseStatus {
  OPEN = 'OPEN',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

export interface Expense {
  id: string;
  agencyId: string;
  supplierId: string | undefined;
  categoryId: string;
  costCenterId: string | undefined;
  description: string;
  amount: number;
  currency: string;
  incurredAt: Date;
  dueDate: Date;
  paymentDate: Date | undefined;
  paymentMethod: string | undefined;
  status: ExpenseStatus;
  recurrence: string | undefined;
  notes: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export enum CashTransactionType {
  ENTRY = 'ENTRY',
  EXIT = 'EXIT',
  ADJUSTMENT = 'ADJUSTMENT',
}

export interface CashTransaction {
  id: string;
  agencyId: string;
  type: CashTransactionType;
  amount: number;
  occurringAt: Date;
  origin: string;
  relatedRecordId: string | undefined;
  relatedRecordType: string | undefined;
  calculatedBalance: number;
  notes: string | undefined;
  createdAt: Date;
}

export enum ReconciliationStatus {
  RECONCILED = 'RECONCILED',
  NOT_RECONCILED = 'NOT_RECONCILED',
}

export interface Reconciliation {
  id: string;
  agencyId: string;
  reconciliationDate: Date;
  expectedAmount: number;
  actualAmount: number;
  status: ReconciliationStatus;
  paymentId: string | undefined;
  notes: string | undefined;
  createdAt: Date;
  updatedAt: Date;
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

export enum SupplierType {
  TRAVEL = 'TRAVEL',
  OPERATIONAL = 'OPERATIONAL',
  BOTH = 'BOTH',
}

export enum SupplierCategory {
  AIRLINE = 'AIRLINE',
  CONSOLIDATOR = 'CONSOLIDATOR',
  HOTEL = 'HOTEL',
  RESORT = 'RESORT',
  TOUR_OPERATOR = 'TOUR_OPERATOR',
  TRANSFER = 'TRANSFER',
  CAR_RENTAL = 'CAR_RENTAL',
  TRAVEL_INSURANCE = 'TRAVEL_INSURANCE',
  TOUR = 'TOUR',
  GUIDE = 'GUIDE',
  CRUISE = 'CRUISE',
  TRAIN = 'TRAIN',
  BUS = 'BUS',
  TICKET_PROVIDER = 'TICKET_PROVIDER',
  RECEPTIVE_OPERATOR = 'RECEPTIVE_OPERATOR',
  RENT = 'RENT',
  ELECTRICITY = 'ELECTRICITY',
  WATER = 'WATER',
  INTERNET = 'INTERNET',
  PHONE = 'PHONE',
  SOFTWARE = 'SOFTWARE',
  ACCOUNTING = 'ACCOUNTING',
  LEGAL = 'LEGAL',
  MARKETING = 'MARKETING',
  OFFICE = 'OFFICE',
  CLEANING = 'CLEANING',
  MAINTENANCE = 'MAINTENANCE',
  EQUIPMENT = 'EQUIPMENT',
  BANKING = 'BANKING',
  INSURANCE = 'INSURANCE',
  OTHER = 'OTHER',
}

export interface Supplier {
  id: string;
  agencyId: string;
  name: string;
  tradeName?: string;
  document?: string;
  contact?: string;
  supplierType: SupplierType;
  email?: string;
  phone?: string;
  website?: string;
  addressLine?: string;
  addressCity?: string;
  addressState?: string;
  addressZip?: string;
  addressCountry?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccount?: string;
  bankPix?: string;
  paymentTerms?: string;
  notes?: string;
  active: boolean;
  categories: SupplierCategory[];
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// TRAVEL PRODUCT CATALOG DOMAIN
// ============================================================
// Separate from Offer (current sales opportunity) and Supplier (supplier
// master data). A TravelProduct is a reusable, categorized product
// definition that Offers/SaleItems can reference. "Produto é separado de
// campanha."

export enum TravelProductCategory {
  INSURANCE = 'INSURANCE',
  TOUR = 'TOUR',
  EXPERIENCE = 'EXPERIENCE',
  TICKET = 'TICKET',
  TRANSFER = 'TRANSFER',
  CAR_RENTAL = 'CAR_RENTAL',
  ESIM = 'ESIM',
  LOUNGE = 'LOUNGE',
  BAGGAGE = 'BAGGAGE',
  SEAT = 'SEAT',
  HOTEL = 'HOTEL',
  CRUISE = 'CRUISE',
  TRAIN = 'TRAIN',
  BUS = 'BUS',
  GUIDE = 'GUIDE',
  EVENT = 'EVENT',
  FOOD = 'FOOD',
  CONCIERGE = 'CONCIERGE',
  OTHER = 'OTHER',
}

export interface TravelProduct {
  id: string;
  agencyId: string;
  category: TravelProductCategory;
  title: string;
  cost: number;
  price: number;
  currency: string;
  active: boolean;
  standalone: boolean;
  proposalEligible: boolean;
  portalVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
  supplierId?: string;
  /** Future FK to CommercialPartner (Agent 04, not yet landed in this worktree). */
  partnerId?: string;
  description?: string;
  destination?: string;
  durationText?: string;
  rules?: string;
  inclusions?: string;
  exclusions?: string;
  minAge?: number;
  maxAge?: number;
  capacity?: number;
  bookingDeadlineDays?: number;
  cancellationPolicy?: string;
  markupPercent?: number;
  commissionPercent?: number;
  /**
   * Plain ISO calendar dates ("YYYY-MM-DD"), NOT JS Date objects/timestamps.
   * The underlying column is a Postgres DATE (no time/timezone component);
   * modeling it as a string here avoids the classic pg timezone-drift bug
   * where a DATE round-tripped through a JS Date shifts by a day depending
   * on the server/client's local timezone.
   */
  validFrom?: string;
  validUntil?: string;
}

export interface ProductAsset {
  id: string;
  agencyId: string;
  productId: string;
  assetId: string;
  sortOrder: number;
  createdAt: Date;
}

// ============================================================
// AIR OPERATIONS DOMAIN
// ============================================================

export enum AirCabinClass {
  ECONOMY = 'ECONOMY',
  PREMIUM_ECONOMY = 'PREMIUM_ECONOMY',
  BUSINESS = 'BUSINESS',
  FIRST = 'FIRST',
}

export enum AirServiceStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}

export enum AirSegmentDirection {
  OUTBOUND = 'OUTBOUND',
  RETURN = 'RETURN',
  INTERNAL = 'INTERNAL',
}

export interface AirService {
  id: string;
  agencyId: string;
  tripId: string;
  bookingId?: string;
  supplierId?: string;
  customerId: string;
  dependentId?: string;
  airline: string;
  consolidator?: string;
  direction: AirSegmentDirection;
  sequence: number;
  origin: string;
  destination: string;
  departureDate: Date;
  departureTime?: string;
  arrivalDate: Date;
  arrivalTime?: string;
  flightNumber?: string;
  cabinClass: AirCabinClass;
  bookingLocator?: string;
  ticketNumber?: string;
  baggage?: string;
  seat?: string;
  fare: number;
  taxes: number;
  fees: number;
  commission?: number;
  cost: number;
  saleValue: number;
  currency: string;
  supplierDueDate?: Date;
  supplierPaymentStatus: FinancialObligationStatus;
  status: AirServiceStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// LAND OPERATIONS DOMAIN
// ============================================================

export enum LandServiceType {
  ACCOMMODATION = 'ACCOMMODATION',
  TRANSFER = 'TRANSFER',
  CAR_RENTAL = 'CAR_RENTAL',
  TOUR = 'TOUR',
  TRAVEL_INSURANCE = 'TRAVEL_INSURANCE',
  CRUISE = 'CRUISE',
  TRAIN = 'TRAIN',
  BUS = 'BUS',
  GUIDE = 'GUIDE',
  TICKET = 'TICKET',
  RECEPTIVE = 'RECEPTIVE',
  OTHER = 'OTHER',
}

export enum LandServiceStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}

export interface LandService {
  id: string;
  agencyId: string;
  tripId: string;
  bookingId?: string;
  supplierId?: string;
  customerId: string;
  dependentId?: string;
  serviceType: LandServiceType;
  description: string;
  startDate: Date;
  endDate: Date;
  quantity: number;
  cost: number;
  saleValue: number;
  taxes: number;
  fees: number;
  commission?: number;
  currency: string;
  supplierDueDate?: Date;
  supplierPaymentStatus: FinancialObligationStatus;
  status: LandServiceStatus;
  confirmationNumber?: string;
  notes?: string;
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

export enum OperationalStaffCapability {
  DRIVER = 'DRIVER',
  GUIDE = 'GUIDE',
}

export enum OperationAssignmentRole {
  DRIVER = 'DRIVER',
  GUIDE = 'GUIDE',
}

export enum ExternalOfferCaptureStatus {
  CAPTURED = 'CAPTURED',
  NORMALIZED = 'NORMALIZED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PUBLISHED = 'PUBLISHED',
}

// Booking: the operational reservation. Booking != Sale -- Sale (not
// present in this branch) owns pricing/discount/tax/currency/payment;
// none of that is modeled here. bookerCustomerId is who owns the
// reservation and is NOT necessarily traveling; passengers are a
// separate concept (BookingPassenger), not Customer records.
// Cancellation V1 is whole-booking only. Refund, passenger-level,
// outbound-only, and return-only cancellation remain outside this model.
export interface Booking {
  id: string;
  agencyId: string;
  bookerCustomerId: string;
  tripType: TripType;
  outboundDepartureId: string;
  returnDepartureId?: string;
  cancelled: boolean;
  cancelledAt?: Date;
  cancelledByUserId?: string;
  cancellationReason?: string;
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

export interface OperationalStaff {
  id: string;
  agencyId: string;
  userId?: string;
  name: string;
  phone?: string;
  email?: string;
  active: boolean;
  capabilities: OperationalStaffCapability[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OperationAssignment {
  id: string;
  agencyId: string;
  operationId: string;
  operationalStaffId: string;
  role: OperationAssignmentRole;
  createdByUserId: string;
  createdAt: Date;
}

export interface ExternalOfferCapture {
  id: string;
  agencyId: string;
  sourceUrl: string;
  sourceName: string;
  capturedAt: Date;
  rawContent: string;
  normalizedTitle?: string;
  normalizedDescription?: string;
  foundPrice?: number;
  currency?: string;
  validUntil?: Date;
  status: ExternalOfferCaptureStatus;
  reviewedAt?: Date;
  reviewedByUserId?: string;
  publishedOfferId?: string;
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
  arrivalConfirmedByUserId?: string;
  departureConfirmedByUserId?: string;
  arrivalOperationalStaffId?: string;
  departureOperationalStaffId?: string;
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
  routePointName?: string;
}

// ============================================================
// COMMERCIAL COCKPIT (migration 008_commercial_cockpit.sql)
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
  // Read-model convenience field: the customer's display name, resolved
  // server-side via a join in listOpportunities so the UI never has to
  // resolve a raw customerId with an N-requests-per-card pattern. Only
  // present on read paths that join it; never written to storage.
  customerName?: string;
  wishId?: string;
  proposalId?: string;
  saleId?: string;
  responsibleUserId?: string;
  destination?: string;
  tripDateFrom?: Date;
  tripDateTo?: Date;
  expectedValue?: number;
  // DEPRECATED: retained only as a read-only historical artifact after
  // migration 009_configurable_pipelines.sql moved the live lifecycle to
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
  // Additive attribution columns from migration
  // 014_offer_growth_foundation.sql (Offer & Growth Engine J/K). Never
  // touches existing semantics above -- populated only when an
  // opportunity originates from Engagement/Automation.
  sourceChannel?: string;
  campaignId?: string;
  publicationId?: string;
  offerId?: string;
  automationId?: string;
}

// ============================================================
// CONFIGURABLE MULTI-PIPELINE (migration 009_configurable_pipelines.sql)
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

// ============================================================
// OFFER & GROWTH ENGINE (migration 014_offer_growth_foundation.sql)
// Batch 04 backend foundation. See docs/adr/ADR-OFFER-GROWTH-001 and
// docs/offer-growth/*.md for the architecture contract this implements.
// No Creative Studio visual editor / no real Meta/WhatsApp/Google SDKs.
// ============================================================

export enum AssetType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  LOGO = 'LOGO',
  ICON = 'ICON',
  DOCUMENT = 'DOCUMENT',
}

export enum AssetSourceType {
  PESCADOR = 'PESCADOR',
  UPLOAD = 'UPLOAD',
  AGENCY_LIBRARY = 'AGENCY_LIBRARY',
  SUPPLIER = 'SUPPLIER',
  GENERATED = 'GENERATED',
  EXTERNAL_CONNECTOR = 'EXTERNAL_CONNECTOR',
}

export interface Asset {
  id: string;
  agencyId: string;
  type: AssetType;
  source: AssetSourceType;
  sourceConnector?: string;
  sourceSupplier?: string;
  sourceOriginalUrl?: string;
  sourceLicense?: string;
  sourceAuthor?: string;
  sourceDedupeHash?: string;
  sourceUsageRestrictions?: string;
  sourceCaptureId?: string;
  metaWidth?: number;
  metaHeight?: number;
  metaDurationSeconds?: number;
  metaMimeType?: string;
  metaSizeBytes?: number;
  metaLanguage?: string;
  metaTags: string[];
  metaSafeArea?: unknown;
  metaVariants: unknown[];
  storageUrl?: string;
  localReference?: string;
  createdByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum CampaignStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  FINISHED = 'FINISHED',
  CANCELLED = 'CANCELLED',
}

// Explicit lifecycle: only these transitions are valid (campaigns.ts
// enforces this, never an arbitrary PATCH to any status).
export const CAMPAIGN_STATUS_TRANSITIONS: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = {
  [CampaignStatus.DRAFT]: [CampaignStatus.SCHEDULED, CampaignStatus.CANCELLED],
  [CampaignStatus.SCHEDULED]: [CampaignStatus.ACTIVE, CampaignStatus.CANCELLED],
  [CampaignStatus.ACTIVE]: [CampaignStatus.PAUSED, CampaignStatus.FINISHED, CampaignStatus.CANCELLED],
  [CampaignStatus.PAUSED]: [CampaignStatus.ACTIVE],
  [CampaignStatus.FINISHED]: [],
  [CampaignStatus.CANCELLED]: [],
};

export interface Campaign {
  id: string;
  agencyId: string;
  name: string;
  description?: string;
  startsAt?: Date;
  endsAt?: Date;
  publicationStartsAt?: Date;
  publicationEndsAt?: Date;
  timezone: string;
  status: CampaignStatus;
  createdByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum PublicationStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  PUBLISHING = 'PUBLISHING',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  ARCHIVED = 'ARCHIVED',
}

export const PUBLICATION_STATUS_TRANSITIONS: Readonly<Record<PublicationStatus, readonly PublicationStatus[]>> = {
  [PublicationStatus.DRAFT]: [PublicationStatus.SCHEDULED, PublicationStatus.CANCELLED],
  [PublicationStatus.SCHEDULED]: [PublicationStatus.PUBLISHING, PublicationStatus.CANCELLED],
  [PublicationStatus.PUBLISHING]: [PublicationStatus.PUBLISHED, PublicationStatus.FAILED],
  [PublicationStatus.PUBLISHED]: [PublicationStatus.ARCHIVED],
  [PublicationStatus.FAILED]: [PublicationStatus.SCHEDULED, PublicationStatus.CANCELLED],
  [PublicationStatus.CANCELLED]: [],
  [PublicationStatus.ARCHIVED]: [],
};

export interface Publication {
  id: string;
  agencyId: string;
  campaignId: string;
  offerId: string;
  creativeTemplateId?: string;
  channel: string;
  // Immutable once set. Never re-derived from a later Offer edit.
  snapshot?: Record<string, unknown>;
  snapshotGeneratedAt?: Date;
  scheduledAt?: Date;
  publishedAt?: Date;
  status: PublicationStatus;
  externalPublicationId?: string;
  createdByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// PlatformFeature is plaform-controlled (Super Admin layer). Never
// spread `if plan === X` checks -- use AgencyEntitlement instead.
export enum PlatformFeature {
  PESCADOR = 'PESCADOR',
  CREATIVE_STUDIO = 'CREATIVE_STUDIO',
  CAMPAIGNS = 'CAMPAIGNS',
  SOCIAL_PUBLISHING = 'SOCIAL_PUBLISHING',
  SOCIAL_AUTOMATION = 'SOCIAL_AUTOMATION',
  // Inert placeholders -- not wired to any capability in this batch.
  WHATSAPP = 'WHATSAPP',
  AI_ASSISTANT = 'AI_ASSISTANT',
  ADVANCED_ANALYTICS = 'ADVANCED_ANALYTICS',
  GDS = 'GDS',
}

export interface AgencyEntitlementLimits {
  executionsPerMonth?: number;
  automations?: number;
  publications?: number;
  storage?: number;
  connectedChannels?: number;
  activeCampaigns?: number;
  generatedAssets?: number;
}

export interface AgencyEntitlement {
  id: string;
  agencyId: string;
  feature: PlatformFeature;
  enabled: boolean;
  limits: AgencyEntitlementLimits;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum EngagementType {
  COMMENT = 'COMMENT',
  MESSAGE = 'MESSAGE',
  CLICK = 'CLICK',
  FORM = 'FORM',
  QR = 'QR',
  COUPON_REQUEST = 'COUPON_REQUEST',
  INTEREST = 'INTEREST',
  // Digital behavior tracking (Customer Engagement Tracking round) --
  // distinct from CustomerInteraction, which represents human/commercial
  // actions. See docs/product/ENGAGEMENT_EVENT_TAXONOMY.md.
  OFFER_VIEWED = 'OFFER_VIEWED',
  OFFER_REVISITED = 'OFFER_REVISITED',
  PROPOSAL_VIEWED = 'PROPOSAL_VIEWED',
  PROPOSAL_REVISITED = 'PROPOSAL_REVISITED',
  COMMUNICATION_VIEWED = 'COMMUNICATION_VIEWED',
  COMMUNICATION_CTA_CLICKED = 'COMMUNICATION_CTA_CLICKED',
  CUSTOMER_HOME_VIEWED = 'CUSTOMER_HOME_VIEWED',
  TRIP_VIEWED = 'TRIP_VIEWED',
}

export interface Engagement {
  id: string;
  agencyId: string;
  type: EngagementType;
  channel: string;
  campaignId?: string;
  publicationId?: string;
  offerId?: string;
  proposalId?: string;
  tripId?: string;
  communicationId?: string;
  // Opaque external-id string from the channel. Never trusted as
  // internal identity.
  externalUserId?: string;
  customerId?: string;
  opportunityId?: string;
  content?: string;
  occurredAt: Date;
  rawPayload?: unknown;
  createdAt: Date;
}

export enum AutomationTrigger {
  COMMENT_KEYWORD = 'COMMENT_KEYWORD',
  DIRECT_MESSAGE_KEYWORD = 'DIRECT_MESSAGE_KEYWORD',
  // Inert placeholders -- not evaluated by the V1 engine.
  FORM_SUBMITTED = 'FORM_SUBMITTED',
  LINK_CLICKED = 'LINK_CLICKED',
  QR_SCANNED = 'QR_SCANNED',
  COUPON_REQUESTED = 'COUPON_REQUESTED',
}

export enum AutomationStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  ARCHIVED = 'ARCHIVED',
}

export enum AutomationActionType {
  PUBLIC_REPLY = 'PUBLIC_REPLY',
  PRIVATE_MESSAGE = 'PRIVATE_MESSAGE',
  CREATE_COUPON = 'CREATE_COUPON',
  SEND_COUPON = 'SEND_COUPON',
  CREATE_OPPORTUNITY = 'CREATE_OPPORTUNITY',
  ASSIGN_AGENT = 'ASSIGN_AGENT',
  CREATE_FOLLOWUP = 'CREATE_FOLLOWUP',
}

export interface AutomationActionPublicReply {
  type: AutomationActionType.PUBLIC_REPLY;
  message: string;
}

export interface AutomationActionPrivateMessage {
  type: AutomationActionType.PRIVATE_MESSAGE;
  message: string;
}

export interface AutomationActionCreateCoupon {
  type: AutomationActionType.CREATE_COUPON;
  couponTemplate: {
    name: string;
    type: 'FIXED_AMOUNT' | 'PERCENTAGE' | 'BENEFIT';
    value?: number;
    benefitDescription?: string;
    expiresInDays?: number;
    maxUses?: number;
    maxUsesPerCustomer?: number;
  };
}

export interface AutomationActionSendCoupon {
  type: AutomationActionType.SEND_COUPON;
  couponId?: string;
  deliveryChannel?: string;
}

export interface AutomationActionCreateOpportunity {
  type: AutomationActionType.CREATE_OPPORTUNITY;
  pipelineId?: string;
  stageId?: string;
}

export interface AutomationActionAssignAgent {
  type: AutomationActionType.ASSIGN_AGENT;
  userId: string;
}

export interface AutomationActionCreateFollowup {
  type: AutomationActionType.CREATE_FOLLOWUP;
  title: string;
  dueInHours?: number;
}

export type AutomationAction =
  | AutomationActionPublicReply
  | AutomationActionPrivateMessage
  | AutomationActionCreateCoupon
  | AutomationActionSendCoupon
  | AutomationActionCreateOpportunity
  | AutomationActionAssignAgent
  | AutomationActionCreateFollowup;

export interface Automation {
  id: string;
  agencyId: string;
  name: string;
  trigger: AutomationTrigger;
  status: AutomationStatus;
  channel?: string;
  campaignId?: string;
  publicationId?: string;
  keyword?: string;
  caseSensitive: boolean;
  actions: AutomationAction[];
  validFrom?: Date;
  validUntil?: Date;
  cooldownSeconds: number;
  maxExecutions?: number;
  maxExecutionsPerExternalUser?: number;
  createdByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AutomationExecution {
  id: string;
  agencyId: string;
  automationId: string;
  engagementId?: string;
  channel: string;
  externalUserId: string;
  normalizedKeyword: string;
  publicationId: string;
  executedAt: Date;
  result?: unknown;
}

export enum CouponType {
  FIXED_AMOUNT = 'FIXED_AMOUNT',
  PERCENTAGE = 'PERCENTAGE',
  BENEFIT = 'BENEFIT',
}

export enum CouponGrantStatus {
  ISSUED = 'ISSUED',
  DELIVERED = 'DELIVERED',
  REDEEMED = 'REDEEMED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

export interface Coupon {
  id: string;
  agencyId: string;
  code: string;
  name: string;
  type: CouponType;
  value?: number;
  benefitDescription?: string;
  startsAt?: Date;
  expiresAt?: Date;
  maxUses?: number;
  maxUsesPerCustomer?: number;
  campaignId?: string;
  offerId?: string;
  active: boolean;
  createdByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CouponGrant {
  id: string;
  agencyId: string;
  couponId: string;
  campaignId?: string;
  publicationId?: string;
  automationId?: string;
  customerId?: string;
  externalUserId?: string;
  issuedAt: Date;
  expiresAt?: Date;
  deliveryChannel?: string;
  status: CouponGrantStatus;
  createdAt: Date;
}

export interface CouponRedemption {
  id: string;
  agencyId: string;
  couponId: string;
  grantId?: string;
  customerId: string;
  proposalId?: string;
  saleId?: string;
  amountApplied?: number;
  redeemedAt: Date;
  reversedAt?: Date;
  recordedByUserId?: string;
  createdAt: Date;
}

export enum ConnectorActionType {
  PUBLIC_REPLY = 'PUBLIC_REPLY',
  PRIVATE_MESSAGE = 'PRIVATE_MESSAGE',
  PUBLISH = 'PUBLISH',
  UPDATE_PUBLICATION = 'UPDATE_PUBLICATION',
}

export enum ConnectorActionStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

export interface ConnectorAction {
  id: string;
  agencyId: string;
  channel: string;
  type: ConnectorActionType;
  automationId?: string;
  publicationId?: string;
  engagementId?: string;
  externalUserId?: string;
  payload: Record<string, unknown>;
  status: ConnectorActionStatus;
  externalRef?: string;
  errorMessage?: string;
  createdAt: Date;
  sentAt?: Date;
}

export interface OfferGrowthAuditLogEntry {
  id: string;
  agencyId: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// ------------------------------------------------------------
// RBAC permission mapping (entitlements.md). Not a new UserRole -- these
// map onto the existing UserRole hierarchy via requireRole() in
// entitlements.ts / automations.ts / campaigns.ts / etc. Order of
// authorization is ALWAYS: entitlement check first, then RBAC check.
// ------------------------------------------------------------
export enum OfferGrowthPermission {
  CAMPAIGN_READ = 'campaign.read',
  CAMPAIGN_WRITE = 'campaign.write',
  CAMPAIGN_PUBLISH = 'campaign.publish',
  CREATIVE_READ = 'creative.read',
  CREATIVE_WRITE = 'creative.write',
  AUTOMATION_READ = 'automation.read',
  AUTOMATION_WRITE = 'automation.write',
  AUTOMATION_ACTIVATE = 'automation.activate',
  COUPON_MANAGE = 'coupon.manage',
  CONNECTOR_CONFIGURE = 'connector.configure',
  ANALYTICS_READ = 'analytics.read',
}

// ------------------------------------------------------------
// Channel Connector contract (channel-connectors.md), adapted to repo
// TypeScript conventions. No real Meta/WhatsApp/Google SDK -- see
// connectors/mock-connector.ts for the one real internal test adapter.
// ------------------------------------------------------------
export interface ChannelCapabilities {
  canPublish: boolean;
  canUpdatePublication: boolean;
  canReceiveComments: boolean;
  canReceiveMessages: boolean;
  canReceiveLeads: boolean;
  canTrackClicks: boolean;
  canReceiveEngagement: boolean;
}

export interface ConnectorPublishInput {
  agencyId: string;
  publicationId: string;
  channel: string;
  snapshot: Record<string, unknown>;
}

export interface ConnectorPublishResult {
  externalPublicationId: string;
  publishedAt: Date;
}

export interface ConnectorUpdatePublicationInput {
  agencyId: string;
  publicationId: string;
  externalPublicationId: string;
  snapshot: Record<string, unknown>;
}

export interface ConnectorEvent {
  agencyId: string;
  channel: string;
  type: EngagementType;
  externalUserId?: string;
  publicationExternalId?: string;
  content?: string;
  occurredAt: Date;
  rawPayload?: unknown;
}

export interface ConnectorValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface ChannelConnector {
  channel: string;
  capabilities: ChannelCapabilities;
  publish(input: ConnectorPublishInput): Promise<ConnectorPublishResult>;
  updatePublication(input: ConnectorUpdatePublicationInput): Promise<ConnectorPublishResult>;
  receiveEngagement(event: ConnectorEvent): Promise<Omit<Engagement, 'id' | 'createdAt'>>;
  validateConfiguration(config: unknown): Promise<ConnectorValidationResult>;
}

// ============================================================
// CUSTOMER 360 DOMAIN (Task 2: Domain Types)
// Address, Dependent, Document, and OCR-related types
// ============================================================

export enum AddressType {
  RESIDENTIAL = 'RESIDENTIAL',
  COMMERCIAL = 'COMMERCIAL',
  TEMPORARY = 'TEMPORARY',
}

export interface CustomerAddress {
  id: string;
  agencyId: string;
  customerId: string;
  type: AddressType;
  isPrimary: boolean;
  cep?: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
  country: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export enum RelationshipType {
  SPOUSE = 'SPOUSE',
  CHILD = 'CHILD',
  PARENT = 'PARENT',
  COMPANION = 'COMPANION',
  OTHER = 'OTHER',
}

export interface CustomerDependent {
  id: string;
  agencyId: string;
  customerId: string;
  name: string;
  relationshipType: RelationshipType;
  birthDate?: Date;
  cpf?: string;
  nationality?: string;
  notes?: string;
  /** Only meaningful for a minor (relationshipType CHILD) traveling
   * without both legal guardians -- some routes/countries require a
   * notarized or judicial travel authorization in that case
   * (069_dependent_power_of_attorney.sql). */
  hasPowerOfAttorney: boolean;
  powerOfAttorneyNotes?: string;
  /** Set once this companion has been promoted into their own
   * `customers` row (070_dependent_convert_to_customer.sql) -- never
   * set for a minor (CHILD), who stays tied to their guardian. */
  convertedCustomerId?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export enum DocumentType {
  PASSAPORTE = 'PASSAPORTE',
  RG = 'RG',
  CNH = 'CNH',
  CPF = 'CPF',
  VISTO = 'VISTO',
  CERTIDAO = 'CERTIDAO',
  AUTORIZACAO_VIAGEM = 'AUTORIZACAO_VIAGEM',
  CERTIFICADO_VACINACAO = 'CERTIFICADO_VACINACAO',
  SEGURO_VIAGEM = 'SEGURO_VIAGEM',
  OUTRO = 'OUTRO',
}

export enum TravelRequirementType {
  PASSAPORTE_VALIDO = 'PASSAPORTE_VALIDO',
  VISTO = 'VISTO',
  VACINACAO = 'VACINACAO',
  SEGURO = 'SEGURO',
  AUTORIZACAO = 'AUTORIZACAO',
  OUTROS = 'OUTROS',
}

export enum TravelerType {
  CUSTOMER = 'CUSTOMER',
  DEPENDENT = 'DEPENDENT',
}

export interface TravelRequirement {
  id: string;
  agencyId: string;
  customerId: string;
  travelerType: TravelerType;
  dependentId?: string;
  tripId?: string;
  destination?: string;
  type: TravelRequirementType;
  required: boolean;
  fulfilled: boolean;
  documentId?: string;
  expirationDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export enum DocumentVerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  MISMATCH = 'MISMATCH',
  EXPIRED = 'EXPIRED',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
}

export interface CustomerDocument {
  id: string;
  agencyId: string;
  customerId: string;
  documentType: DocumentType;
  documentNumber: string;
  holderName?: string;
  holderBirthDate?: Date;
  holderNationality?: string;
  issuingCountry?: string;
  issuingAuthority?: string;
  issuedDate?: Date;
  expiryDate?: Date;
  isExpired: boolean;
  verificationStatus: DocumentVerificationStatus;
  verifiedAt?: Date;
  verifiedByUserId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export enum DocumentAttachmentType {
  FRONT = 'FRONT',
  BACK = 'BACK',
  PASSPORT_PAGE = 'PASSPORT_PAGE',
  VISA = 'VISA',
  OTHER = 'OTHER',
}

export interface DocumentAttachment {
  id: string;
  agencyId: string;
  documentId: string;
  attachmentType: DocumentAttachmentType;
  fileName: string;
  fileSizeBytes: number;
  fileMimeType: string;
  secureFileKey: string;
  fileHash?: string;
  createdAt: Date;
  deletedAt?: Date;
}

export enum OcrProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
}

export interface DocumentExtraction {
  id: string;
  agencyId: string;
  documentId: string;
  provider: string;
  extractedData: Record<string, unknown>;
  confidence?: number;
  /** Per-field confidence (0-100), keyed by the same names as extractedData. */
  fieldConfidence?: Record<string, number>;
  processingStatus: OcrProcessingStatus;
  processedAt?: Date;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentVerification {
  id: string;
  agencyId: string;
  documentId: string;
  extractionId?: string;
  holderNameMatch?: boolean;
  holderBirthDateMatch?: boolean;
  holderNationalityMatch?: boolean;
  documentNumberMatch?: boolean;
  discrepancies?: Record<string, unknown>;
  manualReviewNotes?: string;
  reviewedAt?: Date;
  reviewedByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum DocumentAuditEventType {
  DOCUMENT_CREATED = 'DOCUMENT_CREATED',
  DOCUMENT_UPDATED = 'DOCUMENT_UPDATED',
  ATTACHMENT_UPLOADED = 'ATTACHMENT_UPLOADED',
  ATTACHMENT_DELETED = 'ATTACHMENT_DELETED',
  DOCUMENT_VIEWED = 'DOCUMENT_VIEWED',
  EXTRACTION_STARTED = 'EXTRACTION_STARTED',
  EXTRACTION_COMPLETED = 'EXTRACTION_COMPLETED',
  VERIFICATION_COMPLETED = 'VERIFICATION_COMPLETED',
  DOCUMENT_SOFT_DELETED = 'DOCUMENT_SOFT_DELETED',
}

export interface DocumentAuditEvent {
  id: string;
  agencyId: string;
  documentId?: string;
  attachmentId?: string;
  userId?: string;
  customerId?: string;
  eventType: DocumentAuditEventType;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}
