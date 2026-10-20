# PX1-02 — Especificação UX P0 (Travel Lite)

- **Data:** 2026-10-01
- **Natureza:** especificação para implementação futura. **Nenhum código, teste ou documento do produto foi alterado nesta rodada.**
- **Worktree alvo:** `D:\travel-platform\.worktrees\travel-lite` (branch `feature/travel-lite`)
- **Base:** `.opencode/Auditoria-UX-Travel-Lite-checklist-PX1-2026-10-01-1035.md` (itens PX1-01..PX1-06)
- **Restrição de concorrência:** outra frente trabalha em `services/api` (Full) — este spec não toca `D:\travel-platform\services\api`, `.claude` nem a matriz Full. Todo o escopo é `apps/travel-lite` (+ eventual doc em `docs/travel-lite/` na fase PX1-06).

---

## 1. Objetivo de PX1 P0

Fechar os 6 gaps P0 da auditoria UX da Travel Lite antes de escalar o piloto Gadotti:

1. O usuário autenticado encontra ajuda sem sair do app (`/ajuda`).
2. Toda ação de sucesso tem retorno visual; toda ação destrutiva tem confirmação.
3. Quem chega com base vazia sabe exatamente o que cadastrar primeiro (checklist no Dashboard).
4. Listas vazias mostram o próximo passo (CTA), não só uma frase.
5. Tentativa de URL sem permissão vira mensagem clara, não um redirect silencioso.
6. As capacidades de plano (FREE/limites) ficam especificadas em documento/decisão — sem código de gating nesta fase.

Regra transversal: **UI hint apenas** — toda autorização continua sendo da API (403), conforme `ACCESS-CONTROL.md` e `auth.tsx:81-84`. Nenhuma mudança de backend é necessária nos itens 01–05.

---

## 2. Escopo exato

### Entra

| Item | Arquivos prováveis (heurística pela auditoria) | Backend |
|---|---|---|
| PX1-01 `/ajuda` | novo `apps/travel-lite/src/pages/HelpPage.tsx`; `App.tsx` (rota); `Layout.tsx` (link no topbar); `App.test.tsx` | nenhum |
| PX1-02 sucesso + confirmação | `ui.tsx` (`SuccessNote`); páginas: `SalesPage`, `CustomersPage`, `SellersPage`, `CatalogPage`, `FinancePage`, `SettingsPage`, `CommissionsPage`, `ImportDataPage`, `ReportsPage`, `SellerReportPanel`, `DashboardPage` | nenhum |
| PX1-03 checklist | `DashboardPage.tsx` (+ novos subcomponentes no mesmo arquivo) | nenhum (usa endpoints existentes) |
| PX1-04 CTA empty states | `ui.tsx` (`EmptyState`); mesmas páginas do PX1-02 | nenhum |
| PX1-05 denied com mensagem | `App.tsx` (`Allowed`); novo componente leve (pode viver em `App.tsx` ou `ui.tsx`); `App.test.tsx` | nenhum |
| PX1-06 Plan Capabilities | novo doc `docs/travel-lite/PLAN-CAPABILITIES.md` + ADR em `docs/adr/` (quando aprovado) | nenhum |

### Fica de fora

- Qualquer gating de plano, tabela de plano, coluna em `tenants`, contadores de uso no servidor, tela "Seu plano" (PX2, após decisão do PX1-06).
- Componente de toast com provider/global (a especificação adota nota inline — ver §3.2; troca por toast é decisão humana).
- Service worker/PWA, responsividade, acessibilidade ampla (PX1-P1/P2 da auditoria).
- Reset de senha, e-mails, branding do tenant (PX1-07/08).
- Alterações em `services/api-lite` (nenhum endpoint novo; se PX1-03 optar por endpoint agregador, isso vira item novo com aprovação).
- Qualquer coisa em `services/api` (Full), `.claude` ou matriz Full.
- Decisões pendentes da Gadotti (17 itens de `HOMOLOGATION-HARDENING.md`).

---

## 3. Especificação por item P0

### PX1-01 — Página `/ajuda`

