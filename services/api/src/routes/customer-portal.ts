/**
 * Customer-facing portal API -- read-only endpoints for end customers to view
 * their own trips, offers, proposals, bookings, documents, and payment schedule.
 *
 * Registered as one unit from app.ts. Uses `customerHooks` (not
 * `protectedHooks`) -- a completely separate auth/tenant-context pipeline
 * from the staff routes. Mounted under /customer-api/* (distinct prefix from
 * the staff /api/* surface the frontend proxy uses).
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { NotFoundError } from '../errors';
import {
  getAvailableOfferById,
  getMyAgencyContact,
  getMyBookingById,
  getMyProfile,
  getMyProposalById,
  getMyTripById,
  listAvailableOffers,
  listMyBookings,
  listMyDocuments,
  listMyPaymentSchedule,
  listMyProposals,
  listMyTrips,
  listMyTravelRequirements,
  listMyTripAirServices,
  listMyTripLandServices,
  recordMyOfferInterest,
} from '../customer-portal';
import { getTripPhotoById, listTripPhotos } from '../trip-photos';
import { readFile as readStoredFile } from '../file-storage';
import type { DatabaseRuntime } from '../database';

export interface CustomerPortalRoutesOptions {
  database: DatabaseRuntime;
  customerHooks: preHandlerHookHandler[];
}

export function registerCustomerPortalRoutes(
  app: FastifyInstance,
  options: CustomerPortalRoutesOptions,
): void {
  const { database, customerHooks } = options;

  app.get('/customer-api/me', { preHandler: customerHooks }, async () => {
    const profile = await getMyProfile(database);
    if (!profile) {
      throw new NotFoundError('Customer profile not found');
    }
    return { profile };
  });

  app.get('/customer-api/agency-contact', { preHandler: customerHooks }, async () => {
    const agency = await getMyAgencyContact(database);
    if (!agency) {
      throw new NotFoundError('Agency not found');
    }
    return { agency };
  });

  app.get('/customer-api/trips', { preHandler: customerHooks }, async () => {
    const trips = await listMyTrips(database);
    return { trips };
  });

  app.get<{ Params: { id: string } }>(
    '/customer-api/trips/:id',
    { preHandler: customerHooks },
    async (request) => {
      const trip = await getMyTripById(database, request.params.id);
      if (!trip) {
        throw new NotFoundError('Trip not found');
      }
      return { trip };
    }
  );

  app.get('/customer-api/offers', { preHandler: customerHooks }, async () => {
    const offers = await listAvailableOffers(database);
    return { offers };
  });

  app.get<{ Params: { id: string } }>(
    '/customer-api/offers/:id',
    { preHandler: customerHooks },
    async (request) => {
      const offer = await getAvailableOfferById(database, request.params.id);
      if (!offer) {
        throw new NotFoundError('Offer not found');
      }
      return { offer };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/customer-api/offers/:id/interest',
    { preHandler: customerHooks },
    async (request, reply) => {
      await recordMyOfferInterest(database, request.params.id);
      reply.code(201);
      return { recorded: true };
    }
  );

  app.get('/customer-api/proposals', { preHandler: customerHooks }, async () => {
    const proposals = await listMyProposals(database);
    return { proposals };
  });

  app.get<{ Params: { id: string } }>(
    '/customer-api/proposals/:id',
    { preHandler: customerHooks },
    async (request) => {
      const proposal = await getMyProposalById(database, request.params.id);
      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }
      return { proposal };
    }
  );

  app.get('/customer-api/bookings', { preHandler: customerHooks }, async () => {
    const bookings = await listMyBookings(database);
    return { bookings };
  });

  app.get<{ Params: { id: string } }>(
    '/customer-api/bookings/:id',
    { preHandler: customerHooks },
    async (request) => {
      const result = await getMyBookingById(database, request.params.id);
      if (!result) {
        throw new NotFoundError('Booking not found');
      }
      return { booking: result.booking, passengers: result.passengers };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/customer-api/trips/:id/air-segments',
    { preHandler: customerHooks },
    async (request) => {
      const segments = await listMyTripAirServices(database, request.params.id);
      return { segments };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/customer-api/trips/:id/land-services',
    { preHandler: customerHooks },
    async (request) => {
      const services = await listMyTripLandServices(database, request.params.id);
      return { services };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/customer-api/trips/:id/requirements',
    { preHandler: customerHooks },
    async (request) => {
      const trip = await getMyTripById(database, request.params.id);
      if (!trip) {
        throw new NotFoundError('Trip not found');
      }
      const requirements = await listMyTravelRequirements(database, request.params.id);
      return { requirements };
    }
  );

  // Photo carousel -- ownership is re-checked via getMyTripById (which
  // itself filters by the caller's own customerId from tenant context,
  // never a request param) before any photo row is ever touched, so a
  // customer cannot enumerate another customer's trip photos by id.
  app.get<{ Params: { id: string } }>(
    '/customer-api/trips/:id/photos',
    { preHandler: customerHooks },
    async (request) => {
      const trip = await getMyTripById(database, request.params.id);
      if (!trip) {
        throw new NotFoundError('Trip not found');
      }
      const photos = await listTripPhotos(database, request.params.id);
      return { photos };
    }
  );

  app.get<{ Params: { id: string; photoId: string } }>(
    '/customer-api/trips/:id/photos/:photoId/download',
    { preHandler: customerHooks },
    async (request, reply) => {
      const trip = await getMyTripById(database, request.params.id);
      if (!trip) {
        throw new NotFoundError('Trip not found');
      }
      const photo = await getTripPhotoById(database, request.params.photoId);
      if (!photo || photo.tripId !== request.params.id) {
        throw new NotFoundError('Photo not found');
      }
      const content = await readStoredFile(photo.secureFileKey);
      reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(photo.fileName)}"`);
      reply.type(photo.fileMimeType);
      return reply.send(content);
    }
  );

  app.get('/customer-api/documents', { preHandler: customerHooks }, async () => {
    const documents = await listMyDocuments(database);
    return { documents };
  });

  app.get('/customer-api/payment-schedule', { preHandler: customerHooks }, async () => {
    const items = await listMyPaymentSchedule(database);
    return { items };
  });
}
