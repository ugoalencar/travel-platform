# NEXT PROMPT — PX6 Migration Readiness Lite → Full

Você está trabalhando no repositório `D:\travel-platform`.

## Contexto

PX2 e PX3 já foram integrados e publicados em `main`:

- `78fe7bb feat(travel-lite): add tenant branding and login theming`
- `7218b58 feat(travel-lite): expand help center and onboarding`

Leia antes:

- `AGENTS.md`
- `docs/AI_CONTEXT.md`
- `docs/travel-lite/product-experience/UPGRADE-TO-FULL.md`
- `docs/travel-lite/product-experience/MIGRATION-MAPPING.md`
- `docs/travel-lite/product-experience/MIGRATION-READINESS.md`
- `docs/travel-lite/INTEGRATION-MAPPING.md`
- `docs/travel-lite/ACCESS-CONTROL.md`

## Objetivo PX6

Preparar o verificador de prontidão Lite → Full:

- relatório de pendências antes de upgrade;
- checagens de tenant, usuários, vendedores, clientes, vendas, financeiro, comissões e outbox;
- severidades: `BLOCKER`, `WARNING`, `INFO`;
- nenhuma alteração de dados;
- sem sincronização remota.

## Regras

- Não ler `.env`.
- Não acessar produção/staging.
- Não rodar migrations/prisma.
- Não instalar dependências.
- Segurança e tenant isolation primeiro.
- O relatório não pode conter senha, token, segredo ou dados sensíveis desnecessários.
- Não implementar o gateway de migração; só readiness/checker.

## Entrega esperada

1. Auditar schema/API Lite e docs de mapping existentes.
2. Propor formato de relatório.
3. Implementar endpoint ou script local somente se não exigir migration.
4. Adicionar testes focados.
5. Rodar gates relevantes.
6. Salvar relatório final em `.opencode/PX6-MIGRATION-READINESS-REPORT-2026-10-01.md`.

## Observação

Se perceber que precisa de migration para persistir resultados, pare e documente a proposta. O readiness inicial pode ser calculado sob demanda.
