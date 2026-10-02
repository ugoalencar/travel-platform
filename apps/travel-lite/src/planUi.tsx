import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FALLBACK_PLAN_CAPABILITIES,
  PLAN_LABELS,
  capabilityByKeyIn,
  fetchPlanCapabilities,
  upgradeSummary,
  type PlanCell,
  type PlanKey,
} from './planCapabilities';

/** Discreet chip naming a plan ("Pro", "Full"). Purely a label. */
export function PlanBadge({ plan }: { plan: PlanKey }) {
  return <span className={`lite-plan-badge plan-${plan.toLowerCase()}`}>{PLAN_LABELS[plan]}</span>;
}

/** A matrix cell: available in full (✓) or in a reduced form (◐), with the label as text. */
export function CapabilityMark({ cell }: { cell: PlanCell }) {
  const full = cell.level === 'full';
  return (
    <span className={full ? 'lite-cap lite-cap-full' : 'lite-cap lite-cap-partial'}>
      <span aria-hidden="true">{full ? '✓' : '◐'}</span> {cell.label}
      {full ? null : <span className="visually-hidden"> (versão reduzida)</span>}
    </span>
  );
}

/**
 * One quiet line telling where a capability that is reduced in the current plan
 * grows. It informs and links to the plan screen; it never disables a control,
 * blocks a task or asks for anything.
 */
export function PlanHint({ capabilityKey }: { capabilityKey: string }) {
  const [catalog, setCatalog] = useState(FALLBACK_PLAN_CAPABILITIES);

  useEffect(() => {
    let alive = true;
    fetchPlanCapabilities()
      .then((response) => {
        if (alive) setCatalog(response);
      })
      .catch(() => {
        if (alive) setCatalog(FALLBACK_PLAN_CAPABILITIES);
      });
    return () => {
      alive = false;
    };
  }, []);

  const capability = capabilityByKeyIn(catalog.capabilities, capabilityKey);
  if (!capability || capability.plans[catalog.plan].level === 'full') return null;
  return (
    <p className="lite-plan-hint" data-capability={capability.key}>
      <PlanBadge plan="PRO" /> <PlanBadge plan="FULL" />{' '}
      <span>
        {capability.label} no plano {PLAN_LABELS[catalog.plan]}: {capability.plans[catalog.plan].label}. Em planos maiores:{' '}
        {upgradeSummary(capability, catalog.plan)}.
      </span>{' '}
      <Link to={`/plano#${capability.key}`}>Ver recursos do plano</Link>
    </p>
  );
}
