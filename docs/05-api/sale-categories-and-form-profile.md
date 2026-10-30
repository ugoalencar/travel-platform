# Categorias de venda, perfil de formulário e itens (Onda B, ADR-008)

Contrato entre Full e Lite. O Full é a referência; o Lite é subconjunto
(DEC-007). Os dois guardam a configuração por `field_key`, sem DDL por campo.

## Registro de campos (código)

- Full: `services/api/src/sale-form-fields.ts`. Lite: `services/api-lite/src/sale-form-fields.ts`.
- Cada campo tem `key`, `type`, `storage` (`column` ou `modality`), `locked`,
  `classification` (`LEGAL`/`MARKET`/`SUGGESTION`, só documentação) e `availableIn`.
- `sale_date` é travado: sempre habilitado, nunca obrigatório pelo perfil.
- Campos de primeira classe (colunas de `sales`, entram em relatório):
  `travel_start_date`, `travel_end_date`, `origin_text`, `destination_text`,
  `passenger_count`. Os demais ficam em `sales.modality_data` (JSONB por `field_key`).
- Teste de paridade: `services/api-lite/tests/sale-form-fields.test.ts` exige que todo
  campo do Lite exista no Full com o mesmo tipo, armazenamento e trava.
- Passageiros (`sale_passengers`) e campos de cliente (Frente 2) **não** fazem parte desta onda.

## Banco

| Full (migration 101) | Lite (migration 012) |
| --- | --- |
| `commission_categories` (catálogo único de categorias, F1) | `sale_categories` (+ `form_revision`, `legacy_ref`) |
| `sale_category_fields` | `sale_category_fields` |
| `sales`: `category_id`, `sale_date`, campos de viagem, `modality_data`, `form_snapshot` | `sales`: campos de viagem, `modality_data`, `form_snapshot` (`sale_date` e `category_id` já existiam) |
| `TravelProduct` e `SaleItem` já existentes | `catalog_products`, `sale_items` |

Todas as tabelas têm RLS e FK composta por `agency_id`/`tenant_id`. Nenhuma entrada aceita
`agencyId`/`tenantId`.

## Rotas

| Ação | Full | Lite |
| --- | --- | --- |
| Registro | `GET /sale-form-fields` | `GET /sale-form-fields` |
| Categorias | `GET/POST /sale-categories`, `PATCH /sale-categories/:id` (ADMIN escreve) | `GET/POST /categories`, `PATCH /categories/:id` (`settings.manage`) |
| Perfil | `GET/PUT /sale-categories/:id/form` | `GET/PUT /categories/:id/form` |
| Venda | `POST/PATCH /sales` com `categoryId`, `saleDate`, `travelStartDate`, `travelEndDate`, `originText`, `destinationText`, `passengerCount`, `modalityData` | `POST/PATCH /sales` com os mesmos campos em snake_case |
| Produtos | `/travel-products` (já existente) | `GET/POST /catalog-products`, `PATCH /catalog-products/:id` |
| Itens | `/sales/:saleId/items`, `/sale-items/:id/cancel` (já existentes) | `GET/POST /sales/:id/items`, `POST /sale-items/:id/cancel` (somente rascunho) |

### Criação atômica de venda com itens (Full)

O `POST /sales` do Full aceita opcionalmente `items`, uma lista não vazia de
itens no formato do `POST /sales/:saleId/items`. O servidor valida cada linha,
calcula `amount` pela soma dos subtotais e rejeita divergência com o valor
enviado. Venda, itens, auditoria, recebível/receita e pagáveis de fornecedores
são gravados na mesma transação tenant-scoped; qualquer item inválido reverte
todo o conjunto. O usuário autenticado continua sendo a origem de `user_id`,
`agency_id` vem do contexto e nenhum identificador de tenant é aceito no item.

Esse recurso ainda não está exposto no Lite. A regra DEC-007 exige validar o
fluxo correspondente no Full antes de considerar qualquer adaptação Lite.

## Regras

- Criação: campos obrigatórios habilitados são exigidos (`422 FIELD_REQUIRED`); campo
  desabilitado ou fora do perfil é recusado (`422 FIELD_DISABLED`), nunca ignorado.
  `rate`, `base`, `deadline` e `commission` enviados pelo cliente → `422 FIELD_NOT_ALLOWED`.
- Edição valida só os campos enviados e segue o **snapshot** da venda (`form_snapshot`), não
  o perfil atual. Mudar o perfil não altera vendas existentes.
- A venda trava a categoria (`FOR SHARE`) ao tirar o snapshot; a troca de perfil e a
  desativação travam a linha (`FOR UPDATE`). Uma venda nunca mistura revisões.
- Troca de categoria: Full, só venda `PENDING` (409 depois); Lite, só rascunho. Nos dois a venda
  inteira é revalidada contra o novo perfil e recebe novo snapshot.
- "A completar": derivado, sem coluna. Venda cujo snapshot tem campo obrigatório habilitado ainda
  vazio (nulo, vazio ou só espaços). Full: `missingRequiredFields` + `GET /sales?incomplete=true`;
  Lite: `missing_required_fields` + `GET /sales?incomplete=true`. Importações ignoram a
  obrigatoriedade (decisão A2) e por isso ficam "a completar".
- Alterações de configuração são auditadas em modo obrigatório (falha de auditoria desfaz a mudança).
- Lite: com itens ativos, `gross_amount` é a soma dos `line_total`
  (`qty × unit_price − discount + taxes + fees`, mesma fórmula do Full) e não pode ser enviado.
