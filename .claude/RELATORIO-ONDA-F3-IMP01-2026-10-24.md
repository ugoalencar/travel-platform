# Relatório Onda F3 — IMP-01 (importação de vendas conciliada) — estado em andamento

Sem commit/push/deploy. Atualizado a cada etapa.

## Etapa 1 — planejador puro (Full) — FEITA
- `services/api/src/sales-import-plan.ts` + `tests/sales-import-plan.test.ts` (11 ✔, escritos antes): chave natural `sistema|número` (nunca duplica: ALREADY_IMPORTED / DUPLICATE_IN_FILE), A2 (categoria/fornecedor/destino ausentes ou desconhecidos NÃO rejeitam: venda "a completar"), cliente por CPF válido e já existente, data não futura, total/desconto, dinheiro BR, colunas desconhecidas e >2000 linhas recusadas, hash de conteúdo para idempotência de arquivo.
- Decisão: a importação é histórica — **nunca cria comissão nem recebível**.

## Pendente
- Etapa 2: migration 110 (lotes por hash + chaves naturais), serviço (dry-run, confirmar atômico), rotas `/imports/sales/*`, auditoria, teste de banco.
- Etapa 3: UI mínima. Etapa 4: Lite. Etapa 5: revisão Codex e gates.

## Etapa 2 — serviço, rotas, migração 110 e teste de banco (FEITA, 2026-10-24)

- Migração `110_sales_import.sql` (aditiva): `sale_import_batches` (UNIQUE agência+hash do conteúdo) e `sale_import_keys` (UNIQUE agência+sistema+referência externa), RLS forçada, somente SELECT/INSERT (append-only).
- `services/api/src/sales-import.ts` + `routes/sales-import.ts`: `POST /imports/sales/dry-run` e `POST /imports/sales/confirm` (GERENTE+). Confirm exige o `contentHash` do dry-run (409 se diferir), usa advisory lock, repete o resultado gravado se o mesmo conteúdo chegar de novo, grava lote antes das vendas, nunca cria comissão nem recebível, auditoria `SALES_IMPORTED` obrigatória.
- Defeito achado pelo teste e corrigido: a lista `toComplete` do resumo sobrescrevia o contador de mesmo nome; lista renomeada para `toCompleteRows`.
- Teste `tests/integration/database/sales-import.integration.test.ts`: **7/7 verdes** em container próprio (55637): 401/403/400, dry-run sem gravação, confirm com hash, A2 "a completar", relatório de rejeições, replay, chave natural em arquivo diferente (sem duplicar), UNIQUE no banco, append-only, isolamento entre agências, concorrência (duas confirmações simultâneas criam uma vez).
- Gates: `tsc` limpo, eslint sem erros (corrigido também o tipo `PUT` no teste do BAK-01).
- `test:db` completo **não rodado de forma isolada**: há container de outra sessão (`travel-full-ondae2-suite`) ativo; a cargo da integração final. Listas de `database.integration.test.ts` já atualizadas com as duas tabelas novas.

### Pendências IMP-01
- UI mínima em `apps/agency` (dry-run, rejeições, "a completar", confirmar).
- Réplica no Lite (só o que o Full tem) com migração 018 e teste de paridade do planejador.
- Revisão Codex somente leitura.

## Revisão Codex (somente leitura) — NÃO OBTIDA
A execução terminou (exit 0) mas a saída parou no hook de início de sessão, sem achados (`.claude/codex-imp01-out.txt`). Não conta como revisão feita; deve ser reexecutada pela integração.

## Estado final desta sessão
Feito: planejador puro (11 testes), migração 110, serviço, rotas, auditoria, teste de banco 7/7, tsc/eslint limpos.
Não feito: UI em `apps/agency`, réplica no Lite (migração 018), revisão Codex, `test:db` completo isolado.

## Etapa 3 — UI da agência (FEITA)
`apps/agency/src/pages/SalesImportPage.tsx` (rota `/sales/import`, item "Importar vendas" no menu): upload CSV (`,` ou `;`, até 2000 linhas), mapeamento automático e manual de colunas, validação sem gravar com relatório de rejeições e itens "a completar", confirmação com o hash validado. 4 testes de componente; suíte da agência 263/263; tsc limpo.

