# Auditoria SOMENTE LEITURA — Experiência Travel Lite + Checklist PX1

- **Data/hora:** 2026-10-01 10:35
- **Worktree:** `D:\travel-platform\.worktrees\travel-lite` (branch `feature/travel-lite`, commit `e19db89`)
- **Escopo:** auditoria PX (Product Experience) + Upgrade Readiness. Nenhum arquivo de código/documento foi editado, movido, renomeado ou deletado; nenhuma migração/deploy executado; nenhum `.env` lido.
- **Leitura mínima cumprida:** `AGENTS.md`, `docs/AI_CONTEXT.md`, `docs/travel-lite/{ACCESS-CONTROL,COSTS-AND-MARGIN,HOMOLOGATION-HARDENING,INTEGRATION-MAPPING,PILOT-READINESS-CHECKLIST}.md`, `apps/travel-lite/src/{App,Layout,menu,auth,api,ui}.tsx`, `apps/travel-lite/src/pages/*` (12 arquivos), `services/api-lite/src/app.ts`, `services/api-lite/src/routes/*` (inventário completo de rotas), `index.html`, `styles.css`, `docs/00-product/{scope,mvp}.md`.

---

## 1. Resumo da UX atual

**Shell e navegação.** SPA React 19 + react-router 7 servida pela própria API (modo instalação, origem única). 10 rotas autenticadas + `/login` (`App.tsx:38-47`): Dashboard, Vendas, Financeiro, Importações, Clientes, Vendedores, Comissões, Relatórios, Cadastros, Configurações; `*` redireciona para `/`. Layout fixo com sidebar + topbar (`Layout.tsx`): marca "Travel Lite", menu filtrado por permissões (`menu.ts`), nome/perfil do usuário e "Sair". O wrapper `Allowed` (`App.tsx:19-23`) esconde páginas sem permissão redirecionando para `/` **silenciosamente**.

**Padrão de página.** Todas as páginas seguem o mesmo idioma: toolbar (busca/filtro + ação primária), formulário inline alternável, tabela, `Pager` (20/página), erros inline via `ErrorNote` (`ui.tsx:39-42`). Labels em pt-BR, moeda BRL (`formatBRL`), badges de status com mapa único de rótulos (`ui.tsx:1-28`). Sem toasts, sem sucesso visual após salvar, sem `confirm()` em ações destrutivas.

**Cobertura funcional (completa para o piloto).**
- **Clientes:** CRUD com todos os campos (CPF, endereço, observações), busca, status, carteira/reatribuição auditada (`CustomersPage.tsx`).
- **Vendedores:** CRUD + regra de comissão (bruto/margem/fixo/sem regra) + painel "Resumo" com período, gráficos e drill-down (`SellersPage.tsx`, `SellerReportPanel.tsx`).
- **Vendas:** rascunho → confirmar → cancelar, custos diretos só em DRAFT com gerador opcional de conta a pagar, parcelas geradas na confirmação, comissão exibida no detalhe (`SalesPage.tsx`).
- **Comissões:** filtrar por status/vendedor, aprovar, ajuste manual com observação (`CommissionsPage.tsx`).
- **Financeiro:** 3 abas (A receber / A pagar / Histórico), recebimento parcial, pagamento, estorno com motivo obrigatório (form dedica explicação do comportamento), avisos quando não há conta cadastrada (`FinancePage.tsx:262-266`).
- **Importações:** CSV/XLSX com 5 etapas (ler → mapear colunas → dry-run → reconciliar → confirmar), contadores de válidos/pendências, reconciliação linha a linha (`ImportDataPage.tsx`).
- **Relatórios:** 4 abas (Vendas, Vendedores/Meus indicadores, Comissões, Fluxo de caixa) com filtro de período, CSV download, drill-down por vendedor com 7 gráficos (`ReportsPage.tsx`, `SellerReportPanel.tsx`).
- **Cadastros:** 5 seções (categorias de venda, favorecidos financeiros, contas, categorias financeiras, formas de pagamento) (`CatalogPage.tsx:276-302`).
- **Configurações:** usuários CRUD, vínculo vendedor, ativar/desativar, editor de permissões por usuário com exceções GRANT/REVOKE (`SettingsPage.tsx`).
- **Dashboard:** widgets KPI/gráfico/tabela calculados no escopo do usuário e ordenáveis pelo MASTER (`DashboardPage.tsx`).