**Comportamento esperado**
- Rota `/ajuda` autenticada (mesmo guarda das demais). Visível para **todo usuário autenticado** (não depende de permissão).
- Acesso: link "Ajuda" (ou `?`) no topbar do `Layout.tsx` (ao lado de `Sair`), presente em todas as telas. Não entra no `MENU` da sidebar (evita poluir a navegação principal).
- Conteúdo **estático pt-BR** (sem chamada de API), seções em acordeão/âncoras:
  1. **Status das vendas** — Rascunho, Confirmada, Parcial, Paga, Cancelada (`ui.tsx:1-14`).
  2. **Status das comissões** — Sem regra (`PENDING_RULE` = venda confirmada antes de regra de comissão; valor é definido depois), Pendente, Aprovada, Paga.
  3. **Perfis e permissões** — MASTER/ADMIN/MANAGER/SELLER/VIEWER em uma frase; "não vejo um menu" → permissão (`menu.ts`), "fale com o administrador".
  4. **Importação** — 5 etapas (ler → associar colunas → validar dry-run → resolver pendências → confirmar) e significado dos status de linha.
  5. **Financeiro** — receber parcela, pagar conta, estornar (mantém lançamento original + movimento inverso, exige motivo).
  6. **Primeiros passos** — link para o checklist do Dashboard (PX1-03).
- Âncoras por seção (`/#status-vendas`-style ou botoes que rolam a página) são suficientes; sem busca.

**Telas/arquivos prováveis**
- `apps/travel-lite/src/pages/HelpPage.tsx` (novo)
- `App.tsx` — `<Route path="/ajuda" element={<HelpPage />} />` (dentro do bloco protegido do Layout)
- `Layout.tsx:30-36` — botão/link no `lite-topbar`
- `App.test.tsx`

**Mensagens pt-BR sugeridas**
- Link: `Ajuda`
- H1: `Ajuda`
- Sub: `Dúvidas rápidas sobre vendas, comissões, financeiro e permissões.`
- Vazio do topbar sem espaço: usar `?` com `aria-label="Ajuda"`.

**Estados**
- Vazio: não se aplica (conteúdo estático sempre presente).
- Erro: não se aplica (sem rede).
- Sucesso: navegação renderiza a página; voltar ao app pelos links internos/sidebar.

**Testes mínimos recomendados** (`App.test.tsx`)
1. Logado, clique em `Ajuda` no topbar → H1 `Ajuda` visível.
2. Logado, acesso direto a `/ajuda` → renderiza (não redireciona).
3. Sem sessão → redireciona para `/login`.

---

### PX1-02 — Feedback de sucesso + confirmação destrutiva

**Comportamento esperado**

*A) Sucesso.* Cada mutação com sucesso exibe uma nota de sucesso pt-BR próxima ao topo do conteúdo (mesmo lugar do `ErrorNote`), limpada ao navegar/reabrir o formulário. Componente novo `SuccessNote` em `ui.tsx` (espelho de `ErrorNote`, classe `lite-success`; persistente, sem auto-dismiss — ver decisão §7-2).

*B) Confirmação destrutiva.* `window.confirm()` antes de executar (padrão simples, sem infra nova):

| Ação | Arquivo | Confirmar? |
|---|---|---|
| Cancelar venda | `SalesPage.tsx:403-411` | **sim** |
| Desativar/ativar cliente | `CustomersPage.tsx:379-385` | **sim** (só ao desativar) |
| Desativar/ativar vendedor | `SellersPage.tsx:303-310` | **sim** (só ao desativar) |
| Desativar/ativar item de catálogo | `CatalogPage.tsx:243-250` | **sim** (só ao desativar) |
| Desativar/ativar usuário | `SettingsPage.tsx:374-378` | **sim** (só ao desativar) |
| Estornar pagamento | `FinancePage.tsx:553-579` | **não** — já tem form dedicado com motivo obrigatório + botão "Confirmar estorno"; manter |
| Confirmar importação | `ImportDataPage.tsx:368` | ver decisão §7-3 (recomendado: sim) |
| Aprovar/ajustar comissão, receber, pagar, CRUD comum | — | **não** (não são destrutivas) |

Cancelar/ativar só exibem confirm quando a permissão já habilita o botão (nada muda em `useCan`).

**Mensagens pt-BR sugeridas**

Sucesso (catálogo de mensagens — uma por ação):
- `Cliente salvo.` · `Cliente ativado.` · `Cliente desativado.`
- `Venda criada como rascunho.` · `Venda confirmada.` · `Venda cancelada.`
- `Custo adicionado.`
- `Vendedor salvo.` · `Vendedor ativado.` · `Vendedor desativado.`
- `Cadastro salvo.` · `Item ativado.` · `Item desativado.`
- `Comissão aprovada.` · `Comissão ajustada.`
- `Recebimento registrado.` · `Pagamento registrado.` · `Estorno registrado.`
- `Despesa criada.`
- `Usuário salvo.` · `Permissões salvas.` · `Usuário ativado.` · `Usuário desativado.`
- `Importação confirmada.`
- `Configuração do dashboard salva.`
- `Dry-run concluído: confira as pendências abaixo.` (sucesso do PX dry-run)

