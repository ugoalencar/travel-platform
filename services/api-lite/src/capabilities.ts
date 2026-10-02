/**
 * Lite / Pro / Full capability contract (PX5), mirroring the matrix in
 * docs/travel-lite/product-experience/PLAN-CAPABILITIES.md and the keys
 * the frontend already uses (apps/travel-lite/src/planCapabilities.ts).
 *
 * Capabilities are INFORMATION for the interface, never an entitlement:
 * they never grant, replace or weaken requirePermission, and any real
 * limit stays server-side. The current plan is a server-side constant
 * (LITE) — not a tenant column, not frontend input — so nothing editable
 * can reframe the response. Persisting a per-tenant plan would require a
 * migration and must be proposed, not implemented (PX5 rules).
 */

export type PlanKey = 'LITE' | 'PRO' | 'FULL';

/** `full` = complete form for that plan; `partial` = reduced/intermediate; `none` = not included. */
export type CapabilityLevel = 'full' | 'partial' | 'none';

export type CapabilityStatus = 'AVAILABLE' | 'LIMITED' | 'PRO_ONLY' | 'FULL_ONLY';

export const PLAN_ORDER: readonly PlanKey[] = ['LITE', 'PRO', 'FULL'];

/** The edition this API reports. Static; never derived from client or tenant data. */
export const CURRENT_PLAN: PlanKey = 'LITE';

export interface PlanCell {
  level: CapabilityLevel;
  label: string;
}

export interface Capability {
  key: string;
  category: string;
  label: string;
  description: string;
  /** Why the capability is reduced in the current plan; null when it is complete. */
  reason: string | null;
  plans: Record<PlanKey, PlanCell>;
}

export interface PlanCapabilityView {
  key: string;
  category: string;
  label: string;
  description: string;
  /** First plan where the capability is complete (null if none). */
  minPlan: PlanKey | null;
  status: CapabilityStatus;
  /** Plan that unlocks/complete the capability for the current plan; null when AVAILABLE. */
  upgradeTarget: PlanKey | null;
  reason: string | null;
  plans: Record<PlanKey, PlanCell>;
}

export interface PlanCapabilitiesResponse {
  plan: PlanKey;
  capabilities: PlanCapabilityView[];
}

const full = (label: string): PlanCell => ({ level: 'full', label });
const partial = (label: string): PlanCell => ({ level: 'partial', label });

export const CAPABILITIES: readonly Capability[] = [
  {
    key: 'clientes',
    category: 'Operações',
    label: 'Clientes',
    description: 'Carteira de clientes, cadastro e consulta.',
    reason: null,
    plans: { LITE: full('Sim'), PRO: full('Sim'), FULL: full('Sim') },
  },
  {
    key: 'vendas',
    category: 'Operações',
    label: 'Vendas',
    description: 'Vendas, parcelas e acompanhamento por vendedor.',
    reason: null,
    plans: { LITE: full('Sim'), PRO: full('Sim'), FULL: full('Sim') },
  },
  {
    key: 'financeiro',
    category: 'Financeiro',
    label: 'Financeiro básico',
    description: 'Recebimentos, despesas, pagamentos e estornos.',
    reason: null,
    plans: { LITE: full('Sim'), PRO: full('Sim'), FULL: full('Sim') },
  },
  {
    key: 'importacao',
    category: 'Operações',
    label: 'Importação CSV/XLSX',
    description: 'Carga de planilhas com conferência antes de gravar.',
    reason: 'No Lite a importação é limitada; o plano Pro traz a importação completa.',
    plans: { LITE: partial('Sim, limitada'), PRO: full('Sim'), FULL: full('Sim') },
  },
  {
    key: 'dashboard',
    category: 'Visão geral',
    label: 'Dashboard',
    description: 'Indicadores de vendas, financeiro e equipe.',
    reason: 'O Lite mostra a visão essencial; o plano Full reúne o painel completo.',
    plans: { LITE: partial('Essencial'), PRO: partial('Avançado'), FULL: full('Completo') },
  },
  {
    key: 'mobile',
    category: 'Experiência',
    label: 'Mobile',
    description: 'Uso pelo celular, com app instalável.',
    reason: 'No Lite o celular cobre consulta e cliente rápido; a operação ampliada está nos planos maiores.',
    plans: {
      LITE: partial('Consulta + cliente rápido'),
      PRO: partial('Operação ampliada'),
      FULL: full('Completo'),
    },
  },
  {
    key: 'branding',
    category: 'Experiência',
    label: 'Branding',
    description: 'Nome, logo e cores da agência no login e no sistema.',
    reason: 'O Lite aplica a identidade básica da agência; personalizações avançadas estão nos planos maiores.',
    plans: { LITE: partial('Básico'), PRO: partial('Avançado'), FULL: full('Completo') },
  },
  {
    key: 'integracoes',
    category: 'Plataforma',
    label: 'Integrações',
    description: 'Conexão com outros sistemas.',
    reason: 'No Lite os eventos ficam preparados para integração, sem consumo ativo; o plano Full conclui a integração.',
    plans: { LITE: partial('Preparado'), PRO: partial('Parcial'), FULL: full('Completo') },
  },
  {
    key: 'migracao',
    category: 'Plataforma',
    label: 'Migração para o Full',
    description: 'Levar os dados do Lite para o Full.',
    reason: 'No Lite há a verificação de prontidão; o Pro migra com assistência e o Full tem migração nativa.',
    plans: { LITE: partial('Readiness'), PRO: partial('Assistida'), FULL: full('Nativo') },
  },
];

