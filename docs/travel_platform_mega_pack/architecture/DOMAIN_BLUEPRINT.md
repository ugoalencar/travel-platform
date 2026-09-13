# Blueprint de Domínio

## SaaS Admin
AgencyProfile, AgencyBranding, AgencySettings, Department, Team, Membership, PermissionRestriction.

## Client Onboarding
EnrollmentLink, EnrollmentSubmission, EnrollmentDocument, EnrollmentReview.

## Contracts
ContractTemplate, ContractDocument, ContractParty, Signatory, SignatureRequest, SignatureEvidence, ContractAuditEvent.

## Partner
CommercialPartner, PartnerContract, PartnerLink, PartnerAttribution, PartnerCommission.

## Traveler
InternationalTravelerProfile, TravelDocument, Visa, LoyaltyProgram, TravelPreference, EmergencyContact, TravelRequirement, TravelerRequirementStatus.

## OCR
OCRJob, OCRExtraction, OCRFieldCandidate, OCRReview.

## Commerce
TravelProduct, ProductPricing, ProductAvailability, ProductSupplierLink, SaleItem, ProposalOptionalItem, UpsellRule, UpsellSuggestion.

## Insurance
InsuranceProduct, InsurancePolicy, InsuranceTraveler, InsuranceDocument.

## Campaigns
PartnerCampaign, CampaignPlacement, CampaignProduct, CampaignAttribution.

## Regra Financeira
Employee, Partner, Supplier, Insurance e SaleItem devem convergir no MESMO financeiro existente.
Não criar AP/AR/Cash paralelos.
