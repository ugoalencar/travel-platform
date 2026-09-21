# Auditoria — Tasks & Follow-up

**Tipo:** auditoria e planejamento. Nenhum código foi alterado nesta rodada.

## 1. `commercial_tasks` — o modelo real já existente

Migration 008. Schema: `customer_id` (obrigatório), `opportunity_id` (opcional), `assigned_user_id` (obrigatório), `type` (`CommercialTaskType`: FOLLOW_UP/CALL/POST_SALE/OTHER), `title`, `due_at`, `completed_at`, `notes`, `created_by`. RLS forçada, FKs corretas.

**Não é polimórfica** — fixa a Customer + Opportunity opcional. Não alcança Proposal/Sale/Trip diretamente (só indiretamente via `commercial_opportunities.proposal_id`/`sale_id`).

Status é inferido por `completed_at IS NULL/NOT NULL` — não há enum de status (PENDING/DONE/CANCELLED).

## 2. Achado crítico: backend completo, zero UI

O backend de `commercial_tasks` está **100% implementado e funcional**: rotas REST completas (GET/POST/PATCH em `services/api/src/routes/commercial-cockpit.ts`), CRUD completo, parsers, até criação automática via automação (`CREATE_FOLLOWUP`). **Mas não existe nenhuma tela no frontend.** Busca exaustiva em `apps/agency/src` por `listTasks`/`createTask`/`CommercialTask`/`commercial/tasks`: **zero ocorrências**. O client `api.ts` não tem nenhum wrapper para esses endpoints.

Hoje, a única forma de popular `commercial_tasks` é via automação ou chamada direta à API — nenhum usuário humano consegue criar/ver/editar/concluir uma tarefa pela interface.

## 3. Triplicação real do conceito "próxima ação"

Confirmada sobreposição em **3 lugares sem sincronização entre si**:

1. `commercial_opportunities.next_action_at` — 1 campo por oportunidade, sem tipo, sobrescrito a cada update (sem histórico). É o único dos três que tem leitura real (usado em filtros e exibido no Kanban da PipelinePage).
2. `commercial_tasks` — tabela dedicada, com tipo/responsável/due_at/completed_at próprios. É o modelo "correto", mas write-mostly via automação, sem UI.
3. `customer_interactions.next_action_at` — write-only confirmado: gravável na criação da interação, **nenhum consumidor de leitura encontrado** em todo o código.

Nenhuma dessas três gravações propaga pras outras duas. Um agente pode registrar "retornar dia 25" numa interação e isso nunca aparecer na oportunidade nem virar uma `commercial_tasks`.

Um 4º uso textual solto: `leads.outcome` contém literalmente o texto `"FOLLOW_UP"` como valor livre (não enum, não FK, terceiro lugar desconectado).

## 4. Responsável/atribuição — 3 nomes para o mesmo conceito

| Tabela | Campo | Domínio |
|---|---|---|
| `commercial_opportunities` | `responsible_user_id` | oportunidade inteira |
| `commercial_tasks` | `assigned_user_id` | tarefa individual |
| `operation_assignments` | `operational_staff_id` + `role` | staff de campo (DRIVER/GUIDE), domínio totalmente separado |

Nenhuma confusão real entre RH (`employee_deductions`/`payroll_entries`) e este domínio — são claramente separados.

## 5. Dashboard — o que existe de verdade

- KPI chip estático "Follow-ups hoje": só o número (`listFollowUpsDueTodayForUser`, filtrado por usuário), **sem lista clicável**.
- Bloco "Alertas operacionais": SE houver follow-ups atrasados, mostra 1 linha de texto linkando pra `/pipeline` (Kanban, não uma tela de tarefas). Esse mesmo bloco mistura follow-ups atrasados com recebíveis vencidos, capturas do Pescador, pendências de pós-venda e reservas canceladas — tudo como "alerta" genérico, sem hierarquia.
- **Inconsistência real encontrada**: o chip "hoje" é filtrado por usuário (`assigned_user_id` = usuário logado); o alerta "atrasado" é da **agência inteira**, sem esse filtro — apresentados lado a lado como se fossem do mesmo escopo, sem isso ficar claro pro usuário.

## 6. "Minhas Tarefas" no menu do AGENT — promessa não cumprida

Sidebar mostra "Minhas Tarefas" apontando pra `/` — a mesma Dashboard genérica de qualquer role, com KPIs agência-inteira (ex: "Vendas (mês)") que não são "dele". Não há filtro real, não há lista de tarefas.

## 7. Recomendação (não implementar agora)

**Não criar Task genérica nova.** `commercial_tasks` já é estruturalmente adequada — o gap real é 100% de frontend, não de schema. Prioridade sugerida:
1. Construir a UI que já deveria existir para `commercial_tasks` (lista, criar, concluir) — reaproveitando o backend já pronto.
2. Consolidar os 3 pontos de "next_action_at" em UM caminho: ao criar uma `customer_interactions` com `next_action_at`, considerar (decisão de produto futura, não desta rodada) se isso deveria opcionalmente criar/atualizar uma `commercial_tasks` correspondente — não implementar sem confirmação explícita, é mudança de comportamento.
3. Corrigir a inconsistência de escopo (pessoal vs. agência) entre o chip "hoje" e o alerta "atrasado" no dashboard.
4. Ampliar `commercial_tasks` para referenciar Sale/Trip diretamente (colunas opcionais novas, nullable) **somente se** houver demanda real confirmada — hoje só alcança essas entidades indiretamente via Opportunity.

## Status

AUDITORIA CONCLUÍDA — não implementado.
