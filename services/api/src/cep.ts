import { ValidationError } from './errors';

const STATES = new Set(
  'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '),
);
const MAX_BYTES = 16384;
const CACHE_TTL_MS = 86400000;
const RATE_WINDOW_MS = 60000;
const MAX_LOOKUPS_PER_PRINCIPAL = 10;
const MAX_OUTBOUND_PER_WINDOW = 60;
const MAX_CONCURRENT_LOOKUPS = 10;
const MAX_PRINCIPALS = 1000;
const FETCH_TIMEOUT_MS = 3000;

export class CepError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'CepError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function normalizeCep(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{5}-?\d{3}$/.test(value.trim())) {
    throw new ValidationError('Informe um CEP com 8 dígitos.');
  }
  return value.trim().replace('-', '');
}

export function resolveCepProviderEnabled(env: {
  NODE_ENV?: string | undefined;
  TRAVEL_API_CEP_PROVIDER?: string | undefined;
}): boolean {
  const provider = env.TRAVEL_API_CEP_PROVIDER?.trim().toLowerCase();
  if (provider === 'viacep') return true;
  if (provider === 'disabled') return false;
  if (provider) return false;
  return env.NODE_ENV !== 'production';
}

export interface CepResult {
  status: 'ok' | 'generic';
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  source: 'viacep';
}

export interface CepLookupOptions {
  fetcher?: typeof fetch;
  now?: () => number;
  cacheLimit?: number;
  enabled?: boolean;
}

export class CepLookup {
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly cacheLimit: number;
  private readonly enabled: boolean;
  private readonly cache = new Map<string, { expires: number; result: CepResult }>();
  private readonly pending = new Map<string, Promise<CepResult>>();
  private readonly principals = new Map<string, number>();
  private windowEnd = 0;
  private outbound = 0;

  constructor(options: CepLookupOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.cacheLimit = Math.max(1, options.cacheLimit ?? 500);
    this.enabled = options.enabled ?? false;
  }

  async lookup(value: unknown, principal: string): Promise<CepResult> {
    const cep = normalizeCep(value);
    if (!this.enabled) {
      throw new CepError(
        503,
        'CEP_DISABLED',
        'Consulta de CEP não habilitada. Preencha o endereço manualmente.',
      );
    }
    const now = this.now();
    if (now >= this.windowEnd) {
      this.principals.clear();
      this.outbound = 0;
      this.windowEnd = now + RATE_WINDOW_MS;
    }
    const count = this.principals.get(principal) ?? 0;
    if (
      count >= MAX_LOOKUPS_PER_PRINCIPAL ||
      (!this.principals.has(principal) && this.principals.size >= MAX_PRINCIPALS)
    ) {
      this.throttled();
    }
    this.principals.set(principal, count + 1);

    const cached = this.cache.get(cep);
    if (cached && cached.expires > now) return { ...cached.result };
    this.cache.delete(cep);

    const pending = this.pending.get(cep);
    if (pending) return pending;
    if (
      this.outbound >= MAX_OUTBOUND_PER_WINDOW ||
      this.pending.size >= MAX_CONCURRENT_LOOKUPS
    ) {
      this.throttled();
    }
    this.outbound++;
    const request = this.fetchAddress(cep)
      .then((result) => {
        if (this.cache.size >= this.cacheLimit) {
          const oldest = this.cache.keys().next();
          if (!oldest.done) this.cache.delete(oldest.value);
        }
        this.cache.set(cep, { expires: this.now() + CACHE_TTL_MS, result });
        return { ...result };
      })
      .finally(() => this.pending.delete(cep));
    this.pending.set(cep, request);
    return request;
  }

  private throttled(): never {
    throw new CepError(
      429,
      'CEP_RATE_LIMIT',
      'Limite de consultas de CEP atingido. Aguarde um minuto.',
    );
  }

  private async fetchAddress(cep: string): Promise<CepResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const invalid = () =>
      new CepError(
        502,
        'CEP_INVALID_RESPONSE',
        'Resposta de CEP inválida. Preencha o endereço manualmente.',
      );
    try {
      const response = await this.fetcher(
        `https://viacep.com.br/ws/${cep}/json/`,
        {
          signal: controller.signal,
          redirect: 'error',
          headers: { accept: 'application/json' },
        },
      );
      const contentType = response.headers.get('content-type')?.toLowerCase();
      if (!response.ok || !contentType?.includes('application/json')) {
        await response.body?.cancel();
        throw invalid();
      }
      const reader = response.body?.getReader();
      if (!reader) throw invalid();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > MAX_BYTES) {
            await reader.cancel();
            throw invalid();
          }
          chunks.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      let data: unknown;
      try {
        data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        throw invalid();
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalid();
      const row = data as Record<string, unknown>;
      if (row.erro === true || row.erro === 'true') {
        throw new CepError(
          404,
          'CEP_NOT_FOUND',
          'CEP não encontrado. Preencha o endereço manualmente.',
        );
      }
      let upstreamCep: string;
      try {
        upstreamCep = normalizeCep(row.cep);
      } catch {
        throw invalid();
      }
      if (upstreamCep !== cep) throw invalid();
      const field = (name: string, max: number, required = false): string => {
        const value = row[name];
        if (value === undefined && !required) return '';
        if (
          typeof value !== 'string' ||
          value.length > max ||
          /[\u0000-\u001f]/.test(value)
        ) {
          throw invalid();
        }
        if (required && !value.trim()) throw invalid();
        return value.trim();
      };
      const street = field('logradouro', 200);
      const state = field('uf', 2, true);
      if (!STATES.has(state)) throw invalid();
      return {
        status: street ? 'ok' : 'generic',
        street,
        neighborhood: field('bairro', 100),
        city: field('localidade', 100, true),
        state,
        source: 'viacep',
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new CepError(
          504,
          'CEP_TIMEOUT',
          'Consulta de CEP indisponível. Tente novamente ou preencha manualmente.',
        );
      }
      if (error instanceof CepError) throw error;
      throw new CepError(
        502,
        'CEP_UNAVAILABLE',
        'Consulta de CEP indisponível. Tente novamente ou preencha manualmente.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
