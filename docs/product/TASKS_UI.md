# Tasks UI + Customer 360 Quick Wins

Rodada: ativação da UI de `commercial_tasks` + correção das abas Propostas/
Reservas do Customer 360. Base: auditoria prévia em
`docs/product/TASKS_FOLLOWUP_AUDIT.md` e
`docs/product/ENRIQUECIMENTO_COMERCIAL_GAP_ANALYSIS.md`.

Regra seguida: nenhuma tabela nova, nenhuma migration nova, nenhum novo
conceito de lembrete/agenda. Tudo abaixo reaproveita backend já existente.

## Backend reaproveitado (sem alteração de schema)

`commercial_tasks` (migration `008_commercial_cockpit.sql`) já estava
100% pronto — CRUD, RBAC, RLS — mas sem nenhuma tela. Campos existentes:
`id, agencyId, customerId, opportunityId?, assignedUserId, type
(FOLLOW_UP|CALL|POST_SALE|OTHER), title, dueAt, completedAt?, notes?,
createdBy, createdAt`. Não existe campo `priority` — não foi inventado.
Não existe enum de status — conclusão é inferida por `completedAt IS
NULL/NOT NULL`.

Rotas usadas (`services/api/src/routes/commercial-cockpit.ts`):
- `GET /commercial/tasks` — filtros `customerId`, `assignedUserId`,
  `opportunityId`, `pending`, `overdue`, `dueFrom`, `dueTo`.
- `GET /commercial/tasks/:id`
- `POST /commercial/tasks` — role mínima `AGENT`.
- `PATCH /commercial/tasks/:id` — role mínima `AGENT`; usado tanto para
  editar (`title`, `dueAt`, `notes`) quanto para concluir/reabrir
  (`completedAt: <timestamp>` / `completedAt: null`).

Também reaproveitados sem nenhuma rota nova: `listProposals()`,
`listBookings()`, `listEmployees()` — todos já existentes em `api.ts`,
filtrados no cliente pelo `customerId`/`bookerCustomerId` da mesma forma
que o Customer 360 já fazia para `sales`.

## RBAC (Fase 10 — auditado, não alterado)

- `GET /commercial/tasks*` exige papel mínimo `VIEWER`.
- `POST` e `PATCH /commercial/tasks*` exigem papel mínimo `AGENT`.
- Não existe rota de exclusão (`DELETE`) — logo não há política de
  exclusão a documentar além de "não suportado nesta rodada".
- Nenhuma matriz nova foi criada; os pisos acima já eram cobertos por
  teste existente (`VIEWER cannot POST a task or an interaction`, em
  `services/api/tests/commercial-cockpit-security.test.ts`).

## Telas criadas

### `/tasks` — "Minhas Tarefas" (`apps/agency/src/pages/TasksPage.tsx`)

Conecta o item de menu "Minhas Tarefas" (que já existia na sidebar,
apontando corretamente para `/tasks`) a dados reais pela primeira vez.

- Filtros: escopo (minhas / toda a equipe), status (pendentes /
  concluídas / todas), janela (qualquer data / atrasadas / hoje /
  próximos 7 dias).
- Cartões de resumo: Atrasadas, Hoje, Total listado — calculados no
  cliente a partir da lista carregada.
- Tabela: título, cliente (nome resolvido pelo backend), tipo,
  vencimento (destacado em vermelho se atrasado), status (badge),
  ação rápida (Concluir / Reabrir via `PATCH .../completedAt`).
- "Nova tarefa" leva para `/tasks/new`.

### `/tasks/new` e `/tasks/:id/edit` (`TaskFormPage.tsx`)

Criação/edição usando o backend existente. Campos: título, tipo,
cliente, vencimento, observações. Responsável é autoatribuído ao
usuário logado na criação (sem tela de seleção de responsável nesta
primeira versão — POST exige `assignedUserId` não vazio).

### Dashboard — widget "Tarefas pendentes"

