# Segmentação Avançada de Clientes

## 1. Objetivo

Nova área comercial (Comercial → Segmentação) que permite criar filtros avançados sobre a base de clientes da agência e salvá-los como segmentos reutilizáveis. **Segmentos salvam REGRAS, não uma lista congelada de IDs** — o número de clientes de um segmento é sempre recalculado ao abrir/executar, contra a base atual.

Nesta fase: **sem LLM**, **sem SQL digitado pelo usuário**, **sem campanhas**.

## 2. Estado atual dos dados para segmentação (auditoria realizada antes de qualquer migration)

Auditoria completa do domínio existente, antes de escrever qualquer código:

- **Customer**: `customers` não tem cidade/estado/país (só um `address` JSONB legado livre), não tem coluna de tags, não tem campo fixo de "agente responsável" (owner). "Data de cadastro" = `customers.created_at`.
- **Endereço estruturado**: cidade/estado/país reais vivem em `customer_addresses` (1:N, com `is_primary`) — migração 019.
- **Tags**: não existe sistema de tags para Customer em nenhuma tabela.
- **Wishes**: tabela `wishes` (destination, status, budget, customer_id).
- **Proposals**: `proposals` (status, total, customer_id) — sem coluna de pipeline stage.
- **Pipeline**: `commercial_opportunities` + `pipeline_stages` (stage_id) — não existe histórico de transição de estágio, logo "dias no estágio" não é confiável e **não foi implementado**.
- **Trips**: `trips` sem coluna de categoria — AIR/LAND/EXCURSION é **derivado** via EXISTS em `air_services`/`land_services`/`excursion_customers` (mesmo padrão de `trips.ts`).
- **Sales**: `sales.total`/`status`; ticket médio e total comprado são sempre agregados (AVG/SUM), nunca colunas pré-calculadas.
- **Receivables**: `receivables.status`/`due_at` — base real para "saldo em aberto" e "recebível vencido".
- **Interactions**: `customer_interactions.occurred_at` — base real para "último contato"/"dias sem contato".
- **Employees/agente responsável**: não existe campo fixo de owner em `customers`; o vínculo com funcionário só existe indiretamente por registro (`sales.user_id`, `proposals.user_id`, `commercial_opportunities.responsible_user_id`). **Gap documentado, não implementado como filtro nesta fase.**
- **RBAC**: `UserRole` hierárquico (OWNER > ADMIN > MANAGER > AGENT > VIEWER), `requireRole()`.
- **Filter builder seguro (precedente reaproveitado)**: `services/api/src/commercial-cockpit.ts`'s `buildOpportunityWhere()` — WHERE construído incrementalmente, sempre parametrizado, nunca concatenação de string. O motor de segmentação (`customer-segmentation.ts`) segue exatamente esse padrão.

Conclusão: nenhuma estrutura existente serve como "segmento salvo" — `customer_segments` é um domínio genuinamente novo, sem equivalente a evoluir.

## 3. Modelo de dados

### 3.1 `customer_segments` (migração 081)

Tenant-scoped (`agency_id`), RLS forçado:

`id, agency_id, name, description, scope, owner_employee_id, is_shared, filter_definition (JSONB), created_by_user_id, created_at, updated_at, archived_at`

- `scope`: `PERSONAL` | `SHARED` — CHECK garante `is_shared` sempre coerente com `scope`.
- `filter_definition` é JSONB, validado contra o allowlist descrito abaixo antes de qualquer persistência ou execução.

## 4. Escopo/propriedade

- **PERSONAL**: visível apenas ao criador e a papéis administrativos (OWNER/ADMIN/MANAGER).
- **SHARED**: visível a toda a equipe.
- Criar um segmento SHARED exige papel OWNER/ADMIN/MANAGER — um AGENT só pode criar segmentos PERSONAL (validado no backend, não só na UI).
- Nunca cross-tenant: toda consulta é escopada por `agency_id` do contexto autenticado.

## 5. DSL / filter_definition

