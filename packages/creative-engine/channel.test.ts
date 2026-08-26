import { describe, it, expect } from 'vitest';
import { InMemoryMockChannelConnector } from './channel';

describe('InMemoryMockChannelConnector', () => {
  it('reports publish-only capabilities', () => {
    const connector = new InMemoryMockChannelConnector('mock-1');
    expect(connector.capabilities).toEqual({ canPublish: true, canReportMetrics: false });
  });

  it('returns a success result with an incrementing externalId', async () => {
    const connector = new InMemoryMockChannelConnector('mock-1');
    const first = await connector.publish({ text: 'hello' });
    const second = await connector.publish({ text: 'world' });

    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    expect(first.externalId).not.toBe(second.externalId);
  });

  it('records published content for later inspection', async () => {
    const connector = new InMemoryMockChannelConnector('mock-1');
    await connector.publish({ text: 'hello' });
    await connector.publish({ text: 'world', media: ['ref-1'] });

    const published = connector.getPublishedContent();
    expect(published).toHaveLength(2);
    expect(published[0]).toEqual({ text: 'hello' });
    expect(published[1]).toEqual({ text: 'world', media: ['ref-1'] });
  });

  it('scopes published content per connector instance', async () => {
    const connectorA = new InMemoryMockChannelConnector('a');
    const connectorB = new InMemoryMockChannelConnector('b');

    await connectorA.publish({ text: 'only in A' });

    expect(connectorA.getPublishedContent()).toHaveLength(1);
    expect(connectorB.getPublishedContent()).toHaveLength(0);
  });
});
