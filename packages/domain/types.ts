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
// TENANT-SCOPED QUERY TYPES
// ============================================================

export type TenantScoped<T> = T & { agencyId: string };

export type CreateInput<T> = Omit<T, 'id' | 'agencyId' | 'createdAt' | 'updatedAt'>;
export type UpdateInput<T> = Partial<
  Omit<T, 'id' | 'agencyId' | 'createdAt' | 'updatedAt'>
>;
