# Relatório Onda B2 — Pendências de CEP-01 e CSV-01 (2026-10-24)

Escopo: fechar as pendências deixadas pela revisão do Codex (somente leitura) em CEP-01 e CSV-01, **Full primeiro**, depois Lite onde coube. Sem commit, sem push, sem migração, sem tocar demo (4010 / 55436), porta 55438, Supabase, Render, Vercel ou Gadotti.

## 1. Resumo

| Item | Resultado |
|---|---|
| CEP (a) upstream com `cep` inválido → `CEP_INVALID_RESPONSE` | Corrigido no Full e no Lite |
| CEP (b) teste de rota pelo `buildApp` real | Criado (`cep-app.test.ts`, 7 testes) |
| CEP (c) tetos de 10 consultas concorrentes e 1.000 principals | Testes criados no Full e no Lite |
| CEP (d) modal: salvar manual após falha / fechar com consulta pendente | 2 testes de integração criados |
| CSV (a) teto de linhas/bytes sem truncar | 50.000 linhas e 10 MiB → `422 REPORT_TOO_LARGE`; Lite idem |
| CSV (b) CR/CRLF, prefixos tab/CR, fórmula+aspas/vírgula/quebra, filename malicioso | Testes criados |
| CSV (c) teste com banco, autenticação e duas agências | Criado e passando (`test:db`) |
| Botão Exportar CSV no Full (`apps/agency`) | Implementado com testes |
| Lite | Botão de exportação **já existia** (`ReportsPage`, `SellerReportPanel`); portadas as correções (CEP e teto de linhas) |

## 2. Arquivos alterados

Full — API
- `services/api/src/cep.ts` — `cep` do upstream inválido/ausente/não-string agora gera `CEP_INVALID_RESPONSE` (502 sanitizado), não `CEP_UNAVAILABLE`.
- `services/api/src/report-csv.ts` — `MAX_CSV_ROWS = 50_000`, `MAX_CSV_BYTES = 10 MiB`; `sendReportCsv` responde `422 {code: REPORT_TOO_LARGE}` com mensagem em pt-BR, sem cabeçalho de download, `cache-control: private, no-store`. `toCsv` aceita `maxBytes` e **aborta a serialização** ao ultrapassar (não monta o corpo gigante).
- Testes: `tests/cep.test.ts` (+6), `tests/cep-app.test.ts` (novo), `tests/report-csv.test.ts` (+≈25), `tests/integration/database/reports-csv.integration.test.ts` (novo, banco; movido para `test:db` por seguir `QUALITY-GATES.md`).

Full — UI (`apps/agency`)
- `src/lib/api.ts` — novo `api.downloadCsv(path)` (mesmo cabeçalho de autenticação e tratamento de 401 do `api.get`; acrescenta `format=csv` ao mesmo caminho filtrado; exige `text/csv`; nome do arquivo só aceito se `^[a-z0-9-]+\.csv$`, senão `relatorio.csv`).
- `src/pages/ReportsPage.tsx` — botão **Exportar CSV** nos Relatórios gerenciais (Vendas, Financeiro, Rentabilidade, Pessoal). O caminho do relatório foi extraído para `reportPath`, usado pela tabela **e** pela exportação (filtros/aba/agrupamento idênticos). Download via blob + `<a download>`; erro (ex.: 422) exibido em `role="alert"` sem apagar a tabela; botão desabilitado durante exportação.
- Testes: `src/pages/ReportsCsvExport.test.tsx` (5), `src/lib/downloadCsv.test.ts` (5), `src/pages/CustomerDetailPage.test.tsx` (+2: salvar manual após falha do provedor; fechar/reabrir modal com consulta pendente → abort + resposta tardia ignorada).

