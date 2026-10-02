import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { useCan } from './auth';

export const HELP_SEEN_KEY = 'travel_lite_help_seen';

interface CheckLine {
  key: string;
  ok: boolean;
  pending: string;
  example: string;
  done: string;
  to: string;
  cta: string;
  canCta: boolean;
  helpTo: string;
}

function helpLine(): CheckLine {
  return {
    key: 'help',
    ok: window.localStorage.getItem(HELP_SEEN_KEY) === '1',
    pending: 'Abra a Ajuda para conhecer as áreas e os erros comuns.',
    example: 'Ex.: leia “Primeiros passos” e “Vendas”.',
    done: 'Ajuda consultada',
    to: '/ajuda',
    cta: 'Abrir a ajuda',
    canCta: true,
    helpTo: '',
  };
}

export function FirstRunChecklist() {
  const canCatalog = useCan('settings.manage');
  const canSellersRead = useCan('sellers.read');
  const canSellersManage = useCan('sellers.manage');
  const canCustomerCreate = useCan('customers.create');
  const canSalesCreate = useCan('sales.create');
  const [lines, setLines] = useState<CheckLine[] | null>(null);

  useEffect(() => {
    let active = true;
    const checks: Array<Promise<CheckLine>> = [];
    if (canSellersRead) {
      checks.push(
        api<{ total: number }>('/sellers?pageSize=1').then((response) => ({
          key: 'seller',
          ok: response.total > 0,
          pending: 'Cadastre quem vende e a regra de comissão.',
          example: 'Ex.: Ana Souza — 5% sobre o bruto.',
          done: 'Vendedores cadastrados',
          to: '/vendedores',
          cta: 'Ir para Vendedores',
          canCta: canSellersManage,
          helpTo: '/ajuda#vendedores',
        })),
      );
    }
    if (canCatalog) {
      checks.push(
        api<{ items: unknown[] }>('/financial-accounts').then((response) => ({
          key: 'account',
          ok: response.items.length > 0,
          pending: 'Cadastre uma conta financeira para receber e pagar.',
          example: 'Ex.: Banco do Brasil — CC 1234.',
          done: 'Conta financeira cadastrada',
          to: '/cadastros',
          cta: 'Ir para Cadastros',
          canCta: true,
          helpTo: '/ajuda#financeiro',
        })),
        api<{ items: unknown[] }>('/categories').then((response) => ({
          key: 'category',
          ok: response.items.length > 0,
          pending: 'Cadastre ao menos uma categoria de venda.',
          example: 'Ex.: Passagens aéreas.',
          done: 'Categorias de venda cadastradas',
          to: '/cadastros',
          cta: 'Ir para Cadastros',
          canCta: true,
          helpTo: '/ajuda#vendas',
        })),
      );
    }
    if (canCustomerCreate) {
      checks.push(
        api<{ total: number }>('/customers?pageSize=1').then((response) => ({
          key: 'customer',
          ok: response.total > 0,
          pending: 'Cadastre o primeiro cliente da carteira.',
          example: 'Ex.: Maria Souza — (11) 98888-7777.',
          done: 'Cliente cadastrado',
          to: '/clientes',
          cta: 'Ir para Clientes',
          canCta: true,
          helpTo: '/ajuda#clientes',
        })),
      );
    }
    if (canSalesCreate) {
      checks.push(
        api<{ total: number }>('/sales?pageSize=1').then((response) => ({
          key: 'sale',
          ok: response.total > 0,
          pending: 'Registre a primeira venda do sistema.',
          example: 'Ex.: VND-0001 — Maria Souza, R$ 2.400,00.',
          done: 'Primeira venda registrada',
          to: '/vendas',
          cta: 'Ir para Vendas',
          canCta: true,
          helpTo: '/ajuda#vendas',
        })),
      );
    }
    void Promise.allSettled(checks).then((results) => {
      if (!active) return;
      const settled = results
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value);
      if (settled.length > 0) {
        settled.push(helpLine());
      }
      setLines(settled);
    });
    return () => {
      active = false;
    };
  }, [canCatalog, canSellersRead, canSellersManage, canCustomerCreate, canSalesCreate]);

  if (lines === null || lines.length === 0 || lines.every((line) => line.ok)) return null;
  const done = lines.filter((line) => line.ok).length;
  const percent = Math.round((done / lines.length) * 100);
  return (
    <section className="lite-card">
      <h2>Prepare sua agência</h2>
      <p className="lite-muted">
        Leve a base ao dia zero para registrar a primeira venda. O progresso é detectado pelos dados
        do sistema, não por cliques.
      </p>
      <div className="lite-checklist-progress">
        <span>
          {done} de {lines.length} etapas concluídas
        </span>
        <div
          className="lite-progress"
          role="progressbar"
          aria-label="Progresso do onboarding"
          aria-valuemin={0}
          aria-valuemax={lines.length}
          aria-valuenow={done}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      </div>
      <ul className="lite-checklist">
        {lines.map((line) => (
          <li key={line.key}>
            {line.ok ? (
              <span className="lite-check-done">✓ {line.done}</span>
            ) : (
              <div className="lite-check-row">
                <div className="lite-check-text">
                  <span>{line.pending}</span>
                  <span className="lite-muted lite-check-example">{line.example}</span>
                </div>
                <div className="lite-check-actions">
                  {line.canCta ? (
                    <Link className="btn btn-small" to={line.to}>
                      {line.cta}
                    </Link>
                  ) : null}
                  {line.helpTo ? (
                    <Link className="btn btn-small btn-ghost" to={line.helpTo}>
                      Ver na ajuda
                    </Link>
                  ) : null}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
