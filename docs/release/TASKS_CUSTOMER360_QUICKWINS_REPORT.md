# Tasks UI + Customer 360 Quick Wins — Relatório de Entrega

- HEAD inicial: `11bb1c9` (docs: add commercial experience enrichment
  audit and roadmap)
- Migrations novas nesta rodada: **nenhuma** — reaproveitou 100% o
  schema já existente de `commercial_tasks` (`008_commercial_cockpit.sql`).

## Contexto de execução

Este round rodou em paralelo com outra sessão de trabalho da mesma
pessoa, na mesma árvore de trabalho, avançando o "Central de
Comunicação da Agência". Como algumas mudanças (rotas em `App.tsx`,
exports em `api.ts`, widget do Dashboard) ficaram entrelaçadas no mesmo
diff, o commit final combina as duas frentes — ambas foram validadas
juntas pelos mesmos gates (lint/typecheck/build/testes) antes do commit.
Este relatório documenta apenas a frente Tasks UI + Customer 360.

## Backend reaproveitado

Nenhuma rota nova foi criada para tarefas. Reaproveitado integralmente:
`GET/POST/PATCH /commercial/tasks[/:id]` (RBAC: GET exige `VIEWER`,
POST/PATCH exigem `AGENT`), `listProposals()`, `listBookings()`,
`listEmployees()`. Detalhes completos em `docs/product/TASKS_UI.md`.

## Telas criadas/corrigidas

- `/tasks` — "Minhas Tarefas" (nova, `TasksPage.tsx`): filtros de
  escopo/status/janela, cartões de resumo (atrasadas/hoje/total),
  concluir/reabrir.
- `/tasks/new`, `/tasks/:id/edit` — criação/edição (`TaskFormPage.tsx`).
- Dashboard — widget "Tarefas pendentes" (até 5 itens, atrasadas
  destacadas, link "Ver todas").
- Customer 360 → aba "Tarefas" (nova): tarefas do cliente com
  responsável resolvido por nome.
- Customer 360 → aba "Propostas" (corrigida): antes sempre vazia por
  fixture hardcoded; agora mostra propostas reais do cliente.
- Customer 360 → aba "Reservas" (corrigida): mesma correção, para
  reservas reais.
- Empty states contextuais nas três abas quando não há dados.

## Testes

- `services/api/tests/commercial-tasks-http.test.ts` (novo, 9 testes,
  **todos passando**): criar tarefa, editar (título/vencimento/notas),
  concluir e reabrir, filtros de rota (`pending`, `overdue`,
  `dueFrom`/`dueTo`, `assignedUserId`), isolamento entre agências,
  persistência após releitura.
- `apps/agency/src/pages/TasksPage.test.tsx` (novo, 4 testes, **todos
  passando**): listagem, concluir, estado vazio, reabrir.
- `apps/agency/src/pages/CustomerDetailPage.test.tsx` (novo, 7 testes,
  **todos passando**): abas Propostas/Reservas/Tarefas com dados reais,
  estados vazios, isolamento por cliente.
