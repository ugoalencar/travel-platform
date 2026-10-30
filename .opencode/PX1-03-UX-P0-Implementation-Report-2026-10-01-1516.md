# Relatório — PX1-03: Implementação do P0 de UX da Travel Lite

**Prompt:** `.opencode/NEXT-PROMPT-PX1-03-UX-P0-IMPLEMENTATION.md`
**Data/hora:** 2026-10-01 15:16
**Worktree:** `D:\travel-platform\.worktrees\travel-lite` (branch `feature/travel-lite`)
**Escopo:** PX1-05 → 04 → 02 → 01 → 03 → 06 (itens P0 da auditoria UX, conforme spec `.opencode/PX1-02-UX-P0-implementation-spec-2026-10-01.md`)

## 1. Arquivos afetados (confirmado antes da edição — tudo dentro de `apps/travel-lite` + `docs/travel-lite`)

| Arquivo | Itens |
|---|---|
| `apps/travel-lite/src/App.tsx` | PX1-05 (painel `AccessDenied` in-place no `Allowed`), PX1-01 (rota `/ajuda`) |
| `apps/travel-lite/src/Layout.tsx` | PX1-01 (link `Ajuda` no topbar, wrapper `lite-topbar-actions`) |
| `apps/travel-lite/src/ui.tsx` | PX1-02 (`SuccessNote`), PX1-04 (`EmptyState`) |
| `apps/travel-lite/src/styles.css` | `.lite-success`, `.lite-empty-state`, `.lite-denied`, `.lite-checklist`, `.lite-check-done`, `.lite-help`, `.lite-topbar-actions` (substitui `.lite-topbar .btn { margin-left:auto }`) |
| `apps/travel-lite/src/pages/CustomersPage.tsx` | 02 (notice + confirm) + 04 (CTA `Novo cliente` gated em `customers.create`) |
| `apps/travel-lite/src/pages/SellersPage.tsx` | 02 + 04 (CTA `Novo vendedor` gated em `sellers.manage`) |
| `apps/travel-lite/src/pages/SalesPage.tsx` | 02 (4 notices + confirm de cancelar) + 04 (CTA `Nova venda`) |
| `apps/travel-lite/src/pages/CommissionsPage.tsx` | 02 (aprovar/ajustar) + 04 (mensagem enriquecida, sem CTA) |
| `apps/travel-lite/src/pages/FinancePage.tsx` | 02 (receber/despesa/pagar/estorno) + 04 (CTAs `Ir para Vendas` / `Nova despesa`; copy `Nenhum payable em aberto.` → `Nenhuma despesa em aberto.`) |
| `apps/travel-lite/src/pages/SettingsPage.tsx` | 02 (usuário/permissões + confirm de desativação) |
| `apps/travel-lite/src/pages/CatalogPage.tsx` | 02 (notice + confirm) + 04 (`EmptyState` sem CTA) |
| `apps/travel-lite/src/pages/ImportDataPage.tsx` | 02 (dry-run/confirmar + confirm de importação) |
| `apps/travel-lite/src/pages/DashboardPage.tsx` | 03 (`FirstRunChecklist`) + 02 (sucesso do editor) |
| `apps/travel-lite/src/pages/HelpPage.tsx` | **novo** — PX1-01 FAQ estático (6 seções) |
| `apps/travel-lite/src/App.test.tsx` | testes atualizados + 7 novos |
| `apps/travel-lite/src/ui.test.tsx` | **novo** — 5 testes de `SuccessNote`/`ErrorNote`/`EmptyState` |
| `docs/travel-lite/PLAN-CAPABILITIES.md` | **novo** — PX1-06 (doc-only, sem ADR) |

Fora de escopo intocado: `services/api` (Full), `.claude`, migrations, `.env`, `services/api-lite` (nenhuma mudança de backend).

## 2. O que foi entregue por item

