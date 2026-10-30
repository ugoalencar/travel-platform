# NEXT PROMPT — PX7 User Manual Travel Lite

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
- `docs/travel-lite/product-experience/USER-MANUAL-PLAN.md`
- `docs/travel-lite/product-experience/HELP-CENTER.md`
- `docs/travel-lite/product-experience/ONBOARDING.md`
- `docs/travel-lite/product-experience/MOBILE-PWA.md`
- `docs/travel-lite/product-experience/PLAN-CAPABILITIES.md`
- `docs/travel-lite/product-experience/UPGRADE-TO-FULL.md`
- `docs/travel-lite/ACCESS-CONTROL.md`
- `apps/travel-lite/src/helpContent.ts`

## Objetivo PX7 para Claude

Criar o manual operacional do Travel Lite com base no que já existe no produto, para reduzir necessidade de integração humana.

O manual deve ser prático e orientado a uso real:

- primeiro acesso e login com identidade visual da agência;
- visão geral do dashboard;
- clientes, cadastro rápido mobile e carteira;
- vendas, financeiro básico, comissões e relatórios;
- importação de dados;
- ajuda/onboarding;
- configuração de identidade visual;
- recursos do plano Lite/Pro/Full;
- prontidão para migração Lite → Full;
- boas práticas e solução de problemas comuns.

## Escopo esperado

Priorize documentação em Markdown dentro de `docs/travel-lite/product-experience/`:

- criar ou atualizar um manual principal, sugerido:
  - `docs/travel-lite/product-experience/USER-MANUAL.md`
- atualizar `USER-MANUAL-PLAN.md` se necessário, marcando o status implementado/rascunho;
- usar linguagem simples para usuários de agência;
- não inventar telas, fluxos, preço, limites numéricos ou recursos ainda não definidos;
- referenciar permissões quando uma ação depender de perfil;
- indicar quando algo é informativo e não altera autorização.

## Regras

- Não ler `.env`.
- Não acessar produção/staging.
- Não rodar migrations/prisma.
- Não instalar dependências.
- Não alterar código da aplicação, a menos que encontre erro pequeno e documente claramente.
- Não criar PDF/DOCX/PPT nesta etapa; entregar Markdown versionável.
- Não copiar texto longo de fontes externas.

## Entrega esperada

1. Auditar as telas/código/docs existentes do Travel Lite.
2. Criar o manual em Markdown, pronto para revisão.
3. Incluir uma seção de "o que ainda depende da empresa/produto" para limites, preço e aprovação de upgrade.
4. Rodar pelo menos uma checagem textual simples (`git diff --check`).
5. Salvar relatório final em `.claude/2026-10-02_PX7_user-manual-report.md`.

## Observação

O manual precisa refletir o que está implementado hoje. Se algo estiver apenas planejado, escreva como pendência ou evolução futura.
