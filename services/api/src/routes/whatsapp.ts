/**
 * WhatsApp — HTTP routes for sharing links
 *
 * Fase 1: Deep links e message builder.
 * Não implementa WhatsApp Business API.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { ValidationError, NotFoundError } from '../errors';
import {
  isValidPhone,
  generateWhatsAppLink,
  generateWhatsAppChatLink,
  buildOfferShareMessage,
  buildProposalShareMessage,
  buildTripShareMessage,
} from '../whatsapp-link';
import { getOfferById } from '../offers';

export interface WhatsAppRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

function requireStringField(value: unknown, fieldName: string): string {
  if (value === undefined || value === null || typeof value !== 'string') {
    throw new ValidationError(`Field "${fieldName}" is required and must be a string`);
  }
  return value;
}

export function registerWhatsAppRoutes(
  app: FastifyInstance,
  options: WhatsAppRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  // ============================================================
  // SHARE OFFER
  // ============================================================
  app.post('/api/whatsapp/share/offer', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.AGENT);

    const body = request.body as Record<string, unknown>;
    if (typeof body !== 'object' || body === null) {
      throw new ValidationError('Request body must be an object');
    }

    const offerId = requireStringField(body.offerId, 'offerId');
    const customerPhone = requireStringField(body.customerPhone, 'customerPhone');

    if (!isValidPhone(customerPhone)) {
      throw new ValidationError('Invalid phone number');
    }

    const offer = await getOfferById(database, offerId);
    if (!offer) {
      throw new NotFoundError('Offer not found');
    }

    const name = (typeof body.customerName === 'string' ? body.customerName : '') || 'Cliente';
    const message = buildOfferShareMessage(name, {
      name: offer.name,
      price: offer.price,
      link: '[link da oferta]',
    });

    const phoneLink = generateWhatsAppLink(customerPhone, message);

    return {
      link: phoneLink,
      message,
      preview: message.substring(0, 200),
    };
  });

  // ============================================================
  // SHARE PROPOSAL
  // ============================================================
  app.post('/api/whatsapp/share/proposal', { preHandler: protectedHooks }, (request) => {
    requireRole(UserRole.AGENT);

    const body = request.body as Record<string, unknown>;
    if (typeof body !== 'object' || body === null) {
      throw new ValidationError('Request body must be an object');
    }

    requireStringField(body.proposalId, 'proposalId');
    const customerPhone = requireStringField(body.customerPhone, 'customerPhone');

    if (!isValidPhone(customerPhone)) {
      throw new ValidationError('Invalid phone number');
    }

    const name = (typeof body.customerName === 'string' ? body.customerName : '') || 'Cliente';
    const summary = (typeof body.summary === 'string' ? body.summary : '') || 'Proposta personalizada';
    const validUntilStr = typeof body.validUntil === 'string' ? body.validUntil : undefined;

    const proposalData: { summary: string; link: string; validUntil?: Date } = {
      summary,
      link: '[link da proposta]',
    };
    if (validUntilStr) proposalData.validUntil = new Date(validUntilStr);

    const message = buildProposalShareMessage(name, proposalData);

    const phoneLink = generateWhatsAppLink(customerPhone, message);

    return {
      link: phoneLink,
      message,
      preview: message.substring(0, 200),
    };
  });

  // ============================================================
  // SHARE TRIP
  // ============================================================
  app.post('/api/whatsapp/share/trip', { preHandler: protectedHooks }, (request) => {
    requireRole(UserRole.AGENT);

    const body = request.body as Record<string, unknown>;
    if (typeof body !== 'object' || body === null) {
      throw new ValidationError('Request body must be an object');
    }

    requireStringField(body.tripId, 'tripId');
    const customerPhone = requireStringField(body.customerPhone, 'customerPhone');

    if (!isValidPhone(customerPhone)) {
      throw new ValidationError('Invalid phone number');
    }

    const name = (typeof body.customerName === 'string' ? body.customerName : '') || 'Cliente';
    const destination = (typeof body.destination === 'string' ? body.destination : '') || 'sua viagem';
    const details = (typeof body.details === 'string' ? body.details : '') || 'Confira os detalhes da sua viagem.';

    const message = buildTripShareMessage(name, {
      destination,
      details,
      link: '[link da viagem]',
    });

    const phoneLink = generateWhatsAppLink(customerPhone, message);

    return {
      link: phoneLink,
      message,
      preview: message.substring(0, 200),
    };
  });

  // ============================================================
  // CUSTOMER CHAT LINK
  // ============================================================
  app.get<{ Params: { id: string } }>(
    '/api/whatsapp/customer/:id/link',
    { preHandler: protectedHooks },
    (request) => {
      requireRole(UserRole.AGENT);

      const query = request.query as Record<string, unknown>;
      const phone = typeof query.phone === 'string' ? query.phone : undefined;

      if (!phone) {
        throw new ValidationError('Query parameter "phone" is required');
      }
      if (!isValidPhone(phone)) {
        throw new ValidationError('Invalid phone number');
      }

      const link = generateWhatsAppChatLink(phone);

      return { link };
    }
  );
}