/** Status of a capability as seen from `plan`. Pure — unit-tested with synthetic `none` levels. */
export function capabilityStatus(plans: Record<PlanKey, PlanCell>, plan: PlanKey): CapabilityStatus {
  const level = plans[plan].level;
  if (level === 'full') return 'AVAILABLE';
  if (level === 'partial') return 'LIMITED';
  const startIndex = PLAN_ORDER.indexOf(plan) + 1;
  for (let index = startIndex; index < PLAN_ORDER.length; index += 1) {
    const candidate = PLAN_ORDER[index]!;
    if (plans[candidate].level !== 'none') {
      return candidate === 'PRO' ? 'PRO_ONLY' : 'FULL_ONLY';
    }
  }
  return 'FULL_ONLY';
}

/** First plan where the capability is complete; null when no plan completes it. */
export function minPlanFor(plans: Record<PlanKey, PlanCell>): PlanKey | null {
  return PLAN_ORDER.find((plan) => plans[plan].level === 'full') ?? null;
}

/** Where to go from `plan` to complete/ unlock the capability; null when it is already AVAILABLE. */
export function upgradeTargetFor(
  plans: Record<PlanKey, PlanCell>,
  plan: PlanKey,
  status: CapabilityStatus,
): PlanKey | null {
  if (status === 'AVAILABLE') return null;
  if (status === 'PRO_ONLY') return 'PRO';
  if (status === 'FULL_ONLY') return 'FULL';
  const startIndex = PLAN_ORDER.indexOf(plan) + 1;
  for (let index = startIndex; index < PLAN_ORDER.length; index += 1) {
    const candidate = PLAN_ORDER[index]!;
    if (plans[candidate].level === 'full') return candidate;
  }
  return null;
}

/** Read-only capabilities of the current plan. Pure static derivation — no DB, no request input. */
export function buildPlanCapabilities(): PlanCapabilitiesResponse {
  return {
    plan: CURRENT_PLAN,
    capabilities: CAPABILITIES.map((capability) => {
      const status = capabilityStatus(capability.plans, CURRENT_PLAN);
      return {
        key: capability.key,
        category: capability.category,
        label: capability.label,
        description: capability.description,
        minPlan: minPlanFor(capability.plans),
        status,
        upgradeTarget: upgradeTargetFor(capability.plans, CURRENT_PLAN, status),
        reason: capability.reason,
        plans: capability.plans,
      };
    }),
  };
}
