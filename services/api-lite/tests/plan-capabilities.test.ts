import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  capabilityStatus,
  minPlanFor,
  upgradeTargetFor,
  type CapabilityLevel,
  type CapabilityStatus,
  type PlanCell,
  type PlanKey,
} from '../src/capabilities';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

interface PlanCapabilityView {
  key: string;
  category: string;
  label: string;
  description: string;
  minPlan: PlanKey | null;
  status: CapabilityStatus;
  upgradeTarget: PlanKey | null;
  reason: string | null;
  plans: Record<PlanKey, PlanCell>;
}

interface PlanCapabilitiesResponse {
  plan: PlanKey;
  capabilities: PlanCapabilityView[];
}

const EXPECTED_STATUS: Record<string, { status: CapabilityStatus; minPlan: PlanKey; upgradeTarget: PlanKey | null }> = {
  clientes: { status: 'AVAILABLE', minPlan: 'LITE', upgradeTarget: null },
  vendas: { status: 'AVAILABLE', minPlan: 'LITE', upgradeTarget: null },
  financeiro: { status: 'AVAILABLE', minPlan: 'LITE', upgradeTarget: null },
  importacao: { status: 'LIMITED', minPlan: 'PRO', upgradeTarget: 'PRO' },
  dashboard: { status: 'LIMITED', minPlan: 'FULL', upgradeTarget: 'FULL' },
  mobile: { status: 'LIMITED', minPlan: 'FULL', upgradeTarget: 'FULL' },
  branding: { status: 'LIMITED', minPlan: 'FULL', upgradeTarget: 'FULL' },
  integracoes: { status: 'LIMITED', minPlan: 'FULL', upgradeTarget: 'FULL' },
  migracao: { status: 'LIMITED', minPlan: 'FULL', upgradeTarget: 'FULL' },
};