Formato estruturado, sem SQL:

```json
{
  "operator": "AND",
  "conditions": [
    { "field": "customer.city", "operator": "EQ", "value": "Curitiba" },
    { "field": "sales.average_ticket", "operator": "GTE", "value": 8000 }
  ]
}
```

Grupos podem aninhar (`conditions` pode conter outro grupo `{operator, conditions}`), até profundidade máxima 4 e 30 condições por segmento. A UI desta fase usa apenas um grupo plano (nível único de AND/OU), mas o motor já suporta aninhamento para uso futuro.

## 6. Campos suportados (allowlist completo)

Cada campo declara `type`, `operators` permitidos, `label`, `category` — definidos em `services/api/src/customer-segmentation.ts`'s `FIELD_REGISTRY`, a única fonte de verdade.

**CLIENTE**: nome, protocolo, cidade, estado, país, data de cadastro, status, quantidade de interações, dias sem contato (último contato).

**COMERCIAL**: possui Wish, destino/interesse do Wish, possui proposta ativa, status da proposta, valor da proposta, quantidade de propostas, estágio de pipeline.

**VIAGENS**: possui viagem futura, data da próxima viagem, última viagem, destino, tipo (AIR/LAND/EXCURSION), quantidade de viagens, total histórico de viagens, documentação pendente (adicionado a pedido do usuário -- ver seção 6.1).

### 6.1 Documentação pendente (`trip.hasMissingDocument`)

Campo adicionado após a entrega inicial, a pedido explícito do usuário, para o caso de uso real "clientes que vão viajar nos próximos 30 dias e falta documentação". Backend real já existente: tabela `travel_requirements` (migração 046), com colunas `required`/`fulfilled` por cliente. O campo é `EXISTS (travel_requirements WHERE required = TRUE AND fulfilled = FALSE AND deleted_at IS NULL)` -- nenhuma migration nova foi necessária. Combine com `trip.nextDeparture NEXT_N_DAYS 30` (operador `E`) para reproduzir o caso de uso completo.

**FINANCEIRO**: total comprado, ticket médio, possui saldo em aberto, possui recebível vencido.

### Campos NÃO implementados (documentados, não inventados)

- **Tags**: não existe estrutura de tags em Customer.
- **Agente/responsável fixo**: não existe campo fixo de owner em `customers` (só vínculos por registro/venda/interação).
- **Forma de pagamento mais usada / parcelamento médio**: `payments.method` é texto livre por pagamento, sem conceito de parcelamento estruturado; agregação confiável exigiria um `mode()` sobre múltiplos joins não avaliado como seguro/performático nesta fase.
- **Preferências livres ("gosta de praia")**: só existe `notes` em texto livre, não estruturado — spec explicitamente pede para não usar texto livre nesta fase.
- **Dias no estágio de pipeline**: não existe tabela de histórico de transição de estágio; `updated_at` de `commercial_opportunities` muda em qualquer edição, não só troca de estágio — não confiável, não implementado.

## 7. Operadores

| Tipo | Operadores |
|---|---|
| STRING | EQ, NEQ, CONTAINS, STARTS_WITH |
| NUMBER/MONEY | EQ, NEQ, GT, GTE, LT, LTE, BETWEEN |
| DATE | BEFORE, AFTER, BETWEEN, LAST_N_DAYS, NEXT_N_DAYS |
| BOOLEAN | IS_TRUE, IS_FALSE (mais EXISTS/NOT_EXISTS quando o campo é uma relação) |
| ENUM | EQ, IN, NOT_IN (declarado por campo conforme a real capacidade de cada expressão SQL) |

## 8. Segurança

- `FIELD_REGISTRY` é a única fonte de campos/tabelas/joins possíveis — o browser só escolhe uma **chave** (`customer.city`), nunca uma coluna/tabela/join livre.
- Todo valor é sempre um parâmetro `$n` — nunca concatenação de string em SQL.
- `agency_id` vem sempre de `getAgencyId()` (contexto autenticado), nunca do `filter_definition` nem de qualquer campo do request.
- RLS permanece ativo (`FORCE ROW LEVEL SECURITY` em `customer_segments`).
- Tentativa de SQL injection em um valor de string é tratada como literal (testado); tentativa de injeção via nome de campo é rejeitada antes de qualquer SQL ser montado (testado).

