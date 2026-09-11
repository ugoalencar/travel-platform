import { isIP } from 'node:net';
import { promises as dns } from 'node:dns';
import { ValidationError } from './errors';

/**
 * Shared SSRF defenses for any code path that fetches a URL supplied (directly
 * or indirectly) by a tenant user — currently the Pescador offer-capture
 * "extract from URL" flow. Blocks requests to loopback, private/reserved,
 * link-local, and cloud-metadata address ranges, and re-validates the
 * resolved IP on every redirect hop to defend against DNS rebinding
 * (resolve-then-connect races where the hostname resolves to a safe IP at
 * validation time but a different, private IP at connect time).
 */

export class SsrfBlockedError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

const IPV4_METADATA = '169.254.169.254';

/** RFC1918 / loopback / link-local / reserved IPv4 ranges, expressed as [network, prefixLength]. */
const BLOCKED_IPV4_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local incl. cloud metadata
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map((part) => Number.parseInt(part, 10));
  return ((parts[0] ?? 0) << 24) | ((parts[1] ?? 0) << 16) | ((parts[2] ?? 0) << 8) | (parts[3] ?? 0);
}

function isBlockedIPv4(ip: string): boolean {
  const target = ipv4ToInt(ip) >>> 0;
  return BLOCKED_IPV4_RANGES.some(([network, prefix]) => {
    const netInt = ipv4ToInt(network) >>> 0;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (target & mask) === (netInt & mask);
  });
}

function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  // IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) — validate the embedded IPv4.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped?.[1]) return isBlockedIPv4(mapped[1]);
  // Unique local addresses fc00::/7
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true;
  // Link-local fe80::/10 (covers the IPv6 metadata address fe80::a9fe:a9fe and similar)
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true;
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedIPv4(ip);
  if (family === 6) return isBlockedIPv6(ip);
  return true; // not a valid IP literal -> reject rather than silently allow
}

export interface ResolvedTarget {
  hostname: string;
  address: string;
  family: number;
}

/**
 * Resolves a hostname to a concrete IP and validates it against the SSRF
 * blocklist. Callers must use the returned `address` to connect (or at least
 * re-validate immediately before connecting) rather than re-resolving the
 * hostname later, to close the DNS-rebinding TOCTOU window.
 */
export async function resolveAndValidateHost(hostname: string): Promise<ResolvedTarget> {
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    if (isBlockedIp(hostname)) {
      throw new SsrfBlockedError(`Destino não permitido: endereço IP privado/reservado (${hostname})`);
    }
    return { hostname, address: hostname, family: literalFamily };
  }

  let lookup: { address: string; family: number };
  try {
    lookup = await dns.lookup(hostname);
  } catch {
    throw new SsrfBlockedError(`Não foi possível resolver o host "${hostname}"`);
  }
  if (isBlockedIp(lookup.address)) {
    throw new SsrfBlockedError(
      `Destino não permitido: "${hostname}" resolve para um endereço privado/reservado (${lookup.address})`,
    );
  }
  return { hostname, address: lookup.address, family: lookup.family };
}

export function assertPublicHttpUrl(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('Field "url" must use http or https');
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === IPV4_METADATA) {
    throw new SsrfBlockedError(`Destino não permitido: "${hostname}"`);
  }
}
