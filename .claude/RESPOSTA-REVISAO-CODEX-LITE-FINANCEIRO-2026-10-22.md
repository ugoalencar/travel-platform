# Resposta à revisão do Codex — Travel Lite financeiro

Data: 2026-10-22. Entrada: `.claude/REVISAO-CODEX-LITE-FINANCEIRO-2026-10-22.md` (veredito NO-GO).
Branch `wip/organizacao-2026-10-20`. **Nada commitado, enviado ou publicado.** A API local em
http://127.0.0.1:4010 **ainda não foi reconstruída** com estas correções (depende de autorização do usuário).

## Achados corrigidos (todos com teste de regressão)

| # | Achado | Correção | Onde | Teste |
| --- | --- | --- | --- | --- |
| 1 | P1 detalhe da venda sem `customer` derruba a tela | `GET /sales/:id` usa os mesmos joins/serializador da listagem e devolve `customer`, `seller`, `category`, `payment_method` | `services/api-lite/src/routes/sales.ts` (`SALE_LIST_JOINS`, `SALE_LIST_COLUMNS`, `serializeListItem`) | `tests/review-fixes.test.ts` #1 (contrato: rascunho e confirmada, com e sem forma de pagamento); `apps/travel-lite/src/SalesDetail.test.tsx` (criar → abrir detalhe → confirmar, fixtures no formato do contrato) |
| 2 | P1 override de comissão aprovada gera pagamento acima do devido | `PATCH /commissions/:id` só aceita `PENDING` e `PENDING_RULE`; `APPROVED`/`PAID`/`CANCELLED` => 409. O override preserva o snapshot (`overridden`, `manual`, `previous_amount` somados ao original) e a auditoria guarda o valor anterior | `routes/commissions.ts` | `review-fixes` #2: aprovada recusada, payable segue R$ 100 e pago R$ 100; pendente mantém `rule_type`/`rate` e `previous_amount` |
| 3 | P1 rota legada contorna `commissions.rules_manage` | `POST/PATCH /sellers` com `commission_*` exigem `commissions.rules_manage` (403 sem ela); o espelhamento ganhou auditoria obrigatória (`COMMISSION_RULE_CREATED/REVISED`, `metadata.source = seller_legacy_fields`) | `routes/sellers.ts` (`requireRulesPermission`), `commission-engine.ts` (`mirrorSellerRule`) | `review-fixes` #3: com REVOKE explícito, versão/PATCH/POST legado => 403 e nenhuma versão criada; dados do vendedor sem comissão continuam permitidos; com permissão, auditoria gravada |
| 4 | P1 estorno de recebimento sem recuperação da comissão paga | **Bloqueio seguro**: estornar um recebimento que deixaria a comissão `ON_RECEIPT` paga acima do liberado => 409, transação revertida (nada é estornado). A compensação/recuperação continua sendo a decisão D8 (ainda não implementada) | `finance.ts` (`assertCommissionsStillCovered` em `reversePayment`) | `review-fixes` #4: pagamento e comissão `PAID` preservados, nenhum espelho de estorno criado |
| 5 | P2 arredondamento progressivo diverge da memória | O valor da comissão é a soma das fatias **já arredondadas** (um só critério) | `commission-engine.ts` (`sliceAcrossTiers`) | `review-fixes` #5: base 1,00, duas fatias de 0,50 a 1% => fatias [0,01; 0,01] e total 0,02 |

## Condições do Codex e estado

1. **Corrigir e adicionar regressão aos cinco achados** — feito (acima).
2. **Escopo pendente / reconciliar spec e ADR** — a spec ganhou, no cabeçalho, uma tabela de estado
   (implementado × não implementado × descartado) e a seção 12.4 (correções desta revisão); o ADR continua
   **Proposta**, agora com nota do que já está em código local. **Pendentes, de novo explícitos**: folha do Lite,
   fila de aprovação de cancelamento/alteração de venda, revisão retroativa (Fase 5), bônus/teto (D7) e recuperação
   negativa (D8). Sobre a escolha financeira global: foi mantido como está registrado — **descartada por decisão do
   usuário nesta conversa (12.3), sem verificação do Codex; não a restaurei nem a tornei definitiva**: depende de
   confirmação do usuário.
3. **Suíte oficial verde e ciclo pela interface** — suíte Lite **227/227** (corrigi as duas expectativas de mensagem
   em inglês que o Codex apontou: `tests/catalog.test.ts:86` e `tests/customers.test.ts:56`, agora conferem o texto
   em português já existente no HEAD). Ciclo pela interface: coberto por teste de componente com contrato; **não
   repeti o fluxo completo no Chrome** (o Codex tem a fixture `.tmp/lite-financial-audit*` para isso).
