export type CouponType = 'FIXED' | 'PERCENTAGE' | 'BOGO';

export interface Coupon {
  id: string;
  agencyId: string;
  code: string;
  name: string;
  type: CouponType;
  value?: number;
  benefitDescription?: string;
  startsAt?: string;
  expiresAt?: string;
  maxUses?: number;
  maxUsesPerCustomer?: number;
  campaignId?: string;
  offerId?: string;
  active: boolean;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}
