// Mirrors packages/domain/types.ts Booking/BookingPassenger, as it comes
// back over the wire (JSON has no Date type, so date fields arrive as ISO
// strings).
//
// Booking != Sale: no price/discount/tax/currency/payment field exists here
// (Sale, in a separate unmerged worktree, will own pricing when that
// integration happens). `cancelled` is server-computed and read-only --
// never accepted as create input (there is no cancel/edit route in this
// vertical; see services/api/src/app.ts POST /bookings for the exact
// forbidden-field list this type structurally mirrors).
//
// bookerCustomerId is who owns the reservation and is NOT necessarily
// traveling. BookingPassenger is a separate, minimal-identity concept, not
// a Customer.

import type { TripType } from './transport';

export interface Booking {
  id: string;
  agencyId: string;
  bookerCustomerId: string;
  tripType: TripType;
  outboundDepartureId: string;
  returnDepartureId?: string;
  cancelled: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookingPassenger {
  id: string;
  agencyId: string;
  bookingId: string;
  name: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBookingPassengerInput {
  name: string;
  notes?: string;
}

export interface CreateBookingInput {
  bookerCustomerId: string;
  tripType: TripType;
  outboundDepartureId: string;
  returnDepartureId?: string;
  notes?: string;
  passengers: CreateBookingPassengerInput[];
}

export interface BookingWithPassengers {
  booking: Booking;
  passengers: BookingPassenger[];
}