Já existia (implementado durante esta mesma rodada, em paralelo, na
outra sessão de trabalho): lista até 5 tarefas pendentes, destaca
atrasadas, link "Ver todas" para `/tasks`.

### Customer 360 — aba "Tarefas" (nova)

Lista as tarefas relacionadas ao cliente (`listTasks({ customerId })`),
mostrando título, tipo, vencimento, responsável (nome resolvido via
`listEmployees()` + `employee.userId`), status, e ação de concluir.
Botão "Nova tarefa" leva para `/tasks/new`.

### Customer 360 — abas "Propostas" e "Reservas" (corrigidas)

Antes: contador funcionava, mas a aba renderizava sempre uma
`EmptyState` fixa (dado fixture antigo, incompatível com o
CustomerDetailPage real). Agora: `listProposals()`/`listBookings()`
filtradas no cliente por `customerId`/`bookerCustomerId`, mesma
técnica já usada para `sales`.

- Propostas: número, status, valor, validade, data de criação, CTA
  "Abrir" para `/proposals/:id`.
- Reservas: número, tipo (ida e volta / somente ida), status
  (ativa/cancelada), data de criação, CTA "Abrir" para `/bookings/:id`.
- Ambas preservam a separação Proposal ≠ Booking ≠ Trip — nenhum campo
  novo foi criado para ligar essas entidades.

### Empty states (Fase 7)

Todas as três abas mostram um `EmptyState` contextual quando vazias
("Nenhuma proposta para este cliente.", "Nenhuma reserva registrada.",
"Nenhuma tarefa para este cliente.") — nunca uma tabela quebrada ou
sem contexto.

## O que NÃO foi feito nesta rodada (por escopo)

Calendário completo, integração com Google Calendar, notificações push
de tarefa, novo motor de lembretes, IA/auto-follow-up, refatoração do
`next_action_at` (ver `docs/product/NEXT_ACTION_CONSOLIDATION_AUDIT.md`),
Proposal Visual 2.0, Day-by-Day, Tracking de visualizações.

## Testes

- Backend: `services/api/tests/commercial-tasks-http.test.ts` — CRUD
  feliz (criar/editar/concluir/reabrir) e filtros de rota
  (`pending`, `overdue`, `dueFrom`/`dueTo`, `assignedUserId`),
  isolamento entre agências, persistência após releitura. A cobertura
  de RBAC e isolamento de tenant por criação já existia em
  `commercial-cockpit-security.test.ts` e não foi duplicada.
- Frontend: `apps/agency/src/pages/TasksPage.test.tsx` (listagem,
  concluir, estado vazio, reabrir) e
  `apps/agency/src/pages/CustomerDetailPage.test.tsx` (abas
  Propostas/Reservas/Tarefas reais, estados vazios, isolamento por
  cliente).

## Débito conhecido / gaps documentados, não implementados

- Auditoria/histórico de eventos de tarefa: `commercial_tasks` não gera
  nenhum evento em `services/api/src/audit-log.ts`. Nenhuma
  infraestrutura de auditoria nova foi criada nesta rodada — ver
  gap registrado abaixo.
- Consolidação do "próxima ação" (`next_action_at` triplicado) — ver
  `docs/product/NEXT_ACTION_CONSOLIDATION_AUDIT.md`.
- Seleção de responsável na criação/edição de tarefa (hoje é sempre
  autoatribuição no create; edição não permite trocar `assignedUserId`).

### Fase 9 — gap de auditoria (documentado, não implementado)

`grep` em `services/api/src/audit-log.ts` confirma que não existe
nenhum `AuditEventType` relacionado a `commercial_tasks` (criação,
edição, conclusão, reabertura). Isso significa que ações sobre tarefas
não deixam rastro no log de auditoria da agência. Como o backend de
tarefas é anterior a esta rodada e o pedido explícito foi "não construir
nova infraestrutura de auditoria", este gap fica documentado para uma
rodada futura, e não foi implementado agora.
