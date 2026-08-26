// Mirrors packages/domain/types.ts Customer, as it comes back over the wire
// (JSON has no Date type, so date fields arrive as ISO strings).
export type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

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
  status: CustomerStatus;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerInput {
  name: string;
  email?: string;
  phone?: string;
  cpf?: string;
  passport?: string;
  address?: Record<string, unknown>;
  notes?: string;
}

export interface UpdateCustomerInput {
  name?: string;
  email?: string;
  phone?: string;
  cpf?: string;
  passport?: string;
  address?: Record<string, unknown>;
  notes?: string;
}
