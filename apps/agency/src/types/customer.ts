export type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface Customer {
  id: string;
  agencyId: string;
  /** Human-readable registration reference, e.g. "CLI-2026-000123". */
  protocolNumber: string;
  name: string;
  email?: string;
  phone?: string;
  cpf?: string;
  passport?: string;
  rg?: string;
  nationalIdType?: string;
  birthDate?: string;
  nationality?: string;
  whatsapp?: string;
  socialName?: string;
  maritalStatus?: string;
  profession?: string;
  idIssuingAuthority?: string;
  idIssuedDate?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  emergencyContactWhatsapp?: string;
  emergencyContactEmail?: string;
  emergencyContactNotes?: string;
  address?: Record<string, unknown>;
  notes?: string;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
}