Confirmações (`window.confirm`):
- Cancelar venda: `Cancelar a venda {número}? Esta ação não pode ser desfeita.`
- Desativar cliente: `Desativar o cliente "{nome}"? Ele não entrará em novas vendas.`
- Desativar vendedor: `Desativar o vendedor "{nome}"?`
- Desativar item: `Desativar "{nome}"?`
- Desativar usuário: `Desativar o usuário "{nome}"? O acesso dele é encerrado na próxima requisição.`
- (se aprovado) Importação: `Confirmar a importação? {validos} linha(s) serão gravadas.`

**Estados**
- Sucesso: `SuccessNote` visível após a mutação e reload da lista/detalhe (mensagens acima).
- Erro: comportamento atual inalterado (`ErrorNote` com mensagem da API).
- Usuário cancela o confirm: nada é chamado (nenhum request disparado — garantir que o `confirm` rode **antes** do `api(...)`).
- Vazio: inalterado (CTAs são PX1-04).

**Testes mínimos recomendados**
1. `SalesPage` (mock `api`): cancelar com `window.confirm = () => false` → **nenhuma** chamada `POST /sales/:id/cancel`; com `true` → chamada ocorre e `SuccessNote` com `Venda cancelada.` aparece.
2. `CustomersPage`: desativar sem confirmação não dispara PATCH.
3. Uma mutação feliz por página principal (smoke): cliente/venda/recebimento exibem a mensagem esperada.
4. `Estornar` **não** abre `window.confirm` (mantém form).

---

### PX1-03 — Checklist de primeiro acesso no Dashboard

**Comportamento esperado**
- No topo de `DashboardPage`, **acima dos KPIs**, um card "Prepare sua agência" exibido enquanto **ao menos um passo estiver pendente**. Quando tudo concluído, some (ou vira linha "Tudo pronto ✓" — ver §7-1).
- Passos e sinal (frontend-only, endpoints existentes):

| Passo | Sinal de pendência | Fonte | CTA |
|---|---|---|---|
| 1. Cadastre uma conta financeira | 0 contas | `GET /financial-accounts` → `items.length === 0` | `Ir para Cadastros` (`/cadastros`) |
| 2. Cadastre categorias de venda | 0 categorias | `GET /categories` → `items.length === 0` | `Ir para Cadastros` |
| 3. Cadastre vendedores | 0 vendedores | `GET /sellers?pageSize=1` → `total === 0` | `Ir para Vendedores` |
| 4. Cadastre um cliente | 0 clientes | `GET /customers?pageSize=1` → `total === 0` | `Ir para Clientes` |

- Cada linha: checkbox desabilitada quando concluído (`✓`), texto + botão-link quando pendente.
- **Permissão:** exibir apenas passos cujo destino o usuário pode agir (`useCan`): passos 1–2 exigem `settings.manage` (dono de `/cadastros`); passo 3 `sellers.read` (ver) — CTA útil exige `sellers.manage`; passo 4 `customers.read_*`/`customers.create`. Vendedora com perfil SELLER não vê passos de administração.
- Falha de carregamento de um dos endpoints: não quebrar o Dashboard — marcar passo como "não verificado" (ocultar a linha) e seguir (o `ErrorNote` do dashboard não deve ser disparado por isso).

**Telas/arquivos prováveis**
- `DashboardPage.tsx` — componente `FirstRunChecklist` no mesmo arquivo (state próprio + `useEffect` com `Promise.allSettled`)
- `App.test.tsx`/`DashboardPage` test (se existir) — mocks das 4 listas
- Sem backend

**Mensagens pt-BR sugeridas**
- Card: `Prepare sua agência` / subtítulo `Leve a base ao dia zero para registrar a primeira venda.`
- `✓ Conta financeira cadastrada` · pendente: `Cadastre uma conta financeira para receber e pagar.` + `Ir para Cadastros`
- `✓ Categorias de venda cadastradas` · pendente: `Cadastre ao menos uma categoria de venda.` + `Ir para Cadastros`
- `✓ Vendedores cadastrados` · pendente: `Cadastre quem vende e a regra de comissão.` + `Ir para Vendedores`
- `✓ Cliente cadastrado` · pendente: `Cadastre o primeiro cliente da carteira.` + `Ir para Clientes`
- Concluído (se §7-1 escolher linha final): `Tudo pronto. Você já pode registrar vendas.`

