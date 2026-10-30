# Relatório — Onda B (Frente 3) — 23–24/10/2026

**Estado (atualizado 24/10): Full e Lite implementados e validados nos gates. Nada commitado. Todos os bloqueantes das 2 rodadas do Codex foram corrigidos; as correções da 2ª rodada do Lite (custo no PATCH e sort_order na UI) e as 3 do Full (rodada 2) não foram reenviadas ao Codex.**

## Entregue (não commitado)
**Full:** migration `101_sale_categories_and_form_profile.sql` (`commission_categories`, `sale_category_fields`, colunas em `sales`: `category_id`, `sale_date`, viagem, `modality_data`, `form_snapshot`); registro de campos `services/api/src/sale-form-fields.ts`; `sale-categories.ts` + `routes/sale-categories.ts`; `sales.ts` (criação/edição com perfil, snapshot, `FOR SHARE`); `commercial-input-parsing.ts`; `errors.ts` (422 `FormFieldError`); `audit-log.ts` (`required`); inventário de rotas; grants em `tests/integration/database/002_prepare_local_roles.sql`; UI `NewSalePage`, `SaleCategoriesPage`, `lib/saleFormFields.ts`, `lib/parseMoneyInput.ts`; docs `docs/05-api/sale-categories-and-form-profile.md`.
**Lite:** migration `012_sale_form_profile_products_items.sql`; `sale-form-fields.ts`, `sale-items.ts`, rotas `sale-forms`, `catalog-products`, `sale-items`, `sales.ts` integrado; `tenant-backup.ts` (arquivo não rastreado de outra sessão, só adicionei 3 tabelas); UI `saleForm.ts`, `SaleCategoryFormFields`, `SaleItemsPanel`, `SaleFormProfileSection`, `CatalogProductsSection`, `SalesPage`, `CatalogPage`; manual e ajuda.

## Testes (falhavam antes = módulo/migration inexistente)
- Full: `sale-form-fields.test.ts` (20 ✔), `sale-categories-http.test.ts` (20 ✔ na 1ª rodada; testes novos de backfill, auditoria obrigatória e corrida **não rodados ainda**), UI agency 10 ✔ + `parseMoneyInput`.
- Lite: `sale-form-fields.test.ts`, `sale-forms-catalog.test.ts` (27 ✔ após follow-ups), suíte api-lite completa 315 ✔ (antes dos follow-ups), UI `saleFormCatalog.test.tsx` 20 ✔, `SalesDetail.test.tsx` ajustado ✔.
- Os testes de follow-up do Lite foram escritos depois das correções (não vistos falhando antes).

## Gates
Rodados parcialmente: typecheck ✔ (antes dos últimos patches Full/Lite: Full tsc ✔ após os patches), lint ✔ nos arquivos novos, `migrations:validate` ✔, `secrets:scan` ✘ só por achados preexistentes (nenhum em arquivos meus). **Não rodados:** `npm run test` completo, `test:db`, `build`. Suíte alvo do Full (testes que usam `sales` com migrations parciais, ex.: `sales.test.ts`, `sale-e2e.test.ts`) estava rodando em segundo plano; **resultado não lido**. Esses testes provavelmente precisam de `101_...` na lista de migrations (Codex bloqueante #2).

## Codex (gpt-6.1-sol, somente leitura)
Full — corrigidos: snapshot x perfil concorrente (FOR SHARE), desconto inválido na UI, resposta atrasada, data padrão (America/Sao_Paulo), auditoria obrigatória, teste de backfill (escrito, não rodado). **Pendente:** regressão em testes existentes com migrations até 024.
Lite — corrigidos no código: importação com campos obrigatórios (`enforce_required:false`), resposta atrasada no editor, zerar bruto ao cancelar último item, fornecedor padrão do produto, bruto derivado aceito no PATCH, corrida no cancelamento, auditoria de reordenação. **Troca de categoria no Full** (paridade, bloqueante #4): código feito em `sales.ts`/parser (só rascunho `PENDING`), **teste ainda é o antigo** em `sale-categories-http.test.ts:331` (espera recusa) e vai falhar; precisa ser reescrito. Nenhum desses fixes foi revalidado pelo Codex.

## Não verificado / depende do usuário
- Rodar tudo acima; reenviar ao Codex.
- Q4 permissões: reaproveitei `settings.manage` (Lite) e ADMIN (Full) — confirmar.
- Importação ignora obrigatoriedade (A2) — confirmar.
- Lite: `sale_date` padrão ainda usa data UTC (preexistente). Passageiros/`sale_passengers` e campos de cliente (Frente 2) fora desta entrega. Sem outbox para produtos/itens (CHECK do outbox).
- Container `travel-full-ondab-test` (porta 55610) e a suíte alvo (container 55432) podem ter ficado ativos; nada do demo/55436/4010/55438 foi tocado.

## Atualização final
- Decididos pelo usuário: **Q4** (só administradores configuram categorias: ADMIN no Full, `settings.manage` no Lite) e **A2** (importação ignora obrigatoriedade; vendas importadas ficam "a completar").
- "A completar": derivado do snapshot (sem coluna), `missingRequiredFields`/`missing_required_fields`, filtro `?incomplete=true`, selo e checkbox nas listas do Full e do Lite.
- Gates Full: lint ✔, typecheck ✔, build ✔, `services/api` 1928/1929 (única falha: MFA 429 preexistente), `test:db` 13/13 (listas de tabelas atualizadas), agency 191+ ✔, `sale-categories-http` 27 ✔, `sales.test`/`sale-e2e` voltaram a passar. `secrets:scan` falha só por achados preexistentes.
- Gates Lite (porta 55600): api-lite 323 ✔, frontend 171 ✔, lint ✔, typecheck ✔, build ✔.
- Codex: rodada 1 (HOLD) e rodada 2 (Full: 3 bloqueantes novos corrigidos; Lite: PATCH só-bruto zerava custo e UI perdia sort_order, corrigidos). Revisão final pós-correções não repetida.
- Autoria: todo o código e testes foram feitos por mim; o Codex só revisou (somente leitura).
- Containers de teste removidos.

## Atualização 24/10 (final)
- Correções delegadas aplicadas: Full valida `productId` e torna criação/cancelamento de item atômicos (venda travada, `updateSale` aceita client); migration 102 (`travel_products.category_id`, FK composta) + API; Lite: só MASTER/ADMIN escrevem categorias e perfil (`requireAdministrator`), precisão dos itens = Full (qty 10,2; valores 12,2; `SALE_ITEM_LIMITS` com teste de paridade).
- Achados da 3ª revisão do Codex corrigidos: decimais por tolerância (1.1 aceito), custo de fornecedor arredondando a zero recusado antes de gravar, `getSaleById/updateSale` no client recebido.
- Gates (rodados sozinhos, containers próprios): Full api 1976/1977 (única falha: MFA 429 preexistente), `test:db` 17/17, agency 204 ✔, build ✔, typecheck ✔, lint ✔ (após ajuste final de teste); Lite api 336 ✔ (porta 55600), frontend 171 ✔.
- **Codex:** 4ª revisão NÃO concluída (limite de uso da conta Codex até 05:13); as correções finais acima não foram revalidadas por ele. Autoria: todo o código é meu; Codex só revisou.
- Não verificado: createPayable do item (Full) continua fora da transação do item (preexistente); sem tela de produtos no Full; `sale_passengers`/Frente 2 fora do escopo; sem outbox para produtos/itens no Lite.
- Todos os testes do Full passaram a aceitar `DATABASE_TEST_CONTAINER_NAME`/`DATABASE_TEST_PORT` (padrão inalterado). Containers removidos.