**Permissões na UX.** `useCan` apenas esconde ações; a API é a autoridade (documentado em `auth.tsx:81-84` e `SettingsPage.tsx:6-10`). Escopo `*_own` funciona (vendedora vê só os próprios números) — conforme `ACCESS-CONTROL.md`.

**Feedback e estados.** Carregamento = texto "Carregando…"; erro = parágrafo `lite-error`; vazio = "Nenhum registro." (sem CTA na maioria). Acessibilidade: quase inexistente (nenhum `aria-*` encontrado; poucos `title=`).

---

## 2. Lacunas de Help Center e ajuda contextual

| # | Lacuna | Evidência |
|---|--------|-----------|
| H1 | Não existe rota/página de ajuda, central de ajuda ou botão "?" em lugar nenhum | nenhum resultado `help/ajuda` em `apps/travel-lite/src/**` |
| H2 | Ajuda contextual mínima: apenas 2 atributos `title=` (drill-down do relatório e badge de estorno) | `SellerReportPanel.tsx:204`, `FinancePage.tsx:608` |
| H3 | Glossário de status inexistente — badges como "Sem regra", "Parcial", "Aguardando regra" exigem conhecimento prévio | `ui.tsx:1-28` |
| H4 | 17 regras de negócio pendentes de decisão da Gadotti não têm explicação na UI (ex.: margem negativa recusada aparece só como erro da API) | `HOMOLOGATION-HARDENING.md:90-108` |
| H5 | Importação sem modelo CSV/XLSX para download e sem legenda dos status `UNLINKED/CONFLICT/INVALID` | `ImportDataPage.tsx` (nenhum download de template) |
| H6 | Textos explicativos bons mas enterrados (ex.: "Usuário é o login; vendedor é quem vende" só na toolbar de Configurações) | `SettingsPage.tsx:239-244` |
| H7 | Sem "o que há de novo"/notas de versão in-app para o piloto acompanhar mudanças | — |

---

## 3. Lacunas de onboarding / primeiros passos

| # | Lacuna | Evidência |
|---|--------|-----------|
| O1 | Sem checklist/assistente de primeiro acesso (conta financeira → categorias → vendedores → usuários → primeira venda); o sistema só avisa quando falta conta financeira, em runtime | `FinancePage.tsx:262-266` |
| O2 | Empty states sem próximo passo ("Nenhum cliente encontrado." sem CTA de "Cadastrar cliente") | `CustomersPage.tsx:392` e equivalentes |
| O3 | Redirecionamento silencioso: URL direta sem permissão cai em `/` sem mensagem de "você não tem acesso a esta área" | `App.tsx:19-23` |
| O4 | Login exige conhecimento do slug da agência (só placeholder "gadotti"); sem "mostrar senha", sem "lembrar-me" | `LoginPage.tsx:40-42` |
| O5 | Sem autosserviço de senha esquecida (nenhum endpoint de reset/forgot/invite nas rotas) — senha só nasce em Configurações pelo admin | inventário `services/api-lite/src/routes/*` |
| O6 | Sem tour/wizard nem explicação do Dashboard configurável para quem chega primeiro | `DashboardPage.tsx:232-237` |
| O7 | Sem distinção de onboarding por perfil (SELLER nova não é orientada a "minhas vendas/minha carteira") | — |

---

## 4. Lacunas de branding / login personalizado

