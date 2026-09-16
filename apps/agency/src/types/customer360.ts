export type AddressType = 'RESIDENTIAL' | 'COMMERCIAL' | 'TEMPORARY';

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
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export type RelationshipType = 'SPOUSE' | 'CHILD' | 'PARENT' | 'COMPANION' | 'OTHER';

export interface CustomerDependent {
  id: string;
  agencyId: string;
  customerId: string;
  name: string;
  relationshipType: RelationshipType;
  birthDate?: string;
  cpf?: string;
  nationality?: string;
  notes?: string;
  /** Only meaningful for a minor (relationshipType CHILD) traveling
   * without both legal guardians -- some routes/countries require a
   * notarized or judicial travel authorization in that case. */
  hasPowerOfAttorney: boolean;
  powerOfAttorneyNotes?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export type DocumentType =
  | 'PASSAPORTE'
  | 'RG'
  | 'CNH'
  | 'CPF'
  | 'VISTO'
  | 'CERTIDAO'
  | 'AUTORIZACAO_VIAGEM'
  | 'CERTIFICADO_VACINACAO'
  | 'SEGURO_VIAGEM'
  | 'OUTRO';

export type DocumentVerificationStatus =
  | 'PENDING'
  | 'VERIFIED'
  | 'MISMATCH'
  | 'EXPIRED'
  | 'MANUAL_REVIEW';

export interface CustomerDocument {
  id: string;
  agencyId: string;
  customerId: string;
  documentType: DocumentType;
  documentNumber: string;
  holderName?: string;
  holderBirthDate?: string;
  holderNationality?: string;
  issuingCountry?: string;
  issuingAuthority?: string;
  issuedDate?: string;
  expiryDate?: string;
  isExpired: boolean;
  verificationStatus: DocumentVerificationStatus;
  verifiedAt?: string;
  verifiedByUserId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export type TravelRequirementType =
  | 'PASSAPORTE_VALIDO'
  | 'VISTO'
  | 'VACINACAO'
  | 'SEGURO'
  | 'AUTORIZACAO'
  | 'OUTROS';

export type TravelerType = 'CUSTOMER' | 'DEPENDENT';

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
  expirationDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