- `apps/agency/src/pages/CustomersPage.test.tsx` (2 testes
  pré-existentes atualizados): os testes antigos esperavam o texto do
  antigo estado vazio hardcoded ("Nenhuma proposta"/"Nenhuma reserva");
  atualizados para o texto real definido nesta rodada ("Nenhuma
  proposta para este cliente."/"Nenhuma reserva registrada.").
- Cobertura de RBAC e isolamento de tenant na criação de tarefas já
  existia em `services/api/tests/commercial-cockpit-security.test.ts`
  e não foi duplicada.

## Gates executados

| Gate | Resultado |
|---|---|
| `npm run lint` (monorepo) | ✅ 0 erros (apenas warnings pré-existentes não relacionados) |
| `npm run typecheck` (monorepo) | ✅ 0 erros |
| `npm run build` (monorepo) | ✅ todos os 7 pacotes buildaram |
| `npm run test:security` | ✅ 58/58 testes |
| `npm run test:db` | ✅ 9/9 testes |
| `apps/agency` — `npx vitest run` | ✅ 131/131 testes (19 arquivos) |
| `apps/customer` — `npx vitest run` | ✅ 542/542 testes (71 arquivos) |
| `services/api` — suíte completa (`CI=true npx vitest run`, sequencial) | ✅ 93/93 arquivos, 1589/1589 testes |

**Nota sobre `npm run test` (turbo, com paralelismo total)**: a suíte
de testes de banco do `services/api` usa um único nome de container
Docker fixo (`travel-platform-postgres-local`) por convenção
pré-existente do repositório. Como havia outra sessão de trabalho ativa
na mesma máquina rodando testes/serviços simultaneamente (confirmado
via `docker ps` — vários containers de outras rodadas de teste em
execução), a execução paralela completa (`turbo run test`) esbarrou em
conflitos de nome de container entre arquivos de teste concorrentes —
uma flakiness conhecida e pré-existente deste padrão de harness, não
uma regressão desta rodada. Mitigação aplicada: reexecução sequencial
completa do `services/api` (`CI=true npx vitest run`, sem paralelismo
de arquivos, reaproveitando o container já saudável) — **resultado
real: 93 arquivos e 1589 testes, todos passando**.

**Achado durante essa reexecução (fora do escopo de Tasks UI, mas
bloqueava CI verde)**: a mudança da outra sessão em `offers.ts`
(coluna `featured`, migration `084_offer_visibility.sql`) tornou essa
coluna obrigatória em toda consulta de `offers`, mas pelo menos 5
arquivos de teste do backend (`offers.test.ts`, `offer-routes.test.ts`,
`offer-e2e.test.ts`, `customer-portal-routes.test.ts`,
`offer-growth-cancun-e2e.test.ts`,
`offer-growth-entitlement-isolation.test.ts`) usavam listas de
migration fixas anteriores à 084, quebrando 28 testes. Corrigido nesta
rodada (troca para descoberta dinâmica de migrations via `readdirSync`,
seguindo o padrão já usado em arquivos mais novos como
`auth-http.test.ts`). Também foi necessário ajustar um `INSERT`
SQL bruto em `customer-portal-routes.test.ts` que não preenchia
`cancelled_at`/`cancelled_by_user_id`, violando a constraint
`bookings_cancellation_audit_check` (migration `011`) — que só passou a
ser exigida porque a suíte agora aplica o conjunto completo de
migrations. Nenhuma mudança de produção foi feita para isso, apenas
infraestrutura de teste.

## QA remota (Fase 12)

**Não executada nesta rodada** — não foi feito deploy destas mudanças
para o ambiente remoto (Render/Vercel) antes deste relatório. Fica como
pendência explícita: após o deploy, validar Agency → Login → Dashboard
→ "Tarefas de hoje"; Minhas Tarefas → criar → editar → concluir;
Customer 360 → Propostas → Reservas → Tarefas; em desktop e largura
reduzida.

## Débito conhecido (não implementado nesta rodada, por escopo)

- Consolidação do `next_action_at` triplicado — ver
  `docs/product/NEXT_ACTION_CONSOLIDATION_AUDIT.md` (auditoria feita,
  refatoração não implementada, conforme pedido).
- Auditoria/histórico de eventos de `commercial_tasks` — gap
  confirmado (nenhum `AuditEventType` relacionado existe), não
  implementado nesta rodada.
- Seleção de responsável na criação de tarefa (hoje é sempre
  autoatribuição).
- Calendário completo, integração Google Calendar, notificações push,
  novo motor de lembretes, IA/auto-follow-up, Proposal Visual 2.0,
  Day-by-Day, Tracking de visualizações — fora de escopo por pedido
  explícito.

## Commit e CI

- Commit: `7887430` — `feat(tasks): ativar UI de commercial_tasks e
  corrigir Customer 360 (Propostas/Reservas)`.
- Push: `origin/main` (`11bb1c9..7887430`).
- CI real (GitHub Actions): run
  [`35646501802`](https://github.com/ugoalencar/travel-platform/actions/runs/35646501802)
  — **✅ sucesso**, job "Quality Gates" completo em 9m39s: Lint,
  Typecheck, Secret scan, Dependency audit, Validate migration file
  naming, Unit tests, Security tests, Database and RLS integration
  tests, Build — todos verdes. Apenas warnings pré-existentes não
  relacionados (nenhum erro).

## Status

**TASKS UI + CUSTOMER 360 QUICK WINS — PRONTO PARA REVISÃO**, com uma
ressalva explícita: a QA remota (Fase 12) não foi executada, pois esta
rodada não incluiu deploy para o ambiente remoto (Render/Vercel). Após
o próximo deploy, validar manualmente: Agency → Login → Dashboard →
"Tarefas de hoje"; Minhas Tarefas → criar → editar → concluir;
Customer 360 → Propostas → Reservas → Tarefas — em desktop e largura
reduzida.