| # | Lacuna | Evidência |
|---|--------|-----------|
| B1 | Marca "Travel Lite" hardcoded na sidebar e no login — agência não aparece em lugar nenhum (não há nome/logo do tenant no shell) | `Layout.tsx:15`, `LoginPage.tsx:33`, `SessionUser` só tem `tenantId` (`api.ts`) |
| B2 | Sem favicon (`public/` vazio), título estático `Travel Lite`, sem meta description/theme-color | `index.html:5`, `apps/travel-lite/public/` |
| B3 | Sem login page branca por tenant (slug/keywall), sem logo, sem cor institucional da agência | `LoginPage.tsx` |
| B4 | Sem tema claro/escuro nem personalização de cor | `styles.css` (paleta fixa) |
| B5 | Sem identidade por e-mail — Lite não envia e-mails (convite/reset/bem-vindo inexistentes) | nenhum mailer em `services/api-lite` |
| B6 | Topbar mostra apenas `name` + `role` (role em inglês crua: MASTER/ADMIN/SELLER) sem nome da agência | `Layout.tsx:31-32` |

---

## 5. Lacunas PWA / mobile

| # | Lacuna | Evidência |
|---|--------|-----------|
| P1 | Não é PWA: sem `manifest.json`, sem service worker, sem ícone instalável — em desacordo com o baseline "Initial client: Web/PWA" do `AGENTS.md` | `apps/travel-lite/public/` vazio; nenhum registro de SW/manifest no app |
| P2 | Sem responsividade: **nenhuma media query** de layout em `styles.css` (só `min-width: 0`) — sidebar fixa + tabelas largas estouram em celular | `styles.css` |
| P3 | Sem offline/caching (erro genérico offline); sem meta `theme-color`/`apple-touch-icon` | `api.ts`, `index.html` |
| P4 | Tabelas com 7-10 colunas sem estratégia mobile (scroll horizontal horizontalizável já existe via wrap, mas sem densidade alternativa/cards) | tabelas de `SellerReportPanel.tsx`/`SalesPage.tsx` |
| P5 | Sem ARIA/contraste/touch targets auditados (nenhum `aria-label` encontrado) | grep `aria-` = 0 ocorrências |

---

## 6. Lacunas de Plan Capabilities e upgrade readiness

| # | Lacuna | Evidência |
|---|--------|-----------|
| U1 | Lite não tem **modelo de plano** algum: sem tabela/campo de plano, sem limites de uso (o produto prevê "Plano FREE — limitado a 50 clientes, 10 viagens"), sem feature gating por plano — só RBAC por usuário | `docs/00-product/scope.md`, `docs/00-product/mvp.md`; nenhum `plan/subscription/entitlement` em `services/api-lite` |
| U2 | Sem contadores de uso (clientes/vendas/usuários) nem avisos de limite para suportar qualquer gating futuro | inventário de rotas |
| U3 | Sem affordance de upgrade na UI ("Você está no plano X", uso atual, CTA) | — |
| U4 | Caminho de upgrade Lite → Plataforma só existe como **mapeamento documental** (`INTEGRATION-MAPPING.md`): outbox gravada mas sem consumer, sem worker, sem ferramenta de export/migração de dados | `INTEGRATION-MAPPING.md:5-11` |
| U5 | Sem portabilidade de dados: importação CSV existe, **exportação** só de relatórios (CSV de vendas/comissões/fluxo/vendedores) — não há export de clientes/vendedores/cadastros | `ReportsPage.tsx` vs `CustomersPage.tsx` (sem `apiCsv`) |
| U6 | Perfis divergem da plataforma (Lite: MASTER/ADMIN/MANAGER/SELLER/VIEWER com permissões; plataforma tem outro modelo) — sem documento de mapeamento de roles para a migração | `ACCESS-CONTROL.md:19`, `INTEGRATION-MAPPING.md:95` |
| U7 | Checklist de prontidão do piloto e docs online não cobrem plano/limites/upgrade (`PILOT-READINESS-CHECKLIST.md`, `ONLINE-*` = "planned only") | docs citados |

---

## 7. Checklist PX1 (priorizado, somente proposta — nada executado)

**Legenda:** P0 = bloqueia piloto/homologação Gadotti · P1 = experiência essencial pós-piloto · P2 = polish. Esforço: S/M/L.