**Estados**
- Vazio: é exatamente o gatilho (0 itens → checklist visível).
- Sucesso: progresso marcado ao concluir o passo (recarregar contagens ao voltar ao Dashboard — já acontece por mount).
- Erro: `allSettled` — linhas com falha ocultas; KPIs seguem normais.

**Testes mínimos recomendados**
1. 4 listas vazias → card visível com 4 pendências e CTAs com hrefs corretos.
2. 4 listas com itens → card ausente (ou linha "Tudo pronto", conforme decisão).
3. Usuário sem `settings.manage` (SELLER) → passos de Cadastros não aparecem; passo de cliente aparece.
4. Endpoint falhando (`reject`) → Dashboard renderiza sem exceção e sem `ErrorNote` extra.

---

### PX1-04 — CTAs nos empty states

**Comportamento esperado**
- Componente novo `EmptyState({ message, children })` em `ui.tsx` (mensagem + slot de ação opcional) para não repetir markup — reuso obrigatório conforme Code Reduction Policy.
- Substituir os textos soltos atuais e adicionar CTA quando houver ação óbvia **e** permissão:

| Onde | Mensagem atual (linha) | CTA proposto (condição) |
|---|---|---|
| `CustomersPage.tsx:392` | `Nenhum cliente encontrado.` | `Novo cliente` (`customers.create`) |
| `SellersPage.tsx:319` | `Nenhum vendedor encontrado.` | `Novo vendedor` (`sellers.manage`) |
| `SalesPage.tsx:603` | `Nenhuma venda encontrada.` | `Nova venda` (`sales.create`) |
| `CommissionsPage.tsx:224` | `Nenhuma comissão encontrada.` | sem CTA; enriquecer: `Nenhuma comissão no filtro. Comissões são geradas ao confirmar vendas.` |
| `FinancePage.tsx:361` (receber) | `Nenhum recebível. Confirme uma venda para gerar parcelas.` | `Ir para Vendas` (`sales.read_*`) |
| `FinancePage.tsx:533` (pagar) | `Nenhum payable em aberto.` → **corrigir idioma** | `Nova despesa` (`finance.manage`) |
| `FinancePage.tsx:632` (histórico) | `Nenhum pagamento registrado.` | sem CTA |
| `CatalogPage.tsx:256` | `Nenhum registro.` | sem CTA (form já está acima, sempre visível) |
| `ImportDataPage` (sem lote) | — (sem empty state) | sem CTA nesta fase |
| `ReportsPage` pós-consulta vazia | textos `Sem movimentações…`/`Nenhum…` | sem CTA; manter |
| `DashboardPage.tsx:96` | `Sem vendas no mês.` | sem CTA |

- CTA respeita permissão (mesmo `useCan` da página); link navega ou abre o form existente (reusar `startCreate`/`openCreate`).

**Telas/arquivos prováveis:** `ui.tsx` + as páginas da tabela.

**Mensagens pt-BR sugeridas:** usar os rótulos de botão já existentes na mesma tela (`Novo cliente`, `Nova venda`…) — consistência com a toolbar.

**Estados:** vazio → mensagem + CTA; CTA sem permissão → não renderizar (só mensagem); erro → inalterado.

**Testes mínimos recomendados**
1. Lista vazia com permissão → CTA presente; clique dispara `startCreate`/form abre (ou `Link` navega).
2. Lista vazia sem permissão (SELLER em vendedores) → só a mensagem.
3. `FinancePage` payables vazio → texto `Nenhuma despesa em aberto.` (regressão do copy em inglês).

---

### PX1-05 — Redirecionamento com mensagem quando faltar permissão

**Comportamento esperado**
- Hoje: `Allowed` (`App.tsx:19-23`) faz `<Navigate to="/" replace />` silencioso.
- Proposta **(recomendada)**: em vez de redirecionar, `Allowed` renderiza um painel **no próprio endereço URL**:
  - Título: `Você não tem acesso a esta área.`
  - Corpo: `Se precisar desta permissão, fale com um administrador da agência.`
  - Botão: `Voltar ao dashboard` (link para `/`).
