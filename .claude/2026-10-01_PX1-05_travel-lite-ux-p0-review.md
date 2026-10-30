# PX1-05 — Revisão da entrega UX P0 da Travel Lite (Opencode/Mimo)

- **Data:** 2026-10-01
- **Prompt:** `.claude/NEXT-PROMPT-PX1-05-TRAVEL-LITE-UX-P0-REVIEW.md`
- **Alvo:** `D:\travel-platform\.worktrees\travel-lite` (branch `feature/travel-lite`, `e19db89`), mudanças **não commitadas** (14 modificados + 3 novos)
- **Material lido:** relatório do Opencode, spec `.opencode/PX1-02-UX-P0-implementation-spec-2026-10-01.md`, diff completo, `HelpPage.tsx`, `PLAN-CAPABILITIES.md`, `menu.ts`, `auth.tsx`, `ACCESS-CONTROL.md`
- **Modo:** somente revisão. Nenhum código, teste ou documento foi alterado.

## 1. Veredito

**APROVAR COM AJUSTES PEQUENOS.**

Não há achado bloqueante. Os 6 itens P0 foram entregues conforme a spec, a autorização continua fail-closed e o escopo foi respeitado. Há 2 achados de severidade média (um teste que não protege nada e um estado de tela contraditório) e alguns de copy e UX, todos de correção pequena.

## 2. Verificação independente

- Reexecutei `npx vitest run` em `apps/travel-lite`: **2 arquivos, 17/17 testes passaram**, o mesmo número do Codex e do Opencode.
- O `git status` do worktree continua com as mesmas 17 entradas (14 `M` + 3 `??`). A minha verificação não alterou nada.
- Não rodei lint, typecheck, build nem a suíte global. Conto com o resultado do Codex para esses gates.
- **Não houve smoke visual.** Nem o Opencode nem esta revisão abriram o app no navegador. O texto, o layout e a acessibilidade abaixo vêm da leitura do código.

## 3. Cumprimento dos itens P0

| Item | Resultado | Observação |
|---|---|---|
| PX1-05 acesso negado | **Cumprido** | `Allowed` renderiza `AccessDenied` no lugar, sem redirecionar, mantém a URL e oferece "Voltar ao dashboard" (`App.tsx:20`). O título é "Acesso restrito" e a frase pedida vem logo abaixo (pequena variação da spec) |
| PX1-04 empty states | **Cumprido** | `EmptyState` em `ui.tsx`, com CTA por permissão em Clientes, Vendedores, Vendas e Financeiro; o texto em inglês "Nenhum payable em aberto." foi corrigido |
| PX1-02 sucesso e confirmação | **Cumprido** | `SuccessNote` com `role="status"`; `window.confirm` roda **antes** do `api(...)` em cancelar venda, desativar cliente/vendedor/item/usuário e confirmar importação; estorno sem confirm extra, como decidido |
| PX1-01 `/ajuda` | **Cumprido** | Rota dentro do bloco protegido e sem exigir permissão, link no topbar e conteúdo estático (ver achados de copy) |
| PX1-03 checklist | **Cumprido com ressalvas** | `Promise.allSettled`, linha com falha é omitida sem `ErrorNote`, visibilidade por permissão (ver L3 e L4) |
| PX1-06 plan capabilities | **Cumprido** | Documento com os 8 pontos da spec, sem código e sem ADR (pendente de aprovação humana, conforme a spec) |

## 4. Achados por severidade

### Bloqueante
Nenhum.

### Média

**M1. O teste "hides the first-run checklist when the base is already populated" não protege contra regressão** — `App.test.tsx:231-250`
O estado inicial do checklist é `null` (não renderiza). O teste espera o dashboard e depois faz `waitFor(() => expect(queryByText('Prepare sua agência')).toBeNull())`. Essa condição já é verdadeira na primeira checagem, **antes** de os 4 GETs resolverem. Se o checklist passasse a aparecer indevidamente com a base populada, o teste continuaria verde.
*Menor ajuste:* depois de renderizar o dashboard, aguardar as chamadas aos quatro endpoints (por exemplo `waitFor` até `fetch` ter sido chamado com `/customers` e `/sellers`, mais um `await` extra de microtarefa) e só então afirmar a ausência do card.

**M2. Nota de sucesso e nota de erro podem aparecer juntas, contradizendo uma à outra** — padrão em `SalesPage`, `CommissionsPage`, `CustomersPage`, `SellersPage`, `FinancePage`, `SettingsPage`, `CatalogPage`, `ImportDataPage`
As ações de um clique (`confirmSale`, `cancelSale`, `approve`, `toggleStatus` e equivalentes) não fazem `setError(null)` no início, e os `catch` não fazem `setNotice(null)`. Exemplo: confirmar a venda dá "Venda confirmada."; um cancelamento posterior falha com "Falha ao cancelar"; as duas mensagens ficam na tela. O mesmo vale ao contrário, com um erro antigo ao lado de um novo sucesso. O erro persistente já existia antes, mas o `SuccessNote` o torna visível ao lado de uma mensagem oposta.
*Menor ajuste:* ao definir uma nota, limpar a outra (`setNotice(msg); setError(null)` no sucesso e `setError(msg); setNotice(null)` no `catch`), ou um helper por página.

### Baixa

**L1. FAQ imprecisa sobre quem cancela venda** — `HelpPage.tsx:27`
O texto diz "exige permissão de administrador", mas a API exige `sales.update_all` (ACCESS-CONTROL), que ADMIN, MANAGER e MASTER têm. Sugestão: "exige permissão para editar todas as vendas (administrador ou gerente)".

