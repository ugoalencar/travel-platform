export type TripType = 'ONE_WAY' | 'ROUND_TRIP';
export type DepartureServiceType = 'OWN' | 'SUBCONTRACTED' | 'RESELL';

export interface ScheduledDeparture {
  id: string;
  agencyId: string;
  productId: string;
  departureAt: string;
  arrivalExpectedAt?: string;
  capacity: number;
  supplierId?: string;
  serviceType: DepartureServiceType;
  cancelled: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
}
