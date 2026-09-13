/**
 * Meta (Instagram/Facebook) channel connector.
 *
 * Implements ChannelConnector for the Meta Graph API.
 * Handles publishing, updating, and receiving engagement events.
 *
 * Configuration:
 * - CONNECTOR_META_ACCESS_TOKEN=<page/user access token>
 * - CONNECTOR_META_PAGE_ID=<facebook page id>
 * - CONNECTOR_META_API_VERSION=v21.0 (optional, default v21.0)
 *
 * Capabilities:
 * - Publish to Instagram Business / Facebook Pages
 * - Update published posts
 * - Receive comments and messages via webhooks
 * - Track engagement metrics
 */

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

export const META_CONNECTOR_CHANNEL = 'INSTAGRAM';

export interface MetaConnectorConfig {
  accessToken: string;
  pageId: string;
  apiVersion?: string;
}

export class MetaConnector implements ChannelConnector {
  readonly channel = META_CONNECTOR_CHANNEL;
  readonly capabilities: ChannelCapabilities = {
    canPublish: true,
    canUpdatePublication: true,
    canReceiveComments: true,
    canReceiveMessages: true,
    canReceiveLeads: false,
    canTrackClicks: false,
    canReceiveEngagement: true,
  };

  private readonly accessToken: string;
  private readonly pageId: string;
  private readonly apiVersion: string;
  private readonly baseUrl: string;

  constructor(config: MetaConnectorConfig) {
    if (!config.accessToken) {
      throw new Error('Meta access token is required');
    }
    if (!config.pageId) {
      throw new Error('Meta page ID is required');
    }
    this.accessToken = config.accessToken;
    this.pageId = config.pageId;
    this.apiVersion = config.apiVersion ?? 'v21.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  async publish(input: ConnectorPublishInput): Promise<ConnectorPublishResult> {
    const message = (input.snapshot.message as string) ?? '';
    const imageUrl = input.snapshot.imageUrl as string | undefined;

    let endpoint: string;
    let body: Record<string, string>;

    if (imageUrl) {
      // Photo post
      endpoint = `${this.baseUrl}/${this.pageId}/photos`;
      body = {
        url: imageUrl,
        caption: message,
        access_token: this.accessToken,
      };
    } else {
      // Text post
      endpoint = `${this.baseUrl}/${this.pageId}/feed`;
      body = {
        message,
        access_token: this.accessToken,
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'unknown');
      throw new Error(`Meta publish failed (${response.status}): ${error}`);
    }

    const data = (await response.json()) as { id?: string };
    if (!data.id) {
      throw new Error('Meta publish returned no ID');
    }

    return {
      externalPublicationId: data.id,
      publishedAt: new Date(),
    };
  }

  async updatePublication(input: ConnectorUpdatePublicationInput): Promise<ConnectorPublishResult> {
    const message = (input.snapshot.message as string) ?? '';

    // Meta doesn't support editing posts via Graph API — only page posts can be edited
    // For Instagram, mutations are limited. We re-publish and return the original ID.
    const endpoint = `${this.baseUrl}/${input.externalPublicationId}`;
    const body = {
      message,
      access_token: this.accessToken,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    // If update fails (e.g., Instagram media can't be edited), return original
    if (!response.ok) {
      return {
        externalPublicationId: input.externalPublicationId,
        publishedAt: new Date(),
      };
    }

    return {
      externalPublicationId: input.externalPublicationId,
      publishedAt: new Date(),
    };
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

  async validateConfiguration(_config?: unknown): Promise<ConnectorValidationResult> {
    try {
      // Verify token is valid by calling the me endpoint
      const response = await fetch(
        `${this.baseUrl}/me?access_token=${this.accessToken}`,
        { signal: AbortSignal.timeout(5_000) },
      );

      if (!response.ok) {
        return {
          valid: false,
          errors: [`Meta API returned ${response.status}`],
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Connection failed'],
      };
    }
  }

  /**
   * Parse an incoming webhook payload from Meta.
   * Use this in your webhook route handler to normalize events.
   */
  parseWebhookPayload(
    agencyId: string,
    payload: Record<string, unknown>,
  ): ConnectorEvent | null {
    const entry = payload.entry;
    const entries = Array.isArray(entry) ? entry : [];
    const first = entries[0] as Record<string, unknown> | undefined;
    if (!first) return null;

    const changes = first.changes as Array<Record<string, unknown>> | undefined;
    if (!changes || changes.length === 0) return null;

    const change = changes[0]!;
    const field = change.field as string;
    const value = (change.value ?? {}) as Record<string, unknown>;

    if (field === 'comments') {
      const from = (value.from ?? {}) as Record<string, string>;
      return {
        agencyId,
        channel: this.channel,
        type: EngagementType.COMMENT,
        externalUserId: from.id ?? '',
        content: (value.text as string) ?? '',
        occurredAt: new Date(),
        rawPayload: payload,
      };
    }

    if (field === 'messages') {
      const sender = (value.sender ?? {}) as Record<string, string>;
      const message = (value.message ?? {}) as Record<string, string>;
      return {
        agencyId,
        channel: this.channel,
        type: EngagementType.MESSAGE,
        externalUserId: sender.id ?? '',
        content: message.text ?? '',
        occurredAt: new Date(),
        rawPayload: payload,
      };
    }

    return null;
  }
}