## Etapa 4 — Lite, Codex e gates (2026-10-25)

### Decisão do usuário: só Full por enquanto
O usuário determinou: implementar somente no Full; depois de pronto e testado no Full, incorporar ao Lite. Comecei a réplica no Lite (migração 018 + `routes/imports.ts`) e **desfiz tudo**: migração 018 removida e as substituições revertidas manualmente em `services/api-lite/src/routes/imports.ts`. O diff restante desse arquivo (`enforce_required: false`) é de outra frente e foi preservado. Nenhuma alteração minha permanece no Lite.

Para a futura réplica (achados): o Lite já tem importação própria (lotes/registros/reconciliação, `enforce_required: false` = A2). Faltam nele a idempotência por hash do arquivo e por chave natural (sistema + `external_reference`), com migração 018 (`content_hash`, `source_system` em `import_batches` + `import_sale_keys` append-only com RLS) e trava `pg_advisory_xact_lock` no confirm.

### Revisão Codex — NÃO OBTIDA
Segunda tentativa falhou: "You've hit your usage limit ... try again at 2:26 AM". Reexecutar depois: `.claude/codex-imp01-prompt.txt` pelo stdin.

### Gates do Full
- `test:db` completo (container próprio `travel-full-imp-suite`): **9 arquivos / 129 testes verdes**. Achado e corrigido: o teste de completude do BAK-01 exigiu classificar `sale_import_batches` e `sale_import_keys` (adicionadas a `tenant-backup-pending.ts`).
- `npm run lint` 0 erros (4 avisos); `npm run typecheck` verde.
- Vitest raiz: 13 arquivos / 180 testes verdes.
- Agência: 263 verdes isolada; em `npm run test` paralelo `SegmentsPage.test.tsx` falhou uma vez por carga (passa isolado, 2/2) — flaky, fora do escopo.
- Suíte `services/api` completa: rodando em segundo plano (resultado em `.claude/imp01-api.log`); a de 500 s expirou, sem resultado.

### Suíte completa `services/api` (resultado final, 2026-10-25)
120 de 124 arquivos verdes; 2106 testes verdes, 1 falho, 101 pulados. As 4 falhas não vêm da IMP-01:
- `financial.test.ts`, `proposal-routes.test.ts`, `sale-routes.test.ts`: colisão de nome de container compartilhado (`travel-platform-postgres-local` já em uso por outro container) ao subir o docker compose; é problema de infraestrutura/paralelismo, não de código (sale-routes é da outra frente, não diagnosticado).
- `customer-platform-auth-http.test.ts` (MFA após 5 códigos errados): recebeu 429 em vez de 401, limitação de taxa sob carga; flaky.
Reexecutar esses 4 isolados na integração final.

## Revisão Codex (25/10/2026 08:2x) e correções

Codex (somente leitura) apontou 2 altas e 4 médias. Tratadas:
- Alta: `parseMoney` alterava valores (`1e3`→13, `(100,00)`→100) e aceitava acima de NUMERIC(10,2). Agora estrito (regex, até 4 casas, teto 99.999.999,99); testes novos.
- Alta: migração 110 sem GRANT ao runtime. Adicionado GRANT SELECT, INSERT (travel_app_runtime / _local), como a 106.
- Média: `external_ref` com `|` truncava a chave natural. Agora rejeitado na linha.
- Média: concorrência entre arquivos diferentes com chave comum. Advisory lock agora por agência + sistema de origem.
- Média: arquivo vazio/excesso de linhas consultava o banco. `rows` validado (1..2000) antes de qualquer consulta.
- Não alterado: confirmar sem dry-run. O hash protege contra arquivo diferente do validado; o plano é recalculado na confirmação por segurança (cadastros podem mudar). Decisão registrada, não é falha de isolamento.
Verificação: planner 11/11, integração da importação 7/7, tsc API limpo. `test:db` completo e as 4 suítes isoladas ainda a rodar.
