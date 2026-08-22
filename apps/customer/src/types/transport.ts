// Mirrors packages/domain/types.ts Transportation domain, as it comes back
// over the wire (JSON has no Date type, so date fields arrive as ISO
// strings).
//
// NOTE: `availableSeats` is NOT a field on ScheduledDeparture itself in the
// real backend (see services/api/src/scheduled-departures.ts) -- there is no
// Booking table yet, so nothing consumes capacity. It only exists on
// AgendaEntry, computed as `cancelled ? 0 : capacity`. The frontend derives
// the same value client-side for display in the Departures list, but it is
// never sent to or trusted from a ScheduledDeparture record directly.

export type TripType = 'ONE_WAY' | 'ROUND_TRIP';

export interface Route {
  id: string;
  agencyId: string;
  origin: string;
  destination: string;
  estimatedDuration?: number;
  distance?: number;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRouteInput {
  origin: string;
  destination: string;
  estimatedDuration?: number;
  distance?: number;
  notes?: string;
}

export interface UpdateRouteInput {
  origin?: string;
  destination?: string;
  estimatedDuration?: number;
  distance?: number;
  notes?: string;
  active?: boolean;
}

export interface Supplier {
  id: string;
  agencyId: string;
  name: string;
  document?: string;
  contact?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierInput {
  name: string;
  document?: string;
  contact?: string;
}

export interface UpdateSupplierInput {
  name?: string;
  document?: string;
  contact?: string;
  active?: boolean;
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

export interface CreateTransportProductInput {
  name: string;
  tripType: TripType;
  outboundRouteId: string;
  returnRouteId?: string;
  price: number;
  publiclyBookable?: boolean;
  notes?: string;
}

// The real backend (parseUpdateTransportProductInput in services/api/src/app.ts)
// only allows name/price/active/publiclyBookable/notes on update -- tripType,
// outboundRouteId and returnRouteId are immutable after creation. Do not add
// them here even though the create input has them.
export interface UpdateTransportProductInput {
  name?: string;
  price?: number;
  active?: boolean;
  publiclyBookable?: boolean;
  notes?: string;
}

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

export interface CreateScheduledDepartureInput {
  productId: string;
  departureAt: string;
  arrivalExpectedAt?: string;
  capacity: number;
  supplierId?: string;
  serviceType: DepartureServiceType;
  notes?: string;
}

// productId is intentionally absent -- the backend does not allow it in
// PATCH /transport/departures/:id (ALLOWED_DEPARTURE_UPDATE_FIELDS).
export interface UpdateScheduledDepartureInput {
  departureAt?: string;
  arrivalExpectedAt?: string;
  capacity?: number;
  supplierId?: string;
  serviceType?: DepartureServiceType;
  cancelled?: boolean;
  notes?: string;
}

export interface AgendaEntry {
  departure: ScheduledDeparture;
  productName: string;
  outboundOrigin: string;
  outboundDestination: string;
  supplierName?: string;
  availableSeats: number;
}
