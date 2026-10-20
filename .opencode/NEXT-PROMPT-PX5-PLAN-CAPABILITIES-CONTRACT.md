# NEXT PROMPT — PX5 Plan Capabilities Contract (Lite/Pro/Full)

Você está trabalhando no repositório `D:\travel-platform`.

## Contexto

PX2, PX3, PX4 e PX6 já foram integrados e publicados em `main`:

- `78fe7bb feat(travel-lite): add tenant branding and login theming`
- `7218b58 feat(travel-lite): expand help center and onboarding`
- `56d0f62 feat(travel-lite): add mobile pwa experience`
- `9df0d6a feat(api-lite): add migration readiness report`

Leia antes:

- `AGENTS.md`
- `docs/AI_CONTEXT.md`
- `docs/travel-lite/product-experience/PLAN-CAPABILITIES.md`
- `docs/travel-lite/product-experience/UPGRADE-TO-FULL.md`
- `docs/travel-lite/product-experience/MIGRATION-READINESS.md`
- `docs/travel-lite/ACCESS-CONTROL.md`
- `docs/travel-lite/INTEGRATION-MAPPING.md`

## Objetivo PX5 para Opencode

Preparar a base técnica de capabilities Lite/Pro/Full sem billing real e sem migration, salvo se uma migration for comprovadamente indispensável. A entrega deve ajudar o frontend a saber quais recursos são `AVAILABLE`, `LIMITED`, `PRO_ONLY` ou `FULL_ONLY`, sem comprometer autorização.

## Escopo preferencial

Priorize API/contrato/testes:

- modelar uma matriz estática e tipada de capabilities Lite/Pro/Full;
- expor endpoint somente leitura para capabilities do plano atual, se fizer sentido dentro da API Lite;
- garantir que o plano atual do Lite seja tratado como Lite por padrão, sem depender de dado editável pelo frontend;
- garantir que capabilities sejam informativas, não substituam `requirePermission`;
- incluir categoria, label, descrição curta, plano mínimo, status e eventual motivo/upgrade target;
- documentar como isso evolui para Pro/Full sem quebrar Lite;
- adicionar testes focados de autorização/tenant isolation quando houver endpoint.

## Regras

- Não ler `.env`.
- Não acessar produção/staging.
- Não rodar migrations/prisma.
- Não instalar dependências.
- Segurança e tenant isolation primeiro.
- Não implementar cobrança, checkout, assinatura, trial ou integração externa.
- Não conceder permissão baseado apenas em plano.
- Não alterar regras de autorização existentes para "fazer aparecer" recurso.
- Se precisar persistir plano por tenant, pare e documente a migration proposta em vez de implementá-la.

## Entrega esperada

1. Auditar docs de capabilities e API Lite.
2. Propor/implementar contrato estático seguro para Lite/Pro/Full.
3. Adicionar testes focados.
4. Atualizar `docs/travel-lite/product-experience/PLAN-CAPABILITIES.md` com o contrato implementado.
5. Rodar gates relevantes:
   - `npx turbo run lint typecheck test build --filter=@travel-platform/api-lite --filter=@travel-platform/travel-lite --force`
   - se Docker for necessário para testes DB, registrar isso no relatório.
6. Salvar relatório final em `.opencode/PX5-PLAN-CAPABILITIES-CONTRACT-REPORT-2026-10-02.md`.

## Observação

O endpoint/contrato de capabilities é informativo. A autorização real continua sendo por permissões e checagens server-side existentes.