**L2. FAQ diz "Paga", o badge diz "Pago"** — `HelpPage.tsx:24` e `:47` contra `ui.tsx` (`PAID: 'Pago'`)
Vale para venda e para comissão. Alinhar a copy da FAQ com o que o usuário vê na tabela.

**L3. VIEWER vê um passo que não consegue executar** — `DashboardPage.tsx:87`
O VIEWER tem `sellers.read` e não tem `sellers.manage`. Ele vê "Cadastre quem vende e a regra de comissão." sem botão, e o card "Prepare sua agência" fica permanente para quem não pode agir. Está de acordo com a spec (tabela do PX1-03), mas a experiência é confusa. Sugestão: ocultar o passo quando `canCta` é falso, ou usar texto neutro ("Peça a um administrador para cadastrar vendedores").

**L4. Checklist para SELLER: card pensado para administração e contagem limitada à própria carteira** — `DashboardPage.tsx:46`
O SELLER tem `customers.create` e `customers.read_own`. O passo de cliente usa `GET /customers`, que vem filtrado pela carteira dele, então a vendedora com 0 clientes próprios vê "Prepare sua agência" mesmo com a agência populada. Se o login não tem vendedor vinculado (fail-closed), criar cliente responde 403 e o CTA falha. Além disso, o CTA aponta para `/clientes`, que exige `customers.read_*`; quem tem só `create` cairia no painel de acesso negado (combinação rara). Sugestão: aceitar como está no piloto e registrar; ou renomear o título para quem não tem `settings.manage`.

**L5. A nota de sucesso não some ao trocar de aba, filtro ou página** — `FinancePage.tsx` e demais listas
Só reabrir formulário ou iniciar ação limpa a nota. Exemplo: "Recebimento registrado." continua visível ao ir para a aba "A pagar". A spec dizia "limpada ao navegar/reabrir o formulário".

**L6. Copy do dry-run** — `ImportDataPage.tsx`
"Dry-run concluído: confira as pendências abaixo." aparece mesmo quando não há pendência. Texto idêntico ao da spec; sugestão cosmética: variar quando `valid_rows` cobre tudo.

**L7. Cobertura de testes abaixo do mínimo da spec**
Faltam, em relação aos "testes mínimos recomendados":
- `/ajuda` por acesso direto e sem sessão (deve ir para `/login`);
- checklist para SELLER (sem `settings.manage`) e com endpoint falhando (`allSettled` sem `ErrorNote`), que são os riscos de permissão e robustez do PX1-03;
- empty state sem permissão mostrando só a mensagem;
- uma mutação feliz por página principal (só venda e cliente estão cobertas, de cerca de 9 páginas);
- "Estornar não abre `window.confirm`" (o próprio Opencode registrou que não criou).
O teste de acesso negado (SELLER em `/configuracoes`) está bom: confere o texto, a URL preservada e o link.

### Observações de acessibilidade e UX (sem ação obrigatória)
- `SuccessNote` usa `role="status"`; o `ErrorNote` não usa `role="alert"` (já era assim). Anunciar sucesso e erro de forma assimétrica é aceitável, mas vale padronizar depois.
- `window.confirm` é bloqueante e não estilizável; é o que a spec definiu.
- O CSS usa `var(--lite-success)`, que existe (`styles.css:10`). A troca de `.lite-topbar .btn { margin-left:auto }` por `.lite-topbar-actions` mantém o alinhamento à direita.

## 5. Fail-closed e permissões

- `useCan` retorna falso sem usuário, e `Allowed` continua bloqueando. O painel de acesso negado é só dica de UI: a API segue sendo a autoridade (403).
- `/ajuda` fica dentro do `ProtectedRoute`, então anônimo vai para `/login`.
- O checklist não amplia acesso: usa apenas GETs que já existiam e, se um endpoint recusa (403) ou cai, a linha some em silêncio. Os passos de Cadastros só aparecem com `settings.manage`.
- O painel de acesso negado não revela qual permissão falta.

## 6. Escopo respeitado?

**Sim.** Os 17 arquivos alterados são exatamente os esperados no prompt, todos em `apps/travel-lite` e `docs/travel-lite`. Não há mudança em `services/api-lite`, `services/api` (Full), Import Center, Prisma, migrations, `.env`, staging ou produção. Nenhum commit, push ou PR. `PLAN-CAPABILITIES.md` é só documento, sem ADR, como a spec pedia.

## 7. Recomendação do próximo passo

**Fazer um ajuste pontual (Claude ou Codex) antes de liberar o commit**, sem devolver ao Opencode, porque os ajustes são pequenos e localizados:

1. **M1:** corrigir o teste do checklist para que ele de fato espere os GETs.
2. **M2:** limpar a nota oposta ao definir sucesso ou erro, nas páginas afetadas.
3. **L1 e L2:** corrigir a copy da FAQ (quem cancela; "Pago").
4. **L7:** adicionar ao menos os 3 testes de maior risco (checklist para SELLER, endpoint com falha, `/ajuda` sem sessão).

L3 a L6 podem virar backlog do piloto, a critério de produto. Depois do ajuste, rodar de novo `npx turbo run lint typecheck test build --filter=@travel-platform/api-lite --filter=@travel-platform/travel-lite --force` e `npx tsc -p tsconfig.json --noEmit`, e fazer um smoke visual rápido (rota `/ajuda`, cancelar com confirm, checklist vazio, acesso negado). Só então liberar o commit, com autorização explícita.
