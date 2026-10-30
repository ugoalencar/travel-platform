/** Shapes and pure helpers for commission rules (API: /commission-rules). */
import { formatBRL } from './ui';

export interface RuleVersionJson {
  id?: string;
  version_number: number;
  effective_from: string;
  revised_at?: string;
  reason?: string | null;
  mode: 'PERCENTAGE' | 'FIXED' | 'NONE';
  calculation_base: 'GROSS' | 'MARGIN' | null;
  value: number | null;
  apply_on: 'TOTAL' | 'EXCESS';
  excess_threshold: number | null;
  progressive?: boolean;
  tiers?: TierJson[];
}

export interface TierJson {
  tier_number?: number;
  from_amount: number;
  to_amount: number | null;
  rate: number;
}

export interface RuleJson extends Partial<RuleVersionJson> {
  id: string;
  seller_id: string | null;
  category_id: string | null;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface VersionForm {
  mode: 'PERCENTAGE' | 'FIXED' | 'NONE';
  base: 'GROSS' | 'MARGIN';
  value: string;
  applyOn: 'TOTAL' | 'EXCESS';
  threshold: string;
  progressive: boolean;
  /** Upper limit and rate of each tier; each tier starts where the previous one ends, the last is open ended. */
  tiers: Array<{ upTo: string; rate: string }>;
  effectiveFrom: string;
  reason: string;
}

export function defaultTiers(): VersionForm['tiers'] {
  return [
    { upTo: '', rate: '' },
    { upTo: '', rate: '' },
  ];
}

export function emptyVersionForm(today: string): VersionForm {
  return { mode: 'PERCENTAGE', base: 'GROSS', value: '', applyOn: 'TOTAL', threshold: '', progressive: false, tiers: defaultTiers(), effectiveFrom: today, reason: '' };
}

/** Human summary of a version, e.g. "10% da venda bruta acima de R$ 500,00". */
export function describeVersion(
  v: Pick<RuleVersionJson, 'mode' | 'calculation_base' | 'value' | 'apply_on' | 'excess_threshold' | 'progressive' | 'tiers'>,
): string {
  if (v.mode === 'NONE') return 'Sem regra (comissão fica pendente de regra)';
  if (v.mode === 'FIXED') return `${formatBRL(v.value ?? 0)} fixos por venda`;
  const base = v.calculation_base === 'MARGIN' ? 'da margem' : 'da venda bruta';
  if (v.progressive && v.tiers && v.tiers.length > 0) {
    const bands = v.tiers.map((t) =>
      t.to_amount === null ? `${rateText(t.rate)} acima` : `${rateText(t.rate)} até ${formatBRL(t.to_amount)}`,
    );
    return `Progressiva mensal ${base}: ${bands.join('; ')}`;
  }
  const excess = v.apply_on === 'EXCESS' ? ` acima de ${formatBRL(v.excess_threshold ?? 0)}` : '';
  return `${String(v.value ?? 0).replace('.', ',')}% ${base}${excess}`;
}

function rateText(rate: number): string {
  return `${String(rate).replace('.', ',')}%`;
}

function toNumber(raw: string, label: string): number {
  const normalized = raw.trim().replace(',', '.');
  const value = Number(normalized);
  if (normalized === '' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} deve ser um número maior ou igual a zero.`);
  }
  return value;
}

/** Builds the API body or throws a readable Error (server stays the authority). */
export function buildVersionPayload(form: VersionForm, reasonRequired: boolean): Record<string, unknown> {
  if (!form.effectiveFrom) throw new Error('Informe o início da vigência.');
  const reason = form.reason.trim();
  if (reasonRequired && reason.length < 3) throw new Error('Informe o motivo da revisão (mínimo 3 caracteres).');
  const body: Record<string, unknown> = { mode: form.mode, effective_from: form.effectiveFrom };
  if (reason) body.reason = reason;
  if (form.mode === 'NONE') return body;
  if (form.mode === 'PERCENTAGE' && form.progressive) {
    if (form.tiers.length < 2) throw new Error('A regra progressiva precisa de pelo menos 2 faixas.');
    let from = 0;
    body.progressive = true;
    body.calculation_base = form.base;
    body.tiers = form.tiers.map((tier, index) => {
      const last = index === form.tiers.length - 1;
      const rate = toNumber(tier.rate, `O percentual da faixa ${index + 1}`);
      if (rate > 100) throw new Error(`O percentual da faixa ${index + 1} não pode passar de 100.`);
      const to = last ? null : toNumber(tier.upTo, `O limite da faixa ${index + 1}`);
      if (to !== null && to <= from) throw new Error(`O limite da faixa ${index + 1} deve ser maior que o da faixa anterior.`);
      const entry = { from_amount: from, to_amount: to, rate };
      if (to !== null) from = to;
      return entry;
    });
    return body;
  }
  body.value = toNumber(form.value, form.mode === 'FIXED' ? 'O valor fixo' : 'O percentual');
  if (form.mode === 'FIXED') return body;
  if ((body.value as number) > 100) throw new Error('O percentual não pode passar de 100.');
  body.calculation_base = form.base;
  if (form.applyOn === 'EXCESS') {
    body.apply_on = 'EXCESS';
    body.excess_threshold = toNumber(form.threshold, 'O limite do excedente');
  }
  return body;
}

/** Active rules that apply to a seller: its own rules first, then the agency default. */
export function rulesForSeller(rules: RuleJson[], sellerId: string): RuleJson[] {
  const active = rules.filter((rule) => rule.status === 'ACTIVE');
  const own = active.filter((rule) => rule.seller_id === sellerId);
  if (own.length > 0) return own;
  return active.filter((rule) => rule.seller_id === null && rule.category_id === null);
}

export function ruleSummary(rule: RuleJson): string {
  if (!rule.mode) return rule.name;
  return describeVersion({
    mode: rule.mode,
    calculation_base: rule.calculation_base ?? null,
    value: rule.value ?? null,
    apply_on: rule.apply_on ?? 'TOTAL',
    excess_threshold: rule.excess_threshold ?? null,
    progressive: rule.progressive ?? false,
    tiers: rule.tiers ?? [],
  });
}
