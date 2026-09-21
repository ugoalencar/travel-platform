# Auditoria: triplicação do conceito "próxima ação"

Fase 8 da rodada Tasks UI + Customer 360 Quick Wins. Este documento é
apenas auditoria — nenhuma refatoração foi feita. Objetivo: registrar
origem, uso atual, telas, semântica, duplicação e risco dos três
conceitos que hoje representam "o que fazer a seguir com este cliente/
oportunidade", e propor (sem implementar) um modelo de consolidação
futura.

## Os três conceitos

### 1. `commercial_opportunities.next_action_at`

- Origem: coluna da tabela `commercial_opportunities`
  (`008_commercial_cockpit.sql`).
- Uso atual: lida e exibida no Kanban de `PipelinePage.tsx` como a data
  da "próxima ação" daquela oportunidade.
- Semântica: campo solto, de texto/data livre — não está amarrado a
  nenhuma tarefa real. Pode ser escrito manualmente sem qualquer tarefa
  correspondente existir.
- Telas: `PipelinePage.tsx` (Kanban comercial).
- Risco: pode ficar dessincronizado da realidade — um usuário marca
  "próxima ação: 25/09" na oportunidade, mas nunca cria a tarefa
  correspondente em `commercial_tasks`, ou cria a tarefa e esquece de
  atualizar este campo.

### 2. `commercial_tasks` (a tabela em si)

- Origem: mesma migration, tabela dedicada e completa (CRUD, RBAC, RLS).
- Uso atual: agora com UI própria (`/tasks`, Dashboard, Customer 360 —
  ver `docs/product/TASKS_UI.md`), é o único dos três conceitos que
  representa uma ação operacional real e rastreável (tem responsável,
  tipo, conclusão).
- Semântica: a única fonte que deveria ser "verdade" sobre o que
  precisa ser feito e quando.
- Telas: `/tasks`, `/tasks/new`, Dashboard, Customer 360 → aba Tarefas.
- Risco: nenhum isolado — é a peça mais sólida do trio. O risco é
  externo: os outros dois campos não a referenciam.

### 3. `customer_interactions.next_action_at`

- Origem: coluna de `customer_interactions` (registro de interações
  com o cliente — ligações, e-mails, reuniões).
- Uso atual: **write-only** — confirmado por grep na auditoria anterior
  (`TASKS_FOLLOWUP_AUDIT.md`) e reconfirmado nesta rodada: é gravado ao
  registrar uma interação, mas nenhuma tela ou rota lê este campo para
  decidir o que mostrar ao usuário.
- Semântica: um resquício — parece ter sido a primeira tentativa de
  "próxima ação" antes de `commercial_tasks` existir, e nunca foi
  removido nem conectado a nada.
- Telas: nenhuma consome. É gravado ao criar uma interação
  (`customer-portal.ts` / rotas de interação) e nunca mais lido.
- Risco: dado morto que ocupa espaço mental — um desenvolvedor futuro
  pode assumir que é usado e tentar lê-lo, ou pode ser preenchido pelo
  usuário sem qualquer efeito visível (mau UX silencioso).

## Duplicação e por que isso é um problema

Hoje um agente pode:
1. Definir `next_action_at` numa oportunidade manualmente, sem tarefa.
2. Criar uma tarefa em `commercial_tasks` sem atualizar a oportunidade.
3. Registrar uma interação com um `next_action_at` que ninguém nunca
   verá.

Nenhum dos três se sincroniza com os outros. Não há verdade única.

## Recomendação de consolidação futura (não implementada)

Direção sugerida, alinhada ao que já foi levantado durante o pedido
desta auditoria:

- **`commercial_tasks` vira a fonte de verdade** — é a única entidade
  com responsável, tipo e conclusão reais.
- **`commercial_opportunities.next_action_at` passa a ser derivado**:
  em vez de campo editável livremente, seria calculado como o `dueAt`
  da próxima tarefa pendente ligada àquela oportunidade
  (`commercial_tasks.opportunityId`). Deixaria de ser gravável
  diretamnte pelo usuário.
- **`customer_interactions.next_action_at` vira legado/compat, ou é
  reaproveitado como "ação vinculada a esta interação específica"** —
  ou seja, ao registrar uma interação que exige follow-up, o fluxo
  passaria a criar uma `commercial_task` real (tipo `FOLLOW_UP`)
  vinculada ao `customerId`, em vez de gravar um campo solto e inerte.

Esta consolidação implica migração de dados (backfill de tarefas a
partir de `next_action_at` preenchidos), mudança de contrato de leitura
no Kanban, e uma decisão de produto sobre o que fazer com interações
antigas que já têm `next_action_at` preenchido sem tarefa
correspondente. Por isso não foi implementada nesta rodada — fica como
recomendação para uma rodada dedicada, com escopo e migração próprios.