Lite
- `services/api-lite/src/cep.ts` — mesmo conserto do `cep` inválido e JSON malformado → `CEP_INVALID_RESPONSE` (achado do Codex nesta rodada).
- `services/api-lite/src/report-csv.ts` — `REPORT_ROW_LIMIT`, `rowsWithinLimit()`.
- `services/api-lite/src/sales-analytics.ts` e `src/routes/reports.ts` — consultas passaram a buscar `LIMIT+1`; relatórios de vendas, vendedores e comissões respondem `422 REPORT_TOO_LARGE` em vez de truncar silenciosamente. O **dashboard mantém o truncamento histórico** (ver pendências).
- Testes: `tests/cep.test.ts` (+5), `tests/report-csv-security.test.ts` (+2).

## 3. Testes: quais falhavam antes

Escritos antes da correção e vistos falhando:
- `cep.test.ts` / `cep-app.test.ts`: `cep` upstream `'abc'`, `''`, número, ausente → recebia `CEP_UNAVAILABLE` (3 falhas no Full). Lite: 4 falhas.
- `report-csv.test.ts`: falhava ao importar `MAX_CSV_ROWS`/`MAX_CSV_BYTES` (inexistentes) — todo o arquivo.
- Lite `report-csv-security.test.ts`: `rowsWithinLimit is not a function` (2 falhas).

Já passavam (lacuna de cobertura, não bug): tetos de 10 concorrentes e 1.000 principals; os 2 testes do modal; CR/CRLF/tab; fórmula combinada; filename malicioso; teste de banco com duas agências; rota via `buildApp`.

## 4. Decisões adotadas (padrão conservador, usuário ausente)

- Teto de CSV: **50.000 linhas ou 10 MiB**, o que ocorrer primeiro. Falha clara (422, pt-BR), nunca corta.
- Lite: relatórios de vendas/vendedores/comissões **falham** acima do teto também em JSON (totais sobre subconjunto seriam incorretos). Dashboard não alterado para não quebrar tela que funciona.
- Autenticação do teste de banco: `authProvider` que lê o usuário **da tabela `users`** (papel e agência vêm do banco) + `validateUserAgencyAccess` consultando o banco, passando pelo `createAuthenticateHook` real. O fluxo de login com sessão/MFA não foi repetido (coberto por `auth-http.test.ts`).
- Teste de banco movido para `tests/integration/database/` (gate `test:db`), contêiner próprio `travel-full-csv-b2-int`, porta 55621.

## 5. Gates

| Gate | Resultado |
|---|---|
| `services/api` typecheck | OK |
| `services/api` lint dos arquivos tocados | OK (lint do workspace inteiro tem 3 erros pré-existentes em `tests/sale-item-routes.test.ts`, de outra frente, não tocados) |
| `services/api` testes dos arquivos tocados (`cep*`, `report-csv`, `reports-csv-http`) | 131 passando |
| `apps/agency` lint dos tocados / typecheck / build | OK |
| `apps/agency` suíte completa | 27 arquivos, 204 testes passando (antes das 2 últimas edições de teste; `downloadCsv.test.ts` reexecutado: 5/5) |
| `services/api-lite` typecheck / lint tocados / build | OK |
| `services/api-lite` suíte completa (porta 55600) | 33 arquivos, 331 testes passando (antes do último ajuste do CEP/JSON malformado; os arquivos `cep.test.ts` e `report-csv-security.test.ts` reexecutados depois: 51/51) |
| `apps/travel-lite` build | OK |
| `npm run test:db` (contêiner próprio, porta 55622 + 55621) | 2 arquivos, 17 testes passando |
| Full API suíte completa | **Ver seção 7** |

## 6. Revisão final do Codex (somente leitura, `gpt-6.1-sol`)