- **PX1-05:** URL sem permissão mostra painel in-place (`Você não tem acesso a esta área.` + `Voltar ao dashboard`), preservando a URL; sem redirect silencioso.
- **PX1-04:** componente `EmptyState({message, children})`; CTAs por permissão em Clientes/Vendedores/Vendas/Financeiro; mensagens sem CTA preservadas; regressão de copy em inglês corrigida.
- **PX1-02:** `SuccessNote` inline persistente (mesmo lugar do `ErrorNote`, `role="status"`, classe `lite-success`); catálogo de mensagens pt-BR da spec aplicado em 9 páginas; `window.confirm()` **antes** de qualquer request em: cancelar venda, desativar cliente/vendedor/item/usuário, confirmar importação. Estorno e demais mutações sem confirm (conforme spec).
- **PX1-01:** `HelpPage` com FAQ (status de vendas/comissões, perfis, importação, financeiro, primeiros passos), rota `/ajuda` protegida, link no topbar para qualquer usuário autenticado.
- **PX1-03:** card `Prepare sua agência` acima dos KPIs; 4 passos via `Promise.allSettled` nos endpoints GET existentes (sem backend); linhas com falha são ocultadas sem disparar `ErrorNote`; visibilidade por permissão (`settings.manage` / `sellers.read` / `customers.create`); CTA de vendedores exige `sellers.manage`; card some quando tudo concluído.
- **PX1-06:** `docs/travel-lite/PLAN-CAPABILITIES.md` com os 8 pontos da spec; **ADR não foi aberto** (pendente de aprovação humana, conforme §7-7 da spec).

## 3. Decisões tomadas (as "recomendadas" da spec, a confirmar com o time)

1. Sucesso = nota inline persistente (não toast).
2. Confirm na "Confirmar importação": **sim** (`{valid_rows} linha(s) serão gravadas.`).
3. Denied = painel in-place mantendo a URL: **sim**.
4. Checklist: some quando concluído (sem linha "Tudo pronto ✓").
5. FAQ apenas no topbar (não no menu lateral).
6. Passo de vendedores do checklist: visível com `sellers.read`, CTA só com `sellers.manage`.
7. PX1-06 sem ADR nesta macrofase (doc-only).
8. Estorno sem `window.confirm` extra (mantém form com motivo).

## 4. Testes

- `App.test.tsx`: teste de redirect **atualizado** para denied-in-place; asserções de menu **+ `Ajuda`** (2 testes); 7 novos testes: navegação Ajuda, checklist vazio/populado, cancel com confirm (false → 0 request / true → nota), desativar cliente com confirm (false → 0 PATCH / true → PATCH + nota), CTA de empty state, copy pt-BR do financeiro.
- `ui.test.tsx` (novo): 5 testes dos componentes de feedback.
- Contagem final: **17 testes no app (12 + 5), todos verdes**.

## 5. Gates (executados no worktree)

```
npx turbo run lint typecheck test build --filter=@travel-platform/api-lite --filter=@travel-platform/travel-lite --force
  → Tasks: 8 successful, 8 total (lint: 0 errors, 4 warnings pré-existentes de react-refresh)
  → @travel-platform/travel-lite: 17/17 testes
  → @travel-platform/api-lite:     97/97 testes
npx tsc -p tsconfig.json --noEmit → ROOT-TSC-OK
```

Correções feitas durante os gates (2 rodadas): assinatura de `mockFetch` ganhou `init?: RequestInit` (tipagem de `call[1]`) e mocks dos endpoints de mutação (`/sales/:id/cancel`, `PATCH /customers/:id`) nos novos testes.

## 6. Pendências / próximos passos

- **Não commitado** neste prompt (commit exige autorização explícita): 14 modificados + 3 novos, todos em `apps/travel-lite` e `docs/travel-lite`.
- ADR de plan gating (PX1-06 §4) aguardando aprovação.
- Smoke manual sugerido pela spec: rota `/ajuda`, cancel com confirm, checklist vazio, denied — automatizado em testes, mas validação visual não executada nesta rodada.
- Teste "Estornar não abre `window.confirm`" da spec não foi criado (caminho não alterado; destrutivo-fácil de adicionar depois).