### P0 — antes de escalar o piloto
1. **[PX1-01] Página "Ajuda" básica** (`/ajuda`): FAQ com status de venda/comissão, significado de "Sem regra", permissões, passos de importação; link fixo no topbar (menos 1 clique do que ajuda contextual). — esforço S · resolve H1/H3
2. **[PX1-02] Feedback de sucesso + confirmação destrutiva:** toast/"Salvo com sucesso" após CRUD; `confirm()` em "Cancelar venda", ativar/desativar registros (estorno já tem form com motivo — manter). — esforço S · resolve gap de feedback da §1, segurança de uso
3. **[PX1-03] Checklist de primeiro acesso** no Dashboard: detectar estado vazio (0 contas, 0 categorias, 0 vendedores, 0 usuários) e exibir passos com CTA navegável; continuar visível até completar. — esforço M · resolve O1
4. **[PX1-04] CTA nos empty states** ("Nenhum cliente encontrado" + botão "Novo cliente", etc.). — esforço S · resolve O2
5. **[PX1-05] Redirecionamento com mensagem** em `Allowed` ("Esta área exige outra permissão — fale com o administrador"). — esforço S · resolve O3
6. **[PX1-06] Especificação de Plan Capabilities (doc + ADR-lite):** formalizar plano FREE (50 clientes/10 viagens conforme `scope.md`), quais capacidades por plano e onde o gating será server-side; mapear roles Lite → plataforma. Só especificar nesta fase; implementar em PX2. — esforço M · resolve U1/U6 (decisão antes de código)

### P1 — experiência essencial
7. **[PX1-07] Identidade da agência no shell:** endpoint de dados do tenant (nome, slug, logo opcional) exibido na sidebar/topbar + título dinâmico (`document.title`), favicon e `theme-color`. — esforço M · resolve B1/B2/B6
8. **[PX1-08] Recuperação de senha self-service** (fluxo `forgot/reset` no backend + tela no login) — requer decisão de canal de e-mail; alternativa mínima: "Solicitar nova senha ao administrador" com contato. — esforço L · resolve O5
9. **[PX1-09] Importação com modelo para download** (CSV de exemplo por tipo) + legenda dos status de pendência. — esforço S · resolve H5
10. **[PX1-10] PWA baseline:** `manifest.json` + ícones + registro de service worker (cache do shell) + meta tags; depois, política de cache da API. — esforço M · resolve P1/P3
11. **[PX1-11] Responsividade:** media queries (sidebar → drawer em telas pequenas, tabelas com scroll horizontal garantido, toolbars quebráveis). — esforço M · resolve P2/P4
12. **[PX1-12] Export CSV de cadastros** (clientes, vendedores) para portabilidade e upgrade. — esforço S · resolve U5
13. **[PX1-13] Tooltip/"?" contextual** em conceitos de negócio (margem, custo, comissão por margem, carteira) nos formulários. — esforço S · resolve H2/H4 parcial

### P2 — polish
14. **[PX1-14] Acessibilidade:** `aria-label` em botões de ação, foco visível, contraste auditado, navegação por teclado em tabelas. — esforço M · resolve P5
15. **[PX1-15] Glossário de status** em página única (badges clicáveis → explicação). — esforço S · resolve H3
16. **[PX1-16] "O que há de novo"** in-app por versão do piloto. — esforço S · resolve H7
17. **[PX1-17] Explorar tema claro/escuro e cor da agência** (só depois de PX1-07). — esforço M · resolve B4
18. **[PX1-18] Onboarding por perfil** (SELLER: "minhas vendas/minha carteira"; ADMIN: configurações). — esforço M · resolve O7

### Fora do PX1 (registrado, não agendado)
- Gating real de limites de plano + tela "Seu plano e uso" (PX2, após PX1-06).
- Worker/outbox consumer e migração Lite → plataforma (macrofase Integration).
- Decisões pendentes da Gadotti (17 itens de `HOMOLOGATION-HARDENING.md`) — bloqueio de produto, não de UX.

### Ordem sugerida de execução
`PX1-01 → PX1-02 → PX1-04 → PX1-05 → PX1-03` (P0 rápidos, S antes de M) · `PX1-06` pode correr em paralelo (doc) · depois `PX1-07 → PX1-09 → PX1-11 → PX1-10 → PX1-12` · P2 conforme disponibilidade.

---

*Auditoria leitura apenas. Nenhuma mudança foi feita; este checklist é proposta para aprovação antes de qualquer implementação.*
