import { HttpError, ValidationError } from './errors';

const STATES = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const MAX_BYTES = 16384;
const TTL = 86400000;

export function normalizeCep(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{5}-?\d{3}$/.test(value.trim())) {
    throw new ValidationError('Informe um CEP com 8 digitos.');
  }
  return value.trim().replace('-', '');
}

export function normalizeCustomerCep(value: unknown, previous?: string | null): string | null {
  if (value === null || value === '') return null;
  if (previous !== undefined && value === previous) return previous;
  const digits = normalizeCep(value);
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export interface CepResult {
  status: 'ok' | 'generic';
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  source: 'viacep';
}

interface Options {
  fetcher?: typeof fetch;
  now?: () => number;
  cacheLimit?: number;
  enabled?: boolean;
}

/** Instance-local limits; no customer data or lookup payloads are logged. */
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

  constructor(options: Options = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.cacheLimit = Math.max(1, options.cacheLimit ?? 500);
    this.enabled = options.enabled ?? true;
  }

  async lookup(value: unknown, principal: string): Promise<CepResult> {
    const cep = normalizeCep(value);
    if (!this.enabled) throw new HttpError(503, 'CEP_DISABLED', 'Consulta de CEP nao habilitada. Preencha o endereco manualmente.');
    const now = this.now();
    if (now >= this.windowEnd) {
      this.principals.clear();
      this.outbound = 0;
      this.windowEnd = now + 60000;
    }
    const count = this.principals.get(principal) ?? 0;
    if (count >= 10 || (!this.principals.has(principal) && this.principals.size >= 1000)) this.throttled();
    this.principals.set(principal, count + 1);
    const cached = this.cache.get(cep);
    if (cached && cached.expires > now) return { ...cached.result };
    this.cache.delete(cep);
    const pending = this.pending.get(cep);
    if (pending) return pending;
    if (this.outbound >= 60 || this.pending.size >= 10) this.throttled();
    this.outbound++;
    const request = this.fetchAddress(cep).then((result) => {
      if (this.cache.size >= this.cacheLimit) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(cep, { expires: this.now() + TTL, result });
      return { ...result };
    }).finally(() => this.pending.delete(cep));
    this.pending.set(cep, request);
    return request;
  }

  private throttled(): never {
    throw new HttpError(429, 'CEP_RATE_LIMIT', 'Limite de consultas de CEP atingido. Aguarde um minuto.');
  }

  private async fetchAddress(cep: string): Promise<CepResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const invalid = () => new HttpError(502, 'CEP_INVALID_RESPONSE', 'Resposta de CEP invalida. Preencha o endereco manualmente.');
    try {
      const response = await this.fetcher(`https://viacep.com.br/ws/${cep}/json/`, {
        signal: controller.signal, redirect: 'error', headers: { accept: 'application/json' },
      });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
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
          if (bytes > MAX_BYTES) { await reader.cancel(); throw invalid(); }
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      let data: unknown;
      try {
        data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        throw invalid();
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalid();
      const row = data as Record<string, unknown>;
      if (row.erro === true || row.erro === 'true') throw new HttpError(404, 'CEP_NOT_FOUND', 'CEP nao encontrado. Preencha o endereco manualmente.');
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
        if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f]/.test(value)) throw invalid();
        if (required && !value.trim()) throw invalid();
        return value.trim();
      };
      const street = field('logradouro', 200);
      const state = field('uf', 2, true);
      if (!STATES.has(state)) throw invalid();
      return { status: street ? 'ok' : 'generic', street, neighborhood: field('bairro', 100),
        city: field('localidade', 100, true), state, source: 'viacep' };
    } catch (error) {
      if (controller.signal.aborted) throw new HttpError(504, 'CEP_TIMEOUT', 'Consulta de CEP indisponivel. Tente novamente ou preencha manualmente.');
      if (error instanceof HttpError && error.code !== 'VALIDATION_ERROR') throw error;
      throw new HttpError(502, 'CEP_UNAVAILABLE', 'Consulta de CEP indisponivel. Tente novamente ou preencha manualmente.');
    } finally { clearTimeout(timer); }
  }
}
