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
  createdAt: string;
  updatedAt: string;
}
