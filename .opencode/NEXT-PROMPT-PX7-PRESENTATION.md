# NEXT PROMPT — PX7 Presentation Travel Lite

Você está trabalhando no repositório `D:\travel-platform`.

## Contexto

PX1–PX6 já foram integrados e publicados em `main`. Estado atual relevante:

- `7218b58 feat(travel-lite): expand help center and onboarding`
- `78fe7bb feat(travel-lite): add tenant branding and login theming`
- `56d0f62 feat(travel-lite): add mobile pwa experience`
- `9df0d6a feat(api-lite): add migration readiness report`
- `3babd3b feat(api-lite): expose plan capabilities contract`
- `2ac3395 feat(travel-lite): add plan capabilities experience`

Leia antes:

- `AGENTS.md`
- `docs/AI_CONTEXT.md`
- `docs/travel-lite/product-experience/PRESENTATION-PLAN.md`
- `docs/travel-lite/product-experience/USER-MANUAL-PLAN.md`
- `docs/travel-lite/product-experience/PLAN-CAPABILITIES.md`
- `docs/travel-lite/product-experience/UPGRADE-TO-FULL.md`
- `docs/travel-lite/product-experience/MIGRATION-READINESS.md`
- `docs/travel-lite/product-experience/MOBILE-PWA.md`
- `docs/travel-lite/product-experience/BRANDING.md`

## Objetivo PX7 para Opencode

Criar a estrutura da apresentação do Travel Lite para cliente/agência, com roteiro claro e fiel ao produto implementado.

O material deve servir para apresentar:

- o que é o Travel Lite;
- por que ele reduz tempo de implantação;
- principais fluxos operacionais;
- mobile/PWA e cadastro rápido de cliente;
- ajuda/onboarding e redução de integração humana;
- branding/login com identidade da agência;
- recursos Lite/Pro/Full sem prometer preço/limites inexistentes;
- prontidão de migração Lite → Full;
- próximos passos para homologação/teste.

## Escopo esperado

Priorize documentação em Markdown dentro de `docs/travel-lite/product-experience/`:

- criar ou atualizar um roteiro principal, sugerido:
  - `docs/travel-lite/product-experience/PRESENTATION.md`
- atualizar `PRESENTATION-PLAN.md` se necessário, marcando status;
- formato recomendado: sequência de slides com título, objetivo, bullets, fala do apresentador e sugestão de tela/demo;
- não gerar PPTX nesta etapa; deixar o roteiro pronto para virar deck depois;
- não inventar métricas, preços, SLAs, integrações ou garantias comerciais.

## Regras

- Não ler `.env`.
- Não acessar produção/staging.
- Não rodar migrations/prisma.
- Não instalar dependências.
- Não alterar código da aplicação.
- Não criar PDF/DOCX/PPT nesta etapa; entregar Markdown versionável.
- Não usar claims comerciais que ainda não estejam apoiadas pelo produto/docs.

## Entrega esperada

1. Auditar docs e telas existentes relevantes.
2. Criar o roteiro de apresentação em Markdown.
3. Incluir uma seção de perguntas/respostas prováveis da agência.
4. Incluir uma seção de pendências comerciais/produto que não devem ser prometidas ainda.
5. Rodar pelo menos uma checagem textual simples (`git diff --check`).
6. Salvar relatório final em `.opencode/PX7-PRESENTATION-REPORT-2026-10-02.md`.

## Observação

O roteiro deve vender com clareza, mas sem exagerar: o Travel Lite é uma operação prática e evolutiva, não a plataforma Full completa.
