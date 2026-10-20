# NEXT PROMPT — PX4 Mobile/PWA Travel Lite

Você está trabalhando no repositório `D:\travel-platform`.

## Contexto

PX2 e PX3 já foram integrados e publicados em `main`:

- `78fe7bb feat(travel-lite): add tenant branding and login theming`
- `7218b58 feat(travel-lite): expand help center and onboarding`

Leia antes:

- `AGENTS.md`
- `docs/AI_CONTEXT.md`
- `docs/travel-lite/product-experience/MOBILE-PWA.md`
- `docs/travel-lite/product-experience/HELP-CENTER.md`
- `docs/travel-lite/product-experience/PLAN-CAPABILITIES.md`
- `docs/travel-lite/ACCESS-CONTROL.md`

## Objetivo PX4

Implementar a primeira camada mobile/PWA do Travel Lite:

- responsividade real para o app em largura mobile;
- dashboard resumido usável no celular;
- cadastro rápido de cliente no mobile;
- consulta de clientes e vendas próprias;
- acesso à ajuda no mobile;
- manifest/PWA básico se ainda não existir no app `apps/travel-lite`.

## Regras

- Não ler `.env`.
- Não acessar produção/staging.
- Não rodar migrations/prisma.
- Não instalar dependências.
- Não remover segurança/tenant isolation.
- Não alterar backend se o frontend já puder usar APIs existentes.
- SELLER não pode ver dados fora do próprio escopo.

## Entrega esperada

1. Auditar `apps/travel-lite` em viewport mobile.
2. Implementar melhorias focadas e testáveis.
3. Adicionar/ajustar testes de UI.
4. Rodar:
   - `npx turbo run lint typecheck test build --filter=@travel-platform/travel-lite --force`
   - se tocar API Lite, também incluir `@travel-platform/api-lite`.
5. Salvar relatório final em `.claude/2026-10-01_PX4_mobile-pwa-report.md`.

## Observação

Não crie app nativo. O objetivo é PWA/mobile web pragmático para consulta e cadastro rápido.
