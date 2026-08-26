// ============================================================
// Channel Connector -- abstract interfaces only.
//
// NO Instagram/Meta SDK implementation, NO credentials, NO persisted
// connector config. See docs/offer-growth/SECURITY-THREAT-MAP.md for why
// credential storage is explicitly deferred (requires an encrypted-secrets
// abstraction this repo does not have yet) and
// docs/offer-growth/IMPLEMENTATION-HANDOFF.md for what a real connector
// still needs before it can ship.
// ============================================================

/** Content handed to a connector to publish. Deliberately loose -- what a
 *  "creative" render output looks like is not decided by this package (see
 *  types.ts RenderResult). */
export interface PublishContent {
  /** Arbitrary caption/body text, if the channel supports one. */
  text?: string;
  /** Rendered media payloads (URLs, or opaque references) to attach. Left
   *  as `unknown[]` -- no Asset entity exists in this codebase to type
   *  against yet. */
  media?: unknown[];
}

export interface PublishResult {
  status: 'success' | 'error';
  /** Platform-assigned identifier for the published item, when successful. */
  externalId?: string;
  /** Human-readable failure reason, when status is 'error'. */
  message?: string;
}

export interface ChannelCapabilities {
  /** Whether this connector can publish new content. */
  canPublish: boolean;
  /** Whether this connector can report back engagement/metrics. */
  canReportMetrics: boolean;
}

/** What a real connector implementation must expose. No implementation of
 *  this interface for a real platform exists in this package -- only the
 *  in-memory mock below, for testing the interface shape itself. */
export interface ChannelConnector {
  readonly id: string;
  readonly capabilities: ChannelCapabilities;
  publish(content: PublishContent): Promise<PublishResult>;
}

/** Trivial in-memory mock. Exists solely to prove the interface shape is
 *  usable and testable -- it is NOT a starting point for a real platform
 *  connector (no auth, no retries, no rate limiting, no real network call). */
export class InMemoryMockChannelConnector implements ChannelConnector {
  readonly id: string;
  readonly capabilities: ChannelCapabilities = { canPublish: true, canReportMetrics: false };
  private readonly published: PublishContent[] = [];
  private nextExternalId = 1;

  constructor(id: string) {
    this.id = id;
  }

  publish(content: PublishContent): Promise<PublishResult> {
    this.published.push(content);
    const externalId = `mock-${this.id}-${this.nextExternalId}`;
    this.nextExternalId += 1;
    return Promise.resolve({ status: 'success', externalId });
  }

  /** Test-only inspection helper -- not part of the ChannelConnector contract. */
  getPublishedContent(): readonly PublishContent[] {
    return this.published;
  }
}