## 9. Paginação

`page`/`pageSize` (padrão 25, máximo 100), nunca carrega a base inteira no frontend.

## 10. Preview e execução

- **Preview** (`POST /customer-segments/preview`): executa um `filter_definition` ainda não salvo contra a base viva.
- **Abrir segmento salvo** (`GET /customer-segments/:id/results`): usa exatamente o mesmo motor (`runFilterDefinition`), sempre recalculado — **nunca lê uma lista de membros persistida**, porque essa lista nunca é persistida.

## 11. Ações sobre o resultado (nesta fase)

- Abrir cliente: suportado (a UI retorna os IDs/nomes; navegação para o cliente reaproveita as rotas existentes de Customer 360).
- Exportar CSV: **não implementado** — não há política de exportação segura já estabelecida no projeto para esse tipo de dado; gap documentado, não implementado sem essa política.
- "Usar em oferta": **gap documentado** — não existe hoje integração Segmento→Oferta; o contrato futuro é: Oferta escolhe um `segmentId`, o backend reexecuta o mesmo `runFilterDefinition()` para obter o público. Não implementado nesta fase.

## 12. RBAC

Matriz auditada (`packages/domain/tenant-context.ts`, `UserRole`: OWNER > ADMIN > MANAGER > AGENT > VIEWER):

- Criar/editar segmento SHARED: OWNER, ADMIN, MANAGER.
- Criar segmento PERSONAL: AGENT+ (mínimo AGENT).
- Leitura: VIEWER+ (sujeito à visibilidade PERSONAL/SHARED).
- Nenhum privilégio foi ampliado silenciosamente.

## 13. Auditoria

Eventos registrados em `audit_logs` (reaproveitado, não uma tabela nova): `SEGMENT_CREATED`, `SEGMENT_UPDATED`, `SEGMENT_ARCHIVED`, `SEGMENT_SHARED` (disparado quando um update muda scope PERSONAL→SHARED). Execuções de leitura/preview não são auditadas (ruído excessivo, sem exigência de política atual em contrário).

## 14. Performance

- Índice novo `customer_addresses_agency_city_idx` (agency_id, city) — adicionado porque a segmentação é a primeira funcionalidade a filtrar por cidade em volume (auditado: não existia).
- Índice GIN em `filter_definition` — preparado para uso futuro de depuração; não é usado pelo motor de consulta atual.
- Sem otimização prematura além disso: nenhum outro índice foi adicionado sem evidência de necessidade real.

## 15. Integração futura com IA (não implementado nesta fase)

Arquitetura já preparada para receber, no futuro, um LLM que traduza linguagem natural ("clientes que gastam acima de 10 mil e gostam de Caribe") em `filter_definition` — o LLM nunca teria acesso a SQL livre; o `filter_definition` gerado passaria pelo mesmo `validateFilterDefinition()`/allowlist usado pela UI hoje.

## 16. Integração futura com campanhas (não implementado nesta fase)

Um segmento poderá futuramente servir de público-alvo para uma campanha de envio em massa — não implementado, não desenhado além do contrato conceitual descrito na seção 11 (Oferta → segmentId → reexecução do filtro).

## 17. Exemplos reais (usados no QA)

- "Clientes sem contato há 30 dias": `customer.daysSinceLastContact GT 30`.
- "Ticket médio acima de R$ 10.000": `financial.averageTicket GT 10000`.
- "Viagem nos próximos 60 dias": `trip.nextDeparture NEXT_N_DAYS 60`.
- "Wish com destino Caribe": `commercial.wishDestination CONTAINS "Caribe"`.
- "Clientes com proposta ativa": `commercial.hasActiveProposal IS_TRUE`.
