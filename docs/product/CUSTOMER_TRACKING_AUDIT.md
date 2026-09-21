# Auditoria — Tracking / Customer 360

**Tipo:** auditoria e planejamento. Nenhum código foi alterado nesta rodada.

## 1. O que é registrado hoje

### `customer_interactions` (ação humana/comercial)
Schema: `channel` (PHONE/WHATSAPP/EMAIL/IN_PERSON/OTHER), `direction` (INBOUND/OUTBOUND), `user_id` (agente, obrigatório), `summary` (texto livre obrigatório), `next_action_at`. **100% inserção manual** — só existe uma função de escrita (`createInteraction`), sempre disparada por um agente preenchendo um formulário. Nenhum evento automático insere aqui.

### `engagements` (sinal digital)
Schema: `type` (COMMENT/MESSAGE/CLICK/FORM/QR/COUPON_REQUEST/INTEREST), `external_user_id`, `raw_payload JSONB`, `campaign_id`/`publication_id`/`offer_id`. Alimentada por exatamente 2 fontes: (a) conectores de redes sociais externas (comentário/DM/clique em campanha), (b) **uma única ação explícita do cliente**: clicar em "❤️ Tenho interesse" na página de detalhe de uma oferta (`POST /customer-api/offers/:id/interest`).

### `audit_logs` — visualizações
Existe **exatamente um** event_type de "visualização" em ~100 valores do enum: `CONTRACT_SIGNATORY_VIEWED` (assinatura de contrato, domínio não relacionado). **Não existe `OFFER_VIEWED`, `PROPOSAL_VIEWED`, `TRIP_VIEWED`, `DOCUMENT_VIEWED` ou equivalente.**

### Customer App — instrumentação real
Todas as páginas de detalhe (oferta, proposta, viagem, reserva, documento) fazem apenas GET e renderizam — **nenhuma chamada de tracking ao abrir uma página**. A única exceção é o clique deliberado em "Tenho interesse", restrito à página de detalhe da oferta (não existe nem na listagem).

### WhatsApp Fase 1
É só geração de link `wa.me` + mensagem pré-formatada (3 rotas: share/offer, share/proposal, share/trip), sempre client-side no navegador do agente. **Nenhuma dessas rotas grava evento algum** — não há registro de que um compartilhamento por WhatsApp de fato ocorreu.

## 2. Engagement vs. CustomerInteraction — diferença factual confirmada

| | CustomerInteraction | Engagement |
|---|---|---|
| Quem gera | Agente (humano) | Sistema (conector) ou clique do cliente |
| Campo chave | `user_id` (obrigatório), `summary` (texto livre) | `external_user_id`, `raw_payload JSONB` |
| Canais | PHONE/WHATSAPP/EMAIL/IN_PERSON/OTHER (contato humano) | tipo de sinal digital (clique, comentário, interesse) |
| Exemplo real | Agente liga pro cliente e registra "pediu desconto" | Cliente clica "Tenho interesse" numa oferta |

As duas tabelas **não se sobrepõem hoje** — cobrem universos completamente distintos. Nenhuma das duas registra "visualização" de página.

## 3. Customer 360 (`CustomerDetailPage.tsx`) — o que a tela mostra hoje

13 abas: overview, personal, addresses, dependents, companions, documents, requirements, preferences, history, financial, trips, proposals, bookings.

| Item pedido | Status | Evidência |
|---|---|---|
| Últimas interações | PARCIAL | Só embutidas na aba "history", misturadas cronologicamente com outros eventos, sem aba própria |
| Últimas visualizações | NÃO EXISTE | Não há dado — visualização não é rastreada em lugar nenhum (ver seção 1) |
| Ofertas vistas / engagement | NÃO EXISTE | Zero ocorrências de "engagement" no arquivo inteiro |
| Propostas | NÃO EXISTE (placeholder) | Aba "proposals" é só `EmptyState` fixo: "integração ainda não disponível" |
| Viagens | EXISTE | Aba própria funcional |
| Compras/vendas | PARCIAL | Só na aba "financial" e misturado na timeline de "history", sem aba "vendas" dedicada |
| Reservas | NÃO EXISTE (placeholder) | Aba "bookings" também é `EmptyState` fixo |
| Tarefas | NÃO EXISTE | Zero ocorrências de "task"/"tarefa" no arquivo |
| Observações | EXISTE | Campo `notes`, editável |

**Achado relevante**: os contadores no card "Resumo" (`proposals.length`, `bookings.length`) existem, mas as abas dedicadas para esses mesmos itens são placeholders vazios — inconsistência a corrigir independente desta auditoria de tracking.

## 4. Por que "Cancún — 3 visualizações" não tem fonte de dado hoje

Confirmado por auditoria exaustiva: **não existe nenhum evento de "abrir"/"visualizar"** registrado em `engagements`, `audit_logs` ou `customer_interactions`. A funcionalidade de "interesse recente" citada como objetivo (ex: Cancún com 3 visualizações) exigiria instrumentar do zero o ato de abrir uma oferta/proposta/viagem no Customer App — hoje essas páginas fazem apenas leitura, sem qualquer chamada de tracking.

## 5. Taxonomia de eventos proposta (não implementar agora)

Reaproveitando `engagements` (já tem `type` enum extensível, já usado para INTEREST) em vez de criar tabela nova:

| Evento proposto | Reuso |
|---|---|
| `OFFER_VIEWED` | novo valor em `EngagementType`, análogo a como `INTEREST` foi adicionado (migration 076) |
| `OFFER_REVISITED` | derivado (2ª+ ocorrência de OFFER_VIEWED pro mesmo offer_id/customer_id), não precisa de tipo próprio |
| `PROPOSAL_VIEWED` | novo valor, ou usar `audit_logs` (que já tem `PROPOSAL_*` para criação/status — adicionar `PROPOSAL_VIEWED` seria consistente com o padrão existente ali) |
| `TRIP_VIEWED` | idem |
| `DOCUMENT_VIEWED` | idem |
| `COMMUNICATION_VIEWED` | idem |
| `CTA_CLICKED` | já existe como padrão factual: `INTEREST` é exatamente isso |

**Decisão de arquitetura a tomar depois (não agora)**: `engagements` (com `raw_payload`/`external_user_id`, pensado pra canais externos) ou `audit_logs` (já tem `PROPOSAL_CREATED` etc., mais alinhado semanticamente a "evento do domínio") — escolher UM, não os dois, pra não recriar a mesma duplicação que já existe entre `commercial_tasks`/`next_action_at` (ver auditoria de Tasks).

## 6. Scoring — não implementar, só documentar caminho futuro

Tracking de visualizações (uma vez implementado) poderia alimentar, no futuro: Segmentação (campo novo tipo `commercial.offerViewCount`), Wish (sugerir criar Wish a partir de interesse repetido), Opportunity (abrir oportunidade automaticamente após N visualizações) — nada disso é implementado ou desenhado nesta rodada.

## Status

AUDITORIA CONCLUÍDA — não implementado.