- Vantagens: URL preservada (refresh mostra a mesma explicação), sem estado de rota, sem acoplar o Dashboard; menu continua escondendo o item (`Layout.tsx:8-10`).
- Alternativa descartada (documentar como opção §7-4): `Navigate to="/" state={{denied}}` + nota no Dashboard.

**Telas/arquivos prováveis**
- `App.tsx` (`Allowed` + componente `AccessDenied` local ou em `ui.tsx`)
- `App.test.tsx`

**Mensagens pt-BR sugeridas:** ver acima. Tom: neutro, sem expor qual permissão falta (não vazar detalhe de RBAC — o `title` do menu já usa a permissão? não; manter genérico).

**Estados**
- Sem permissão → painel (não redireciona, não volta 404).
- Com permissão → página normal.
- Sem sessão → continua indo a `/login` (proteção de rota externa inalterada).

**Testes mínimos recomendados**
1. SELLER acessa `/financeiro` (sem `finance.read`) → vê `Você não tem acesso a esta área.`, URL continua `/financeiro`, link `Voltar ao dashboard` presente.
2. ADMIN acessa `/financeiro` → conteúdo normal.
3. Acesso sem sessão → `/login` (regressão).

---

### PX1-06 — Plan Capabilities (somente documento/decisão)

**Comportamento esperado**
- Nada de código. Entregável da fase de implementação: **`docs/travel-lite/PLAN-CAPABILITIES.md`** + ADR (se decisão arquitetural for aceita — AGENTS exige ADR para mudança de arquitetura; gating de plano é decisão de produto/arquitetura).
- O documento deve conter:
  1. **Estado atual:** Lite sem modelo de plano; único mecanismo de restrição é RBAC por usuário (`ACCESS-CONTROL.md`); produto prevê `Plano FREE — limitado a 50 clientes, 10 viagens` (`docs/00-product/scope.md`) e `Plano (FREE inicial)` (`docs/00-product/mvp.md`).
  2. **Terminologia:** o que é "viagem" no escopo Full vs "venda" no Lite (mapear para `sales`) — decisão humana.
  3. **Matriz de capacidades por plano** (colunas: FREE / pago futuro; linhas: clientes, vendedores, usuários, vendas/mês, importações, relatórios, integrações) — inicialmente com apenas FREE preenchido.
  4. **Onde o gating viveria no Lite:** checagem server-side em `services/api-lite` rotas de criação (ex.: `POST /customers` → 403 `UPGRADE_REQUIRED` quando `total >= limite`), **nunca** só na UI; campo de plano em `tenants` ou tabela nova `tenant_plans` — a decidir.
  5. **Uso na UI:** banner de uso ("12/50 clientes"), mensagem de upgrade, coerência com futura tela "Seu plano".
  6. **Relação com a plataforma:** `integration_outbox` pronta (`INTEGRATION-MAPPING.md`); planos reais vivem no platform-admin (plans/subscriptions, ver `docs/AI_CONTEXT.md`) — definir Lite como subconjunto espelhado até a sincronização existir.
  7. **Portabilidade:** export CSV de cadastros (PX1-12) como pré-requisito de upgrade.
  8. **Não-objetivos:** billing, cobrança, marketplace.

**Telas/arquivos prováveis:** apenas `docs/travel-lite/PLAN-CAPABILITIES.md` (novo) e `docs/adr/NNN-*.md` quando aprovado.

**Mensagens:** não se aplica (documento).

**Estados:** não se aplica.

**Testes mínimos:** não se aplica nesta fase; quando o gating for implementado (PX2): teste de limite exato (403), teste de admin acima do limite bloqueado, teste de UI exibindo o estado.

---

## 4. Ordem de implementação recomendada

1. **PX1-05** — `App.tsx` apenas (`Allowed` → painel). Pequeno, isolado, desbloqueia testes de permissão.
2. **PX1-04** — criar `EmptyState` em `ui.tsx` e aplicar página a página (inclui o copy fix "Nenhum payable em aberto.").
3. **PX1-02** — adicionar `SuccessNote` em `ui.tsx` **depois** do PX1-04 (mesmo arquivo) e aplicar confirmações + mensagens por página; comoPX1-04 já passou pelas páginas, faça as duas mudanças de cada página juntas se for executar em lote único.
4. **PX1-01** — nova `HelpPage` + rota (`App.tsx`) + link no topbar (`Layout.tsx`).
5. **PX1-03** — `FirstRunChecklist` no `DashboardPage.tsx`.
6. **PX1-06** — escrever `PLAN-CAPABILITIES.md` (e submeter ADR) — pode correr em paralelo desde o início (doc-only, sem conflito).