Achados e tratamento:
1. **Média, bloqueante** — Full: CSV inteiro serializado antes da checagem de 10 MiB; consultas carregam tudo. → Tratado em parte: `toCsv` agora aborta ao cruzar o teto de bytes e o teto de linhas é checado antes. As consultas SQL de relatório do Full agregam por grupo (linhas = cardinalidade do agrupamento, não de vendas) e **não ganharam `LIMIT`** (ver pendências).
2. **Média, bloqueante** — Lite: truncamento silencioso no JSON. → Corrigido: relatórios de vendas/vendedores/comissões agora são estritos também em JSON. Resíduo: dashboard.
3. **Média, bloqueante** — teste de banco na suíte rápida contra `QUALITY-GATES.md`. → Corrigido: movido para `tests/integration/database/*.integration.test.ts` (gate `test:db`).
4. Baixa — Lite: JSON malformado do ViaCEP → `CEP_UNAVAILABLE`. → Corrigido + teste.
5. Baixa — asserção `not.toContain('999')` frágil (UUID). → Corrigida para casar a coluna numérica.
- Sem vazamento entre agências nem bypass de fórmula encontrados. Observação: o download real no navegador não é provado (o teste mocka `click()` da âncora).

## 7. O que não foi verificado / pendências

- **Suíte completa do Full API**: duas execuções completas foram disparadas por engano em paralelo (uma antes e outra depois das últimas edições) e **colidiram nos contêineres de nome fixo** (`travel-platform-postgres-local`/55432 etc.), então muitos arquivos DB-backed apareceram como "skipped" por falha de `beforeAll`. O encerramento forçado dos processos foi negado pelo ambiente. Resultado dessa suíte **não deve ser considerado**; os arquivos tocados passam isoladamente e `test:db` passou. Recomendo reexecutar `services/api` sozinho quando as outras sessões não estiverem usando Docker.
- Download no navegador real (blob/âncora) não foi exercitado em browser; só em jsdom com mocks.
- Full: consultas de relatório sem `LIMIT` no SQL (follow-up: `LIMIT 50001` nas consultas, como no Lite).
- Lite: dashboard (`routes/dashboard.ts`) segue truncando silenciosamente em 50.000 vendas — decisão de produto pendente (mostrar aviso na UI).
- Lite: botão de exportar já existe; não foi alterado nem testado novamente na UI além da suíte existente (`App.test.tsx`).
- Teste de banco não repete o login com sessão/MFA.
- Nenhum commit/push feito. Arquivos de outras frentes (vendas/categorias) preservados; `services/api/src/routes/reports.ts`, `services/api-lite/src/routes/reports.ts` e `services/api-lite/tests/reports.test.ts` já estavam modificados por outro trabalho — editei somente as linhas descritas acima no Lite (`routes/reports.ts`).
- Logs temporários das execuções paralelas ficaram em `.claude/tmp-b2/` (`api.log`, `api2.log`, `testdb.log`) porque os processos ainda os mantinham abertos; podem ser apagados depois.
- Números finais das duas execuções paralelas do Full API (ambas inválidas como gate): execução 1 = 57 arquivos falhando, 15 testes falhando, 897 pulados; execução 2 = 29 arquivos falhando, 76 testes falhando, 571 pulados. Falhas somente em arquivos com banco (auth, customers, offers, financial, partners, media-library etc.), nenhum de CEP/CSV/relatórios. Causa (colisão de contêineres de nome fixo) é hipótese, não confirmada nos logs; não se sabe se as falhas existem sem as minhas mudanças. Falta reexecutar a suíte sozinha.

## 8. Fechamento (orientação da sessão coordenadora)

- Suíte completa do Full API: **não rodada de forma isolada; a cargo da integração final.** As execuções descritas acima são inválidas como gate (colisão com outras suítes de banco). Falhas em `sales.test.ts` e `sale-item-routes.test.ts` são de outra frente (Onda B) e não foram diagnosticadas aqui.
- `test:db` completo e a suíte completa não serão reexecutados por esta sessão enquanto houver contêineres de teste de outras sessões.
- Revisão do Codex (somente leitura) dos arquivos desta tarefa: feita; achados e tratamento na seção 6.
