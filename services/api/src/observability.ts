import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getOptionalTenantContext } from '../../../packages/domain/tenant-context';

// ============================================================
// OBSERVABILITY: correlation IDs + structured request logging + metrics.
//
// Spec: docs/travel_platform_ops_security_pack/support/OBSERVABILITY.md
// Every request log line must carry:
//   requestId, correlationId, tenantId, userId, route, method, status,
//   duration, errorCode, deploymentId
//
// Never logged: password, token, full documents, full passport/CPF,
// bank data. This module never receives or logs request/response bodies
// -- only request metadata -- so it cannot leak those fields by
// construction.
// ============================================================

const REQUEST_ID_HEADER = 'x-request-id';
const CORRELATION_ID_HEADER = 'x-correlation-id';

export function resolveDeploymentId(env: NodeJS.ProcessEnv = process.env): string {
  return env.DEPLOYMENT_ID ?? env.RENDER_GIT_COMMIT ?? env.VERCEL_GIT_COMMIT_SHA ?? 'local';
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

declare module 'fastify' {
  interface FastifyRequest {
    requestId?: string;
    correlationId?: string;
    observedStartTime?: bigint;
  }
}

// ============================================================
// METRICS: lightweight in-process counters. No external dependency --
// intentionally not a full Prometheus client, per the dispatch brief
// ("in-process counters are fine, no need for a full Prometheus
// integration unless one is trivially available already"). None was
// found as an existing dependency (see package.json audit).
// ============================================================

export interface MetricsSnapshot {
  requestsTotal: number;
  statusClassCounts: Record<'2xx' | '3xx' | '4xx' | '5xx', number>;
  latencyMs: { p50: number; p95: number; p99: number; max: number };
  routeCounts: Record<string, number>;
  windowSize: number;
}

const MAX_SAMPLES = 2000;

export class MetricsCollector {
  private requestsTotal = 0;
  private statusClassCounts: Record<'2xx' | '3xx' | '4xx' | '5xx', number> = {
    '2xx': 0,
    '3xx': 0,
    '4xx': 0,
    '5xx': 0,
  };
  private latencySamples: number[] = [];
  private routeCounts = new Map<string, number>();

  record(routeKey: string, statusCode: number, durationMs: number): void {
    this.requestsTotal += 1;

    const cls = statusClass(statusCode);
    this.statusClassCounts[cls] += 1;

    this.routeCounts.set(routeKey, (this.routeCounts.get(routeKey) ?? 0) + 1);

    this.latencySamples.push(durationMs);
    if (this.latencySamples.length > MAX_SAMPLES) {
      this.latencySamples.shift();
    }
  }

  snapshot(): MetricsSnapshot {
    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    return {
      requestsTotal: this.requestsTotal,
      statusClassCounts: { ...this.statusClassCounts },
      latencyMs: {
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        p99: percentile(sorted, 0.99),
        max: sorted.length > 0 ? (sorted[sorted.length - 1] ?? 0) : 0,
      },
      routeCounts: Object.fromEntries(this.routeCounts),
      windowSize: sorted.length,
    };
  }
}

function statusClass(statusCode: number): '2xx' | '3xx' | '4xx' | '5xx' {
  if (statusCode >= 500) return '5xx';
  if (statusCode >= 400) return '4xx';
  if (statusCode >= 300) return '3xx';
  return '2xx';
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.max(0, idx)] ?? 0;
}

export interface RegisterObservabilityOptions {
  deploymentId?: string;
  dbPoolStats?: () => { total: number; idle: number; waiting: number } | undefined;
}

/**
 * Registers correlation-ID propagation, structured per-request logging,
 * and in-process metrics collection. Returns the MetricsCollector so a
 * /metrics route can read a snapshot.
 */
export function registerObservability(
  app: FastifyInstance,
  options: RegisterObservabilityOptions = {},
): MetricsCollector {
  const metrics = new MetricsCollector();
  const deploymentId = options.deploymentId ?? resolveDeploymentId();

  app.addHook('onRequest', (request: FastifyRequest, reply: FastifyReply, done) => {
    const incomingRequestId = headerValue(request.headers[REQUEST_ID_HEADER]);
    const incomingCorrelationId = headerValue(request.headers[CORRELATION_ID_HEADER]);

    // request.id is Fastify's own per-request id (reqId) -- reuse it as
    // the default requestId so it lines up with pino's default reqId
    // field, but let an inbound header override (a client/frontend that
    // already minted one, e.g. to correlate a bug report) rather than
    // always minting a fresh one server-side.
    const requestId = incomingRequestId ?? request.id;
    const correlationId = incomingCorrelationId ?? requestId;

    request.requestId = requestId;
    request.correlationId = correlationId;
    request.observedStartTime = process.hrtime.bigint();

    reply.header(REQUEST_ID_HEADER, requestId);
    reply.header(CORRELATION_ID_HEADER, correlationId);

    done();
  });

  app.addHook('onResponse', (request: FastifyRequest, reply: FastifyReply, done) => {
    const startTime = request.observedStartTime;
    const durationMs = startTime
      ? Number(process.hrtime.bigint() - startTime) / 1_000_000
      : reply.elapsedTime;

    const tenantContext = getOptionalTenantContext();
    const routeKey = request.routeOptions?.url ?? request.url;
    const errorCode = request.observedErrorCode;

    metrics.record(routeKey, reply.statusCode, durationMs);

    request.log.info(
      {
        requestId: request.requestId,
        correlationId: request.correlationId,
        tenantId: tenantContext?.agencyId ?? null,
        userId: tenantContext?.userId ?? null,
        route: routeKey,
        method: request.method,
        status: reply.statusCode,
        duration: Math.round(durationMs),
        errorCode: errorCode ?? null,
        deploymentId,
      },
      'request completed',
    );

    done();
  });

  return metrics;
}