Justificativa: `ui.tsx` é tocado por 04 e 02; `App.tsx` por 05 e 01 — sequenciar evita rebase. Páginas de CRUD são tocadas por 02 e 04 — aplicar em uma passada por arquivo.

---

## 5. Riscos de conflito entre arquivos

| Arquivo | Itens que o tocam | Risco |
|---|---|---|
| `apps/travel-lite/src/ui.tsx` | 02, 04 | alto se implementados em paralelo — sequencial obrigatório |
| `apps/travel-lite/src/App.tsx` | 01, 05 (+ testes) | médio — mesma branch/frente; fazer em commits separados |
| `apps/travel-lite/src/Layout.tsx` | 01 | baixo |
| `apps/travel-lite/src/App.test.tsx` | 01, 03, 05 | médio — testes no mesmo arquivo; rodar a suíte a cada item |
| `pages/CustomersPage/SellersPage/SalesPage/FinancePage/SettingsPage/CatalogPage/CommissionsPage/ImportDataPage` | 02, 04 | médio — coordenar para não reescrever a mesma toolbar duas vezes |
| `DashboardPage.tsx` | 03 (+02 se adicionar sucesso ao editor) | médio |
| Frente de segurança Full (`services/api`, `.claude`) | — | **nenhum** — zero sobreposição com `apps/travel-lite` / `services/api-lite`; manter afastado |
| `docs/travel-lite/` | 06 | baixo (arquivo novo) |

Regra de ouro: um item por commit; gates antes do próximo item.

---

## 6. Gates a rodar depois (por item e ao final)

Convenção já estabelecida na worktree:

```powershell
npx turbo run lint typecheck test build --filter=@travel-platform/api-lite --filter=@travel-platform/travel-lite --force
npx tsc -p tsconfig.json --noEmit   # aguardar ROOT-TSC-OK
```

- Após **cada** item: lint + typecheck + test do `@travel-platform/travel-lite` (suíte `App.test.tsx`/pages).
- Após PX1-01..05 completos: os dois comandos acima + verificação manual de smoke (rota `/ajuda`, cancel com confirm, checklist vazio, denied).
- `@travel-platform/api-lite` só se algum item mexer em backend (não é o caso do escopo atual).
- Gates de repo (`npm run lint|typecheck|test|build`) apenas na integração final da macrofase, não por item.
- **Não** rodar `prisma migrate/db push/generate`, migrations Lite (`travel-lite-migrate.cjs`) ou deploy — nada de mudança de schema.

---

## 7. Pontos que precisam de decisão humana antes de codar

1. **PX1-03 — persistência do checklist:** (a) sempre visível enquanto incompleto (recomendado, simples); (b) dispensável com "Ocultar" salvo em `localStorage` por tenant. E: mostrar linha "Tudo pronto" ao final ou esconder o card?
2. **PX1-02 — forma do sucesso:** `SuccessNote` inline persistente (recomendado nesta spec) vs toast com auto-dismiss (exige infra nova + decisão de duração/posições).
3. **PX1-02 — confirm na "Confirmar importação":** recomendado sim (escrita em massa); confirmar texto.
4. **PX1-05 — painel in-place vs redirect com estado:** recomendado in-place; confirmar que manter a URL é aceitável para o time.
5. **PX1-01 — conteúdo do FAQ:** texto dos 6 tópicos precisa de revisão (produto/cliente) — principalmente descrição de comissão "Sem regra" e prazos. E: link só no topbar ou também item na sidebar?
6. **PX1-03 — contagens via endpoints de lista:** 4 GETs extras no carregamento do Dashboard (aceitável para piloto?) ou criar agregado no `GET /dashboard` (mudança de backend — escopo novo, precisa aprovação).
7. **PX1-06 — definições de plano:** confirmar limite FREE (50 clientes / 10 vendas?), nome dos planos, onde mora o campo de plano (coluna em `tenants` vs tabela nova), e se este ADR é escrito nesta macrofase ou fica para PX2.
8. **Escopo do form de estorno:** manter sem `window.confirm` extra (posição atual da spec) — confirmar.

---

*Especificação somente. Nenhum código-fonte, teste, migração ou configuração foi alterado nesta rodada.*
