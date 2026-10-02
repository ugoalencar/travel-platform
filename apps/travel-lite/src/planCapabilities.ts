/**
 * Lite / Pro / Full capability matrix, as written in
 * docs/travel-lite/product-experience/PLAN-CAPABILITIES.md.
 *
 * This is INFORMATION for the interface, never an entitlement. It does not
 * unlock, lock or hide any protected feature: authorization and any real
 * plan limit are decided by the API. The static matrix is the offline/fallback
 * copy; the live source is GET /plan/capabilities when the API is available.
 * Product still has to define numeric limits, prices and who approves an
 * upgrade, so none of that appears here.
 */
import { api } from './api';

export type PlanKey = 'LITE' | 'PRO' | 'FULL';

/** The edition of this app. Informational only. */
export const CURRENT_PLAN: PlanKey = 'LITE';

export const PLAN_LABELS: Record<PlanKey, string> = {
  LITE: 'Lite',
  PRO: 'Pro',
  FULL: 'Full',
};

export const PLAN_ORDER: readonly PlanKey[] = ['LITE', 'PRO', 'FULL'];

/** `full` = complete form; `partial` = reduced/intermediate; `none` = unavailable in that plan. */
export type CapabilityLevel = 'full' | 'partial' | 'none';

export interface PlanCell {
  level: CapabilityLevel;
  label: string;
}

export interface Capability {
  key: string;
  category?: string;
  label: string;
  /** One objective sentence about what the capability covers. */
  description: string;
  minPlan?: PlanKey | null;
  status?: 'AVAILABLE' | 'LIMITED' | 'PRO_ONLY' | 'FULL_ONLY';
  upgradeTarget?: PlanKey | null;
  reason?: string | null;
  plans: Record<PlanKey, PlanCell>;
}

const full = (label: string): PlanCell => ({ level: 'full', label });
const partial = (label: string): PlanCell => ({ level: 'partial', label });

export const CAPABILITIES: readonly Capability[] = [
  {
    key: 'clientes',
    label: 'Clientes',
    description: 'Carteira de clientes, cadastro e consulta.',
    plans: { LITE: full('Sim'), PRO: full('Sim'), FULL: full('Sim') },
  },
  {
    key: 'vendas',
    label: 'Vendas',
    description: 'Vendas, parcelas e acompanhamento por vendedor.',
    plans: { LITE: full('Sim'), PRO: full('Sim'), FULL: full('Sim') },
  },
  {
    key: 'financeiro',
    label: 'Financeiro básico',
    description: 'Recebimentos, despesas, pagamentos e estornos.',
    plans: { LITE: full('Sim'), PRO: full('Sim'), FULL: full('Sim') },
  },
  {
    key: 'importacao',
    label: 'Importação CSV/XLSX',
    description: 'Carga de planilhas com conferência antes de gravar.',
    plans: { LITE: partial('Sim, limitada'), PRO: full('Sim'), FULL: full('Sim') },
  },
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'Indicadores de vendas, financeiro e equipe.',
    plans: { LITE: partial('Essencial'), PRO: partial('Avançado'), FULL: full('Completo') },
  },
  {
    key: 'mobile',
    label: 'Mobile',
    description: 'Uso pelo celular, com app instalável.',
    plans: {
      LITE: partial('Consulta + cliente rápido'),
      PRO: partial('Operação ampliada'),
      FULL: full('Completo'),
    },
  },
  {
    key: 'branding',
    label: 'Branding',
    description: 'Nome, logo e cores da agência no login e no sistema.',
    plans: { LITE: partial('Básico'), PRO: partial('Avançado'), FULL: full('Completo') },
  },
  {
    key: 'integracoes',
    label: 'Integrações',
    description: 'Conexão com outros sistemas.',
    plans: { LITE: partial('Preparado'), PRO: partial('Parcial'), FULL: full('Completo') },
  },
  {
    key: 'migracao',
    label: 'Migração para o Full',
    description: 'Levar os dados do Lite para o Full.',
    plans: { LITE: partial('Readiness'), PRO: partial('Assistida'), FULL: full('Nativo') },
  },
];

export function capabilityByKey(key: string): Capability | undefined {
  return CAPABILITIES.find((capability) => capability.key === key);
}

export function capabilityByKeyIn(capabilities: readonly Capability[], key: string): Capability | undefined {
  return capabilities.find((capability) => capability.key === key);
}

/** Capabilities that, in the given plan, exist in a reduced form. */
export function limitedInPlan(capabilities: readonly Capability[] = CAPABILITIES, plan: PlanKey = CURRENT_PLAN): Capability[] {
  return capabilities.filter((capability) => capability.plans[plan].level === 'partial');
}

/** Capabilities that, in the current plan, exist in a reduced form. */
export function limitedInCurrentPlan(): Capability[] {
  return limitedInPlan(CAPABILITIES, CURRENT_PLAN);
}

/** "No Pro: Avançado · no Full: Completo" for a capability that is reduced in the current plan. */
export function upgradeSummary(capability: Capability, currentPlan: PlanKey = CURRENT_PLAN): string {
  const larger = PLAN_ORDER.filter((plan) => PLAN_ORDER.indexOf(plan) > PLAN_ORDER.indexOf(currentPlan));
  return larger.map((plan) => `no ${PLAN_LABELS[plan]}: ${capability.plans[plan].label}`).join(' · ');
}

/** Plain-text summary a MASTER can copy and hand to whoever handles plans. No data leaves the app. */
export function buildUpgradeSummary(
  agencyName: string | null,
  capabilities: readonly Capability[] = CAPABILITIES,
  currentPlan: PlanKey = CURRENT_PLAN,
): string {
  const lines = limitedInPlan(capabilities, currentPlan).map(
    (capability) =>
      `- ${capability.label}: ${capability.plans[currentPlan].label} (${upgradeSummary(capability, currentPlan)})`,
  );
  return [
    `Pedido de informações sobre planos${agencyName ? ` — ${agencyName}` : ''}`,
    `Plano atual: ${PLAN_LABELS[currentPlan]}`,
    'Recursos de interesse (hoje em versão reduzida no plano atual):',
    ...lines,
    'Valores, limites e condições: a combinar com o responsável comercial.',
  ].join('\n');
}

export interface PlanCapabilitiesResponse {
  plan: PlanKey;
  capabilities: readonly Capability[];
}

export const FALLBACK_PLAN_CAPABILITIES: PlanCapabilitiesResponse = {
  plan: CURRENT_PLAN,
  capabilities: CAPABILITIES,
};

export async function fetchPlanCapabilities(): Promise<PlanCapabilitiesResponse> {
  return api<PlanCapabilitiesResponse>('/plan/capabilities');
}
