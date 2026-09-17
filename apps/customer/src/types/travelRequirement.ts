// Mirrors packages/domain/types.ts TravelRequirement, as it comes back over
// the wire (JSON has no Date type, so date fields arrive as ISO strings).
// The customer-portal API never returns `notes` (internal agency-only
// free text) -- it is intentionally absent from this type.
export type TravelRequirementType =
  | 'PASSAPORTE_VALIDO'
  | 'VISTO'
  | 'VACINACAO'
  | 'SEGURO'
  | 'AUTORIZACAO'
  | 'OUTROS';

export type TravelerType = 'CUSTOMER' | 'DEPENDENT';

export interface CustomerTravelRequirementView {
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
  createdAt: string;
  updatedAt: string;
}
