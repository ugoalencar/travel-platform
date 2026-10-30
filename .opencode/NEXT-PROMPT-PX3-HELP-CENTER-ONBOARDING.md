# NEXT PROMPT — PX3 Help Center + Onboarding

Você está trabalhando no repositório `D:\travel-platform`.

## Contexto

O usuário pediu uma área de ajuda completa para reduzir integração humana. A implementação atual tem apenas `/ajuda` simples. A documentação corrigida está em:

`docs/travel-lite/product-experience/`

Leia especialmente:

- `docs/travel-lite/product-experience/HELP-CENTER.md`
- `docs/travel-lite/product-experience/ONBOARDING.md`
- `docs/travel-lite/product-experience/USER-MANUAL-PLAN.md`
- `docs/travel-lite/ACCESS-CONTROL.md`
- `docs/AI_CONTEXT.md`
- `AGENTS.md`

## Objetivo PX3

Evoluir a Central de Ajuda e o onboarding do Travel Lite:

- `/ajuda` com seções por área;
- exemplos preenchidos;
- dúvidas frequentes;
- links a partir do checklist/empty states;
- checklist inicial mais orientado;
- conteúdo que explique permissões quando menu/ação não aparece.

## Regras

- Não ler `.env`.
- Não acessar produção/staging.
- Não rodar migrations/prisma.
- Não instalar dependências.
- Não remover segurança/tenant isolation.
- Manter escopo frontend/API-lite existente.

## Entrega esperada

1. Auditar a ajuda atual e os empty states/checklist.
2. Implementar evolução sem criar CMS remoto.
3. Adicionar/ajustar testes de UI.
4. Rodar gates relevantes.
5. Salvar relatório final em `.opencode/PX3-HELP-CENTER-ONBOARDING-REPORT-2026-10-01.md`.

## Observação

Priorize valor prático para a agência: o usuário deve conseguir aprender clientes, vendas, financeiro, importação e permissões sem treinamento humano.
