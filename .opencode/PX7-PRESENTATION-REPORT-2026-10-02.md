# PX7 — Relatório: Roteiro de Apresentação do Travel Lite

Data: 2026-10-02
Prompt: `.opencode/NEXT-PROMPT-PX7-PRESENTATION.md`
Escopo: somente Markdown — nenhum arquivo de código foi alterado.

## 1. Objetivo

Criar a estrutura da apresentação do Travel Lite para cliente/agência,
fiel ao produto implementado, sem inventar métricas, preços, limites,
SLAs ou integrações inexistentes.

## 2. Leitura obrigatória

- `AGENTS.md` e `docs/AI_CONTEXT.md` (sessão).
- `PRESENTATION-PLAN.md` (narrativa de 6 atos, 14 slides sugeridos,
  demonstração base Gadotti, critérios de aceite).
- `USER-MANUAL-PLAN.md` (estrutura/padrões de conteúdo de produto).
- `PLAN-CAPABILITIES.md` (matriz Lite/Pro/Full, pendências comerciais).
- `UPGRADE-TO-FULL.md` (fluxo de upgrade assistido).
- `MIGRATION-READINESS.md` (9 checagens, severidades, o que migra).
- `MOBILE-PWA.md` (escopo mobile/PWA e cadastro rápido).
- `BRANDING.md` (identidade por tenant, regras de segurança).

## 3. Auditoria de telas reais (somente leitura)

- Rotas (`apps/travel-lite/src/App.tsx`): `/login`, `/` (dashboard),
  `/clientes`, `/vendedores`, `/vendas`, `/comissoes`, `/financeiro`,
  `/importacoes`, `/relatorios`, `/cadastros`, `/configuracoes`,
  `/ajuda`, `/plano`.
- Menu por permissão (`apps/travel-lite/src/menu.ts`): 10 entradas
  (`anyOf` de permissões) + Ajuda no topo + FAB "+ Cliente".
- Artigos de ajuda (`apps/travel-lite/src/helpContent.ts`): 10 artigos
  (`primeiros-passos`, `dashboard`, `clientes`, `vendas`, `importacao`,
  `financeiro`, `comissoes`, `vendedores`, `configuracoes`, `planos`)
  + FAQ.
- Fidelidade confirmada no código: status de venda
  `DRAFT/CONFIRMED/PARTIALLY_PAID/PAID/CANCELLED`
  (`services/api-lite/src/sales-analytics.ts:9`),
  estados de comissão e regras (`commission`), severidades do readiness
  (`BLOCKER/WARNING/INFO`), logo ≤ 150 kB.

## 4. Entregáveis

### `docs/travel-lite/product-experience/PRESENTATION.md` (novo, 395 linhas)

- Cabeçalho: público, formato (15 slides + 3 apêndices), duração
  sugerida (30–40 min com 10–15 min de demo), regra "mostrar o produto
  que existe", base de demonstração local (nunca produção/staging).
- 15 slides; cada um com **Título / Objetivo / Bullets / Fala do
  apresentador / Tela-demo**:
  1. O que é o Travel Lite · 2. Para quem serve · 3. Lite, Pro e Full ·
  4. Login com marca da agência · 5. Dashboard e checklist ·
  6. Cadastro de cliente · 7. Venda, custos e margem · 8. Financeiro ·
  9. Comissões · 10. Importação de planilhas · 11. Usuários, permissões
  e escopo do vendedor · 12. Ajuda integrada e onboarding ·
  13. Mobile/PWA e cadastro rápido · 14. Caminho para o Full ·
  15. Próximos passos para homologação (6 passos numerados).
- **Apêndice A** — roteiro de demonstração ao vivo em 10 passos
  (ordem, cuidados: base local, dados fictícios, usar a ajuda se algo
  falhar).
- **Apêndice B** — 13 perguntas e respostas prováveis (preço, Pro,
  segurança/dados, senha, offline, importação, escopo do vendedor,
  comissão, integrações externas, caminho Full, autosserviço, limites,
  SLA) — respostas fiéis ou adiamento explícito ao responsável
  comercial.
- **Apêndice C — Pendências que NÃO prometer**: preços/condições,
  existência e escopo finais do Pro, limites numéricos do Lite, prazos
  e roadmap, SLA/backup/RTO-RPO, integrações externas, recursos fora do
  escopo (offline/push/OCR/app de loja/temas), regra de aprovação de
  upgrade, métricas de resultado não medidas.
- Critérios de aceite replicados do plano.

### `docs/travel-lite/product-experience/PRESENTATION-PLAN.md` (editado)

- Linha de status: `Status: roteiro criado (2026-10-02)` com link para
  `PRESENTATION.md`.

## 5. Verificação

- `git diff --check` → exit 0 (sem erros de whitespace; apenas avisos
  de conversão LF/CRLF do core.autocrlf, não são erros).
- Varredura whitespace nos arquivos novos/alterados desta tarefa:
  `PRESENTATION.md` (395 linhas) e `PRESENTATION-PLAN.md` (51 linhas)
  — sem trailing whitespace, sem tabs.
- Sem mudanças de código: status git restrito a
  `docs/travel-lite/product-experience/`.
- Portas e escalas: nenhum serviço iniciado; nenhum teste/lint/build
  necessário (escopo documental). Matriz de planos, severidades,
  estados e limites citados batem com `capabilities.ts`,
  `migration-readiness.ts`, `sales-analytics.ts` e `helpContent.ts`.

## 6. Observado durante a sessão (não alterado por esta tarefa)

- `USER-MANUAL.md` (novo) e `USER-MANUAL-PLAN.md` (modificado, +36
  linhas) apareceram no worktree durante a execução — trabalho de
  sessão paralela; não foram tocados por este PX7.
- Commits já integrados em `main`: `7218b58`, `78fe7bb`, `56d0f62`,
  `9df0d6a`, `3babd3b`, `2ac3395` (PX1–PX6).

## 7. Fora de escopo (não feito de propósito)

- Nenhum deck .pptx/.pdf — roteiro em Markdown conforme prompt.
- Nenhum commit (aguarda autorização explícita).
- Nenhum dado de demonstração real; nenhum acesso a
  produção/staging; nenhum arquivo `.env` lido.

## 8. Próximos passos sugeridos

1. Autorizar o commit de `PRESENTATION.md` + `PRESENTATION-PLAN.md`.
2. Converter o roteiro em deck quando houver decisão de formato.
3. Alinhar Apêndice C com o responsável comercial antes da apresentação
   real (itens de preço/Pro/limites).
