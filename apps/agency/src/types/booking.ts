export interface Booking {
  id: string;
  agencyId: string;
  bookerCustomerId: string;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
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