describe('Travel Lite plan capabilities', () => {
  let lite: LiteFixture;
  let masterToken: string;
  let staffToken: string;
  let viewerToken: string;
  let sellerToken: string;
  let adminBToken: string;

  beforeAll(async () => {
    lite = await createLiteFixture();
    masterToken = await lite.login('tenant-a', 'master@a.test');
    staffToken = await lite.login('tenant-a', 'staff@a.test');
    viewerToken = await lite.login('tenant-a', 'viewer@a.test');
    sellerToken = await lite.login('tenant-a', 'seller1@a.test');
    adminBToken = await lite.login('tenant-b', 'admin@b.test');
  });

  afterAll(async () => {
    await lite?.close();
  });

  function getCapabilities(token?: string, url = '/plan/capabilities') {
    return lite.app.inject({
      method: 'GET',
      url,
      ...(token ? { headers: lite.headers(token) } : {}),
    });
  }

  it('returns the static Lite contract with derived statuses', async () => {
    const response = await getCapabilities(masterToken);
    expect(response.statusCode).toBe(200);

    const body = response.json<PlanCapabilitiesResponse>();
    expect(body.plan).toBe('LITE');
    expect(body.capabilities.map((capability) => capability.key)).toEqual(Object.keys(EXPECTED_STATUS));

    for (const capability of body.capabilities) {
      const expected = EXPECTED_STATUS[capability.key]!;
      expect(capability.status).toBe(expected.status);
      expect(capability.minPlan).toBe(expected.minPlan);
      expect(capability.upgradeTarget).toBe(expected.upgradeTarget);
      expect(capability.category.length).toBeGreaterThan(0);
      expect(capability.label.length).toBeGreaterThan(0);
      expect(capability.description.length).toBeGreaterThan(0);
      expect(capability.reason === null).toBe(capability.status === 'AVAILABLE');
      expect(['LITE', 'PRO', 'FULL']).toEqual(expect.arrayContaining(Object.keys(capability.plans)));
      for (const plan of ['LITE', 'PRO', 'FULL'] as const) {
        expect(['full', 'partial', 'none']).toContain(capability.plans[plan].level);
        expect(capability.plans[plan].label.length).toBeGreaterThan(0);
      }
    }

    const importacao = body.capabilities.find((capability) => capability.key === 'importacao')!;
    expect(importacao.plans.LITE).toEqual({ level: 'partial', label: 'Sim, limitada' });
    expect(importacao.plans.PRO.level).toBe('full');
    const dashboard = body.capabilities.find((capability) => capability.key === 'dashboard')!;
    expect(dashboard.plans.PRO).toEqual({ level: 'partial', label: 'Avançado' });
    const migracao = body.capabilities.find((capability) => capability.key === 'migracao')!;
    expect(migracao.plans.FULL).toEqual({ level: 'full', label: 'Nativo' });
  });

  it('is informative for every authenticated profile', async () => {
    const master = (await getCapabilities(masterToken)).json<PlanCapabilitiesResponse>();
    for (const token of [staffToken, viewerToken, sellerToken]) {
      const response = await getCapabilities(token);
      expect(response.statusCode).toBe(200);
      expect(response.json<PlanCapabilitiesResponse>()).toEqual(master);
    }
  });

  it('requires authentication and works under the /api prefix', async () => {
    expect((await getCapabilities()).statusCode).toBe(401);
    const prefixed = await getCapabilities(masterToken, '/api/plan/capabilities');
    expect(prefixed.statusCode).toBe(200);
    expect(prefixed.json<PlanCapabilitiesResponse>().plan).toBe('LITE');
  });

  it('ignores client-supplied plan or status inputs', async () => {
    const base = (await getCapabilities(masterToken)).json<PlanCapabilitiesResponse>();
    const tampered = await getCapabilities(masterToken, '/plan/capabilities?plan=FULL&status=AVAILABLE');
    expect(tampered.statusCode).toBe(200);
    const body = tampered.json<PlanCapabilitiesResponse>();
    expect(body.plan).toBe('LITE');
    expect(body).toEqual(base);
  });

  it('returns the same contract for every tenant, with no tenant data', async () => {
    const tenantA = await getCapabilities(masterToken);
    const tenantB = await getCapabilities(adminBToken);
    expect(tenantB.statusCode).toBe(200);
    expect(tenantB.json<PlanCapabilitiesResponse>()).toEqual(tenantA.json<PlanCapabilitiesResponse>());
    expect(tenantA.body).not.toContain('tenant-a');
    expect(tenantA.body).not.toContain('@a.test');
    expect(tenantA.body).not.toContain('@b.test');
  });

  describe('status derivation (pure)', () => {
    function plans(lite: CapabilityLevel, pro: CapabilityLevel, full: CapabilityLevel): Record<PlanKey, PlanCell> {
      return {
        LITE: { level: lite, label: lite },
        PRO: { level: pro, label: pro },
        FULL: { level: full, label: full },
      };
    }

    it('derives AVAILABLE, LIMITED, PRO_ONLY and FULL_ONLY from the levels', () => {
      expect(capabilityStatus(plans('full', 'full', 'full'), 'LITE')).toBe('AVAILABLE');
      expect(capabilityStatus(plans('partial', 'full', 'full'), 'LITE')).toBe('LIMITED');
      expect(capabilityStatus(plans('partial', 'partial', 'full'), 'PRO')).toBe('LIMITED');
      expect(capabilityStatus(plans('none', 'partial', 'full'), 'LITE')).toBe('PRO_ONLY');
      expect(capabilityStatus(plans('none', 'none', 'full'), 'LITE')).toBe('FULL_ONLY');
      expect(capabilityStatus(plans('none', 'none', 'none'), 'LITE')).toBe('FULL_ONLY');
      expect(capabilityStatus(plans('none', 'partial', 'full'), 'PRO')).toBe('LIMITED');
    });

    it('derives minPlan as the first plan with a full level', () => {
      expect(minPlanFor(plans('full', 'full', 'full'))).toBe('LITE');
      expect(minPlanFor(plans('partial', 'full', 'full'))).toBe('PRO');
      expect(minPlanFor(plans('partial', 'partial', 'full'))).toBe('FULL');
      expect(minPlanFor(plans('none', 'none', 'none'))).toBeNull();
    });

    it('derives upgradeTarget per status', () => {
      expect(upgradeTargetFor(plans('full', 'full', 'full'), 'LITE', 'AVAILABLE')).toBeNull();
      expect(upgradeTargetFor(plans('partial', 'full', 'full'), 'LITE', 'LIMITED')).toBe('PRO');
      expect(upgradeTargetFor(plans('partial', 'partial', 'full'), 'LITE', 'LIMITED')).toBe('FULL');
      expect(upgradeTargetFor(plans('none', 'partial', 'full'), 'LITE', 'PRO_ONLY')).toBe('PRO');
      expect(upgradeTargetFor(plans('none', 'none', 'full'), 'LITE', 'FULL_ONLY')).toBe('FULL');
    });
  });
});
