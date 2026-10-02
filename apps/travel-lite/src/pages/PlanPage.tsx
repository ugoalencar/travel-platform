import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCan } from '../auth';
import { useBranding } from '../BrandingProvider';
import {
  FALLBACK_PLAN_CAPABILITIES,
  PLAN_LABELS,
  PLAN_ORDER,
  buildUpgradeSummary,
  fetchPlanCapabilities,
  limitedInPlan,
  upgradeSummary,
  type PlanCapabilitiesResponse,
} from '../planCapabilities';
import { CapabilityMark, PlanBadge } from '../planUi';
import { SuccessNote } from '../ui';

type CopyState = 'idle' | 'copied' | 'manual';

/**
 * "Recursos do plano": what each edition covers. Read-only and the same for
 * every signed-in user. It informs; it does not unlock anything, and nothing
 * here is sent anywhere: the request button only copies a text summary.
 */
export function PlanPage() {
  const { hash } = useLocation();
  const { branding } = useBranding();
  // Who approves an upgrade is still a product decision: until it is made, only
  // the MASTER-level permissions see the "copy summary" action.
  const canRequest = useCan('users.manage', 'permissions.manage');
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [catalog, setCatalog] = useState<PlanCapabilitiesResponse>(FALLBACK_PLAN_CAPABILITIES);
  const summary = buildUpgradeSummary(branding.displayName, catalog.capabilities, catalog.plan);
  const reduced = limitedInPlan(catalog.capabilities, catalog.plan);

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

  useEffect(() => {
    const id = hash.replace(/^#/, '');
    if (id) document.getElementById(id)?.scrollIntoView();
  }, [hash]);

  async function copySummary(): Promise<void> {
    try {
      await navigator.clipboard.writeText(summary);
      setCopyState('copied');
    } catch {
      // No clipboard permission (or none at all): show the text to copy by hand.
      setCopyState('manual');
    }
  }

  return (
    <div className="lite-plan">
      <h1>Recursos do plano</h1>
      <p className="lite-muted">
        Seu plano: <PlanBadge plan={catalog.plan} /> O Lite cobre a operação diária da agência. Alguns recursos existem em
        versões ampliadas nos planos Pro e Full.
      </p>
      <p className="lite-muted">
        Esta tela só informa. Ela não libera nem bloqueia nada: quem pode fazer o quê continua sendo definido pelas
        permissões do seu perfil.
      </p>

      <div className="lite-table-wrap">
        <table className="lite-stack">
          <thead>
            <tr>
              <th>Recurso</th>
              {PLAN_ORDER.map((plan) => (
                <th key={plan} className={plan === catalog.plan ? 'lite-plan-current' : undefined}>
                  {PLAN_LABELS[plan]}
                  {plan === catalog.plan ? <span className="lite-plan-you"> · seu plano</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {catalog.capabilities.map((capability) => (
              <tr key={capability.key} id={capability.key}>
                <td className="lite-card-title" data-label="Recurso">
                  {capability.label}
                  <small className="lite-muted lite-cap-desc">{capability.description}</small>
                </td>
                {PLAN_ORDER.map((plan) => (
                  <td
                    key={plan}
                    data-label={PLAN_LABELS[plan]}
                    className={plan === catalog.plan ? 'lite-plan-current' : undefined}
                  >
                    <CapabilityMark cell={capability.plans[plan]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="lite-muted lite-plan-legend">
        <span aria-hidden="true">✓</span> disponível por completo · <span aria-hidden="true">◐</span> disponível em versão
        reduzida ou intermediária.
      </p>

      <section className="lite-card" id="quando-migrar">
        <h2>Quando faz sentido considerar outro plano</h2>
        <p className="lite-muted">
          O Lite continua completo para clientes, vendas e financeiro básico. Vale conversar sobre Pro ou Full quando a
          agência precisar de mais do que a versão reduzida de:
        </p>
        <ul>
          {reduced.map((capability) => (
            <li key={capability.key}>
              <strong>{capability.label}</strong>: hoje {capability.plans[catalog.plan].label.toLowerCase()};{' '}
              {upgradeSummary(capability, catalog.plan)}.
            </li>
          ))}
        </ul>
      </section>

      <section className="lite-card" id="pedir-informacoes">
        <h2>Quer saber mais sobre outro plano?</h2>
        <p className="lite-muted">
          Valores, limites e condições ainda não estão definidos nesta edição e serão informados pelo responsável
          comercial. Nada é enviado a partir daqui.
        </p>
        {canRequest ? (
          <>
            <div className="form-actions">
              <button type="button" className="btn btn-primary" onClick={() => void copySummary()}>
                Copiar resumo para o responsável
              </button>
            </div>
            {copyState === 'copied' ? (
              <SuccessNote success="Resumo copiado. Envie ao responsável pela agência ou ao comercial." />
            ) : null}
            {copyState === 'manual' ? (
              <label className="field">
                <span>Copie o texto abaixo e envie ao responsável</span>
                <textarea readOnly rows={8} value={summary} onFocus={(event) => event.currentTarget.select()} />
              </label>
            ) : null}
          </>
        ) : (
          <p>Fale com o administrador da agência para pedir informações sobre outros planos.</p>
        )}
        <p className="lite-muted">
          Dúvidas sobre como cada área funciona hoje estão na <Link to="/ajuda#planos">Ajuda</Link>.
        </p>
      </section>
    </div>
  );
}
