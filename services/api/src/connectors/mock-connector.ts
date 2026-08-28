// Internal test/mock connector (channel-connectors.md, Offer & Growth
// batch section I/W). Genuinely working in-process -- not a network
// mock -- so it can drive real code paths end-to-end in tests (see the
// Cancun E2E test). No real Meta/Instagram/WhatsApp/Google SDK.

import { randomUUID } from 'node:crypto';
import {
  EngagementType,
  type ChannelCapabilities,
  type ChannelConnector,
  type ConnectorEvent,
  type ConnectorPublishInput,
  type ConnectorPublishResult,
  type ConnectorUpdatePublicationInput,
  type ConnectorValidationResult,
  type Engagement,
} from '../../../../packages/domain/types';

export const INTERNAL_MOCK_CHANNEL = 'INTERNAL_MOCK';

export interface MockConnectorPublishedRecord {
  publicationId: string;
  externalPublicationId: string;
  snapshot: Record<string, unknown>;
  publishedAt: Date;
}

// Genuinely working in-process adapter: publish() records a real
// "published" entry this process can inspect, simulateComment()/
// simulateMessage() synthesize a normalized ConnectorEvent the same
// shape a real webhook would produce.
export class InternalMockConnector implements ChannelConnector {
  readonly channel = INTERNAL_MOCK_CHANNEL;
  readonly capabilities: ChannelCapabilities = {
    canPublish: true,
    canUpdatePublication: true,
    canReceiveComments: true,
    canReceiveMessages: true,
    canReceiveLeads: false,
    canTrackClicks: false,
    canReceiveEngagement: true,
  };

  private readonly published = new Map<string, MockConnectorPublishedRecord>();

  publish(input: ConnectorPublishInput): Promise<ConnectorPublishResult> {
    const externalPublicationId = `mock-pub-${randomUUID()}`;
    const publishedAt = new Date();
    this.published.set(input.publicationId, {
      publicationId: input.publicationId,
      externalPublicationId,
      snapshot: input.snapshot,
      publishedAt,
    });
    return Promise.resolve({ externalPublicationId, publishedAt });
  }

  updatePublication(input: ConnectorUpdatePublicationInput): Promise<ConnectorPublishResult> {
    const existing = this.published.get(input.publicationId);
    const publishedAt = existing?.publishedAt ?? new Date();
    this.published.set(input.publicationId, {
      publicationId: input.publicationId,
      externalPublicationId: input.externalPublicationId,
      snapshot: input.snapshot,
      publishedAt,
    });
    return Promise.resolve({ externalPublicationId: input.externalPublicationId, publishedAt });
  }

  receiveEngagement(event: ConnectorEvent): Promise<Omit<Engagement, 'id' | 'createdAt'>> {
    return Promise.resolve({
      agencyId: event.agencyId,
      type: event.type,
      channel: this.channel,
      occurredAt: event.occurredAt,
      ...(event.externalUserId !== undefined ? { externalUserId: event.externalUserId } : {}),
      ...(event.content !== undefined ? { content: event.content } : {}),
      ...(event.rawPayload !== undefined ? { rawPayload: event.rawPayload } : {}),
    });
  }

  validateConfiguration(): Promise<ConnectorValidationResult> {
    return Promise.resolve({ valid: true });
  }

  // ------------------------------------------------------------
  // Test helpers -- simulate an inbound comment/message the same shape a
  // real webhook payload would carry, and expose what has been
  // "published" so tests can assert against real in-process state.
  // ------------------------------------------------------------

  simulateComment(input: {
    agencyId: string;
    externalUserId: string;
    content: string;
    publicationExternalId?: string;
  }): ConnectorEvent {
    return {
      agencyId: input.agencyId,
      channel: this.channel,
      type: EngagementType.COMMENT,
      externalUserId: input.externalUserId,
      content: input.content,
      occurredAt: new Date(),
      rawPayload: { kind: 'comment', text: input.content },
      ...(input.publicationExternalId !== undefined
        ? { publicationExternalId: input.publicationExternalId }
        : {}),
    };
  }

  simulateMessage(input: { agencyId: string; externalUserId: string; content: string }): ConnectorEvent {
    return {
      agencyId: input.agencyId,
      channel: this.channel,
      type: EngagementType.MESSAGE,
      externalUserId: input.externalUserId,
      content: input.content,
      occurredAt: new Date(),
      rawPayload: { kind: 'message', text: input.content },
    };
  }

  getPublishedRecord(publicationId: string): MockConnectorPublishedRecord | undefined {
    return this.published.get(publicationId);
  }

  // Extra capability beyond the generic ChannelConnector contract:
  // routes automation PUBLIC_REPLY/PRIVATE_MESSAGE actions through a
  // real (in-process) send so automations.ts never fakes an external
  // send inline. Kept as an additional method (not part of
  // ChannelConnector) since channel-connectors.md's generic contract
  // does not define a reply primitive -- a real per-provider connector
  // would implement this differently.
  private readonly sentActions: Array<{ type: string; externalUserId?: string; message: string }> = [];

  sendAction(input: {
    type: 'PUBLIC_REPLY' | 'PRIVATE_MESSAGE';
    externalUserId?: string;
    message: string;
  }): Promise<{ externalRef: string }> {
    this.sentActions.push(input);
    return Promise.resolve({ externalRef: `mock-action-${randomUUID()}` });
  }

  getSentActions(): ReadonlyArray<{ type: string; externalUserId?: string; message: string }> {
    return this.sentActions;
  }
}
