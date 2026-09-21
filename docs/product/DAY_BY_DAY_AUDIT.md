# Auditoria — Day-by-Day / Itinerário

**Tipo:** auditoria e planejamento. Nenhum código foi alterado nesta rodada.

## 1. Schema de `trips`

Criada em `001_initial_schema.sql`: `id, agency_id, customer_id, sale_id, name, destination, description, start_date (DATE), end_date (DATE), status, notes, metadata (JSONB)`. **Nunca ganhou coluna nova** desde a criação — sem horário, sem lat/lng, sem endereço estruturado. `destination` é texto livre.

## 2. Busca exaustiva por estrutura de itinerário

Grep em todas as 85 migrations por `itinerary|trip_day|trip_event|day_plan|agenda|schedule`: **não existe, e nunca existiu**, nenhuma tabela `itinerary`/`trip_day`/`trip_event`. O próprio código confirma isso — `TripDetailPage.tsx` (agência) tem a aba "Itinerário" hardcoded vazia com o comentário: *"no itinerary or trip-linked proposal data source exists yet"*.

## 3. Dados brutos disponíveis por tipo de item

| Fonte | Datas | Horário | Local | Fornecedor/contato |
|---|---|---|---|---|
| `air_services` | departure_date/arrival_date | `departure_time`/`arrival_time` (TEXT livre, opcional) | origin/destination (texto livre) | via `supplier_id` → `suppliers.phone` |
| `land_services` | start_date/end_date | **NÃO EXISTE** | `description` (texto livre, sem endereço) | via `supplier_id` |
| `excursion_departures` | start_date/end_date | **NÃO EXISTE** | — | — |
| `trip_photos` | — (sem data do evento) | — | — | — |

**Nenhuma tabela tem latitude/longitude.** Confirmado por busca exaustiva em todo o schema.

**Voucher**: não existe em lugar nenhum do banco (zero ocorrências em 85 migrations). O texto "Ver itinerário e voucher" no Customer App é só um rótulo de botão, sem funcionalidade real por trás.

**Documentos**: `customer_documents` é genérico por cliente, sem `trip_id` — não filtrável por viagem hoje (confirmado por comentário explícito no código do portal).

## 4. UI atual

- **Agência** (`TripDetailPage.tsx`): 4 abas (Visão geral, Fotos, Itinerário, Relacionados). A aba "Itinerário" é `const itinerary: never[] = []` — placeholder reconhecido no próprio código como fora de escopo. Air/land services são carregados no componente mas não aparecem em nenhuma aba.
- **Cliente** (`CustomerTripDetailsPage.tsx`): aba "Itinerário" mostra uma timeline de **4 estágios de status da viagem** (Planejada→Confirmada→Em andamento→Concluída), não uma timeline de eventos com hora. Abaixo, duas listas paralelas não intercaladas: "✈️ Aéreo" e "🏨 Terrestre" — sem fusão cronológica, sem agrupamento por dia.

## 5. Modelo conceitual proposto (não implementar agora)

```
Trip
 └─ Day (número do dia da viagem, calculado a partir de start_date, não uma tabela obrigatoriamente nova)
     └─ Item (horário, tipo, título, referência à entidade real)
```

**Reuso vs. snapshot — recomendação**: **referenciar, não duplicar.** `air_services`/`land_services`/`excursion_departures` já têm `trip_id` e dados reais (preço, fornecedor, confirmação). Um "Day-by-Day" deveria ser uma **camada de apresentação/agregação** sobre essas tabelas existentes (ordenar por data+hora, agrupar por dia), não uma cópia dos dados em uma tabela nova. Justificativa: evita divergência entre o item do itinerário e o serviço real (ex.: se o voo muda de horário, o item do itinerário mudaria junto automaticamente se for referência; se fosse snapshot, ficaria desatualizado).

**Gaps que bloqueiam isso hoje, em ordem de impacto**:
1. `land_services` não tem horário — só data. Precisaria de campo de horário (mesmo padrão TEXT livre do `air_services`, para não reinventar).
2. Nenhum serviço tem "local" estruturado — sem isso, não há como plugar mapa sem geocodificação externa (fora de escopo).
3. Não há conceito de "dia N da viagem" — teria que ser calculado a partir de `start_date` da trip + data do item, não precisa de coluna nova.
4. `trip_photos` não tem vínculo com item específico — hoje é só galeria da viagem inteira, não por evento.

## 6. Customer App — gaps confirmados

| Item | Status |
|---|---|
| Timeline cronológica intercalada com hora | NÃO EXISTE (só listas paralelas aéreo/terrestre) |
| Documentos por viagem | PARCIAL (lista geral do cliente, não filtrada) |
| Horários | PARCIAL (só aéreo, texto livre opcional) |
| Contatos | PARCIAL (só contato geral da agência, não do fornecedor do item) |
| Mapas | NÃO EXISTE (sem lat/lng em nenhuma tabela) |

## Status

AUDITORIA CONCLUÍDA — não implementado.
