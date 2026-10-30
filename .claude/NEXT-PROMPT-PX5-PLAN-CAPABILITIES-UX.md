# NEXT PROMPT — PX5 Plan Capabilities UX (Lite/Pro/Full)

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
- `docs/travel-lite/product-experience/HELP-CENTER.md`
- `docs/travel-lite/product-experience/ONBOARDING.md`
- `docs/travel-lite/product-experience/BRANDING.md`
- `docs/travel-lite/ACCESS-CONTROL.md`

## Objetivo PX5 para Claude

Implementar a camada UX/frontend de diferenciação entre Lite, Pro e Full no `apps/travel-lite`, sem criar billing real e sem desbloquear funcionalidade por frontend.

O objetivo é fazer o Lite mostrar, de forma educada e útil, que alguns recursos existem em planos maiores:

- matriz visual de recursos Lite/Pro/Full;
- pontos de upgrade leves em áreas onde fizer sentido;
- estados bloqueados/indisponíveis para Pro/Full sem poluir a operação diária;
- textos objetivos para ajudar a agência a entender quando migrar;
- integração com Ajuda/Onboarding quando fizer sentido;
- experiência responsiva e compatível com o PX4 mobile/PWA.

## Escopo preferencial

Priorize frontend/UX:

- tela ou seção de "Recursos do plano" em configurações/ajuda;
- componentes reutilizáveis para recurso disponível, limitado ou bloqueado;
- indicação visual discreta de "Pro" e "Full";
- CTA de solicitação de upgrade/migração apenas como intenção local ou orientação, sem envio externo real se não houver API pronta;
- testes de UI garantindo que SELLER/VIEWER não recebam ações administrativas indevidas.

## Regras

- Não ler `.env`.
- Não acessar produção/staging.
- Não rodar migrations/prisma.
- Não instalar dependências.
- Não alterar backend, exceto se for impossível concluir sem isso; nesse caso documente e pare.
- Não bypassar autorização: frontend pode informar/ocultar, mas nunca liberar recurso protegido.
- Não inventar cobrança, checkout, contrato comercial ou integração externa.
- Não transformar a UX em propaganda agressiva; precisa parecer ferramenta de trabalho.

## Entrega esperada

1. Auditar `apps/travel-lite` e a documentação de capabilities.
2. Implementar a UX de plano/capabilities de forma focada e testável.
3. Adicionar/ajustar testes de frontend.
4. Rodar:
   - `npx turbo run lint typecheck test build --filter=@travel-platform/travel-lite --force`
   - se `npx` não estiver no PATH, use os binários locais equivalentes em `node_modules/.bin`.
5. Salvar relatório final em `.claude/2026-10-02_PX5_plan-capabilities-ux-report.md`.

## Observação

Se encontrar necessidade real de contrato de backend para capabilities, documente exatamente o que falta para o Opencode implementar e limite sua entrega ao frontend que não compromete segurança.