4. **Migrações Lite 008–011 e Full 099 são de esquemas distintos** — confirmado; estão em
   `infrastructure/migrations-travel-lite` e `infrastructure/migrations`, respectivamente. Nenhuma foi aplicada em
   ambiente real; as do Lite estão aplicadas só no banco local de desenvolvimento e nos de teste.
5. **Publicação** — nada feito; continua HOLD.

## Verificação executada agora

| Escopo | Resultado |
| --- | --- |
| API Lite (suíte completa) | **227/227** (26 arquivos; +5 de `review-fixes`) |
| Frontend Lite (suíte completa) | **129/129** (11 arquivos; +1 `SalesDetail`) |
| Typecheck API Lite e frontend Lite | passou |
| Lint API Lite (`src`, `tests`) e frontend Lite | passou, sem erros |
| Full / agency | **não reexecutado** — nenhum arquivo do Full foi tocado nesta rodada |
| `git diff --check` | sem erros de espaço em branco (apenas avisos de fim de linha LF/CRLF pré-existentes do Git) |
| Navegador | não repetido nesta rodada |

## Pontos para o Codex reavaliar

- **Achado 2** foi resolvido por *recusa* (409), não por ajuste: quem hoje corrigia manualmente uma comissão já
  aprovada perde essa via até existir o lançamento de ajuste (Fase 5). É a opção mais segura sem ajustes.
- **Achado 4** foi resolvido por *bloqueio*: é possível que o negócio queira estornar o recebimento mesmo assim e
  recuperar o valor do vendedor; isso exige o fluxo D8.
- O contrato do detalhe da venda agora é o mesmo da listagem; confirmar se algum outro consumidor dependia do
  formato antigo (busquei no frontend do Lite: só a `SalesPage`, que sempre usa o detalhe por `GET`).
- Não foi investigado se há outras rotas de escrita de regra além de `commission-rules` e `sellers`
  (`mirrorSellerRule` é a única chamadora no código atual).

**HOLD** para publicação mantido.

---

# Rodada 2 — resposta à REAVALIACAO-CODEX (NO-GO mantido)

Entrada: `.claude/REAVALIACAO-CODEX-LITE-FINANCEIRO-2026-10-22.md`. Nada commitado/publicado. A API local (4010)
**ainda não foi reconstruída** com estas correções (depende de autorização).

## P1 #1 — Confirmar venda pela interface retornava 400

- Causa: `apps/travel-lite/src/api.ts` enviava `Content-Type: application/json` mesmo sem corpo; o Fastify responde 400
  (`FST_ERR_CTP_EMPTY_JSON_BODY`). Afetava todo comando sem corpo da abstração: `POST /sales/:id/confirm`,
  `POST /sales/:id/cancel` e `POST /auth/logout`.
- Correção: o cabeçalho `content-type` só é enviado junto com o corpo (`api()`), sem workaround no teste.
- Regressão: `apps/travel-lite/src/apiTransport.test.ts` executa `fetch` real contra um Fastify real (parser JSON padrão):
  controle que prova o 400 do servidor com a combinação antiga; confirm/cancel/logout sem corpo passam; JSON só com corpo
  (inclui `{}`); GET sem content-type.

## P1 #2 — Bloqueio de estorno não era seguro sob concorrência

- Causa: `assertCommissionsStillCovered` lia o pago sem serializar com o pagamento da comissão (que lê o liberado, depois
  atualiza o payable).
- Correção (`services/api-lite/src/finance.ts`, `routes/cash-flow.ts`): **um advisory lock por venda**
  (`commissionReleaseLockKey` / `lockCommissionRelease`), tomado **primeiro** nos dois caminhos — pagamento de payable de
  comissão e estorno de recebimento da venda — antes de qualquer lock de linha (ordem total única => sem deadlock).
  Depois do lock, ambos releem liberado/pago (READ COMMITTED enxerga o commit do outro). Rollback e auditoria obrigatória
  preservados (o 409 reverte a transação).
- Regressão: `tests/commission-concurrency.test.ts` — (1) o pagamento espera o lock da venda; (2) o estorno espera o mesmo
  lock e, após o pagamento, é recusado (nenhum espelho criado); (3) 6 rodadas de pagamento x estorno simultâneos: nunca
  pago > liberado, resultado sempre um dos três consistentes. **Mutação**: com o lock do pagamento desativado os testes (1)
  e (3) falham (restaurado em seguida).

## Gates desta rodada

| Gate | Resultado |
| --- | --- |
| API Lite completa | **230/230** (27 arquivos) |
| Frontend Lite completo | **132/132** (12 arquivos) |
| Typecheck / lint API Lite e frontend Lite | passaram |

Limites: o ciclo completo no Chrome (aprovação, recebimento, pagamento) não foi repetido por mim; a fixture do Codex
`.tmp/lite-financial-audit*` cobre isso. Pendências de escopo e HOLD de publicação inalterados.
