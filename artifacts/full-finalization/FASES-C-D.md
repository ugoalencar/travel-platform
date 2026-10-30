## Retomada — escritor único — 2026-10-25

Escopo: somente Full. Nenhum agente delegado, teste de banco, migration aplicada, acesso a ambiente online, commit, push ou deploy nesta rodada. Lite e os ambientes excluídos pelo usuário foram preservados.

As migrations 112, 113 e 114, as oito suítes de banco indicadas e o E2E da excursão foram confirmados pelo usuário como aprovados pelo Claude. Não foram repetidos. Essa confirmação não valida a nova migration 115 nem os testes ampliados nesta rodada.

**Local do relatório:** a escrita em `.codex/RELATORIO-FINALIZACAO-FULL-2026-10-25.md` foi recusada pelo ambiente, tanto por `EPERM` quanto pelo editor de patches. O relatório consolidado está em `artifacts/full-finalization/RELATORIO-FINALIZACAO-FULL-2026-10-25.md`, preservando as seções anteriores e acrescentando estas seções. A ferramenta `work_state_read/write` também foi recusada pela política de aprovação; o estado desta entrega está neste arquivo.

## Fase C — D8, D9 e D10

- D8 preservado: política `PER_SALE`/`BATCH_WINDOW`, janelas configuráveis, fechamento e recebimento auditados, UI `RevenueBatchesPanel` em `AgencyRevenuePage`. Migration: `114_agency_revenue_batches.sql`, já validada no banco 55644 conforme confirmação do usuário.
- D9 conferido: filtros `saleFrom`, `saleTo`, `travelFrom`, `travelTo`, `origin`, `destination`, `categoryId`, `supplierId`, `employeeId`, `productId` e `status`; seleção por agência da sessão, parâmetros SQL e `EXISTS` sem multiplicar obrigações. Os quatro CSVs usam os mesmos serviços/filtros do JSON. Receita usa `expected_payment_date` do lote. Comissões continuam separadas da receita.
- Novo teste HTTP sem banco aplica simultaneamente todos os filtros aos quatro relatórios, compara chamadas SQL/parametrização de JSON e CSV e confere a data e os totais de comissão/receita. Também valida datas/ranges e o inventário das rotas.
- Teste de banco de projeções ampliado com comissão real, recebimento parcial, categoria, funcionário, fornecedor, lote e data esperada; confere os filtros combinados, cada filtro divergente, JSON e CSV. Atualizado o teste antigo que esperava rejeição dos filtros de fornecedor/produto agora suportados. **NAO EXECUTADO**.
- D10 preservado: pendências de importação em snapshot e conclusão pelos campos históricos; dashboard consome widgets ordenados/visíveis e filtra permissões. Suítes locais existentes incluídas na execução completa; E2E de importação confirmado pelo usuário.
- Inventário complementado para projeções, configuração e visualização do dashboard, importação de vendas, regras/ações de receita, lotes e backup, com os papéis correspondentes ao servidor. Fechamento/recebimento de lote exigem ADMIN; backup exige OWNER exato.
- Decisão: o filtro `status` representa o status da venda, como descrito na UI. Não foi inventado calendário de recebimento.

Arquivos herdados da Fase C: `services/api/src/agency-revenue-batches.ts`, `routes/agency-revenue.ts`, `report-projections-service.ts`, `routes/report-projections.ts`, `sales-import-completion.ts`, `sales-import.ts`, `sales.ts`; `apps/agency/src/components/RevenueBatchesPanel.tsx`, `AgencyRevenuePage`, `ProjectionsPage`, `DashboardPage`, `DashboardWidgets` e testes correspondentes. Esta retomada alterou o inventário, o rótulo de funcionário nas projeções e os testes descritos acima; preservou as correções do Claude informadas pelo usuário.

## Fase D — D11: BAK-01

- Manifesto com **141 tabelas incluídas e 21 exclusões justificadas**; `PENDING_INVENTORY=[]`. Inclui comissões, regras/versões/faixas, atribuições, perfis, eventos de liberação, folha, contas a pagar/receber, pagamentos/alocações, condições/histórico/estornos, receita/lotes, permissões individuais, campos/categorias/dashboard e chaves de importação.
- Credenciais, sessões, MFA e tabelas com tokens permanecem excluídas. Casos de suporte, assinatura SaaS/créditos da plataforma e trilhas de auditoria têm exclusão explícita. `CLASSIFIED` informa inventário encerrado; não significa cópia de credenciais, infraestrutura ou arquivos binários de storage.
- Exportação mantém uma única fotografia MVCC; a agregação por união de tabelas evita o limite de argumentos de `jsonb_build_object` com o manifesto ampliado.
- Restauração valida manifesto completo/sem duplicatas, hashes, fingerprint de schema e agência em cada registro. Exige destino vazio, consulta dependências reais no catálogo, preserva identidades e recalcula colunas geradas. Grupos financeiros cíclicos são inseridos em uma instrução com CTEs; constraints, RLS e triggers ficam ativos. Confere contagens e hashes antes do commit e usa lock por agência para concorrência entre restaurações.
- API `POST /settings/backup/restore`: OWNER exato, reautenticação existente, arquivo vinculado à agência e hash do relatório de verificação atual; auditoria obrigatória `BACKUP_RESTORED`. Recusa sobrescrita. Limites de payload ajustados nas rotas de arquivo.
- Configurações → Backup: exportar/baixar arquivo criptografado, carregar arquivo, verificar tabelas/conflitos e restaurar dados verificados. A reautenticação atual continua bloqueando contas com MFA inscrito. Não há limpeza automática nem agendamento.
- Testes locais cobrem manifesto, corrupção, linhas de outra agência, colunas proibidas e SQL de recuperação cíclica; componentes cobrem download, verificação, bloqueio de conflito e restauração com relatório/reautenticação.
- Integração ampliada cobre A → exportação → limpeza exclusiva do ensaio descartável → restauração → hashes/contagens/totais idênticos. Fixtures incluem comissão versionada/faixa/atribuição, ciclo item→conta a pagar→comissão→receita→item, folha, eventos, condições, estorno, receita/lote, permissões e importação. Confere também hashes e totais de B intactos, sequência de atribuições e o fluxo HTTP. **NAO EXECUTADO**.

### Migration 115 — NAO EXECUTADO

`infrastructure/migrations/115_tenant_backup_restore.sql`: adiciona função delimitada para sincronizar a sequência de atribuições após preservar `seq` histórico. Verifica OWNER ativo no contexto, não recebe parâmetros, fixa `search_path`, revoga EXECUTE de PUBLIC e concede apenas aos runtimes previstos. O avanço considera o máximo persistido e não reduz a sequência. O bloqueio da tabela impede colisão com inserções concorrentes durante a sincronização.

A própria migration contém grants SELECT/INSERT do manifesto e EXECUTE da função. Os mesmos grants condicionais estão em `002_prepare_local_roles.sql`, compatíveis com suítes legadas que carregam subconjuntos de migrations. Não cria tabelas: as listas de tabelas esperadas permanecem as da 114; a lista de funções esperadas em `database.integration.test.ts` ganhou a nova função. Nenhuma migration 001–114 foi editada nesta rodada.

Decisões documentadas na ADR-011: destino com a mesma agência/IDs; identidades e referências excluídas provisionadas previamente pelo operador; nenhuma sobrescrita; backups parciais antigos/fingerprint incompatível são recusados. A recuperação deste manifesto ampliado ainda depende da prova em PostgreSQL. Storage binário, operação em múltiplas instâncias e ensaio humano continuam fora da prova local.

## Fase D — D12: configuração financeira

Nova rota `/financial/settings`, com seis abas: condições, formas/regra de recebimento, receita/lotes, regras de comissão, liberação/perfil e categorias de venda. Reutiliza as páginas existentes. `CommissionReleasePage` aceita seção de formas ou perfil; sua rota antiga conserva ambas. As abas aceitam link por `?tab=` e normalizam valor desconhecido. O menu foi consolidado em “Configuração financeira”; todas as rotas antigas continuam registradas. A página operacional de folha e os planos legados permanecem disponíveis.

Teste de componente cobre alternância das seis abas e links diretos. Os formulários e controles de servidor existentes permanecem responsáveis pelas permissões de cada ação.

## MFA — causa e correção do teste

O limite HTTP padrão de `AUTH_RECOVERY` permite cinco requisições em quinze minutos por rota/IP; a sexta é 429 antes da consulta de sessão. O teste fazia cinco erros e uma sexta verificação, esperando 401 também nessa última chamada. Não é falha de invalidação comprovada no código: os dois controles se sobrepunham no teste.

O cenário de invalidação persistida agora usa orçamento HTTP 10 **somente naquele teste**, preservando as cinco falhas do desafio. Um teste HTTP sem banco comprova separadamente cinco respostas 401 e a sexta 429, sem sexta consulta de sessão. O limite do produto não foi aumentado. O teste com banco de invalidação continua **NAO EXECUTADO**; o teste HTTP do limite passou localmente. O projeto Docker da suíte aceita override explícito para isolamento.

## Arquivos desta retomada

- API: `services/api/src/tenant-backup.ts`, `tenant-backup-pending.ts`, `routes/backup.ts`, `audit-log.ts`, `route-inventory.ts`.
- API testes: `services/api/tests/tenant-backup-manifest.test.ts`, `report-projection-filters-http.test.ts`, `rate-limit.test.ts`, `customer-platform-auth-http.test.ts`.
- Agência: `apps/agency/src/components/settings/TenantBackupTab.tsx` e teste; `pages/FinancialSettingsPage.tsx` e teste; `CommissionReleasePage.tsx`, `SettingsPage.tsx`, `ProjectionsPage.tsx`, `App.tsx`, `components/layout/Sidebar.tsx`.
- Correções de testes existentes: `apps/agency/src/pages/ReceivablesPage.test.tsx` aguarda os dados da API; `apps/agency/src/lib/downloadCsv.test.ts` verifica o tipo/conteúdo do blob sem depender do construtor de outro ambiente jsdom/fetch.
- Banco: migration 115; `tests/integration/database/002_prepare_local_roles.sql`, `database.integration.test.ts`, `tenant-backup.integration.test.ts`, `report-projections.integration.test.ts`.
- Documentação: ADR-011, ponte na ADR-010, atualização de `docs/08-devops/backup-por-agencia-ensaio.md` e este relatório complementar. Listas/runner/logs de validação em `artifacts/full-finalization/`.

## Validação executada nesta rodada

Os resultados finais estão nos logs homônimos de `artifacts/full-finalization/`. Os comandos abaixo usam Bun sem carregamento automático de arquivos de ambiente. O runner da API fixa `NODE_ENV=test` e `RATE_LIMIT_STORE=memory` somente no subprocesso de teste e seleciona os 59 arquivos sem PostgreSQL. Os 70 arquivos dependentes de banco estão listados separadamente em `db-tests.json` e não foram executados.

| Comando | Resultado final |
| --- | --- |
| `bun --no-env-file node_modules/typescript/bin/tsc -p services/api/tsconfig.json --noEmit` | exit 0 |
| `bun --no-env-file node_modules/typescript/bin/tsc -p apps/agency/tsconfig.json --noEmit` | exit 0 |
| `bun --no-env-file node_modules/eslint/bin/eslint.js "services/api/src/**/*.ts" "services/api/tests/**/*.test.ts" "apps/agency/src/**/*.{ts,tsx}" "tests/integration/database/tenant-backup.integration.test.ts" "tests/integration/database/report-projections.integration.test.ts" "tests/integration/database/database.integration.test.ts"` | exit 0; 0 erros, 18 avisos preexistentes |
| `bun --no-env-file artifacts/full-finalization/run-api-unit.cjs` | exit 0; 59 arquivos, 1.054 testes |
| `bun --no-env-file ../../node_modules/vitest/vitest.mjs run --no-file-parallelism` em `apps/agency` | exit 0; 44 arquivos, 276 testes |
| `bun --no-env-file node_modules/typescript/bin/tsc -p services/api/tsconfig.build.json` | exit 0 |
| `bun --no-env-file ../../node_modules/vite/bin/vite.js build` em `apps/agency` | exit 0; aviso de chunk maior que 500 kB |
| `bun --no-env-file scripts/validate-migrations.cjs` | exit 0; cadeia de 115 arquivos |
| `git diff --check -- services/api apps/agency infrastructure/migrations/115_tenant_backup_restore.sql tests/integration/database docs/adr/ADR-011-full-backup-assisted-recovery.md docs/08-devops/backup-por-agencia-ensaio.md` | exit 0 |

Tentativas intermediárias: typecheck e ESLint inicialmente identificaram problemas de tipagem/lint nos testes novos, corrigidos. A primeira suíte da API falhou por configuração externa de rate limit; a execução isolada passou em 58 arquivos/1.011 testes, depois 58/1.013 e finalmente 59/1.054 após inclusão de `env.test.ts` e dos novos casos. Na agência, a primeira execução encontrou a dependência de construtor Blob, a espera prematura de recebíveis e rótulos com encoding incorreto, corrigidos; 44/276 passaram. Uma repetição em paralelo com os demais gates excedeu a espera de um segundo de dois testes existentes; a suíte completa sequencial passou em 44/276. Uma tentativa de `diff --check` forçando `core.autocrlf=false` interpretou CRLF existente como whitespace; com a configuração normal do checkout, exit 0. Nenhum código de segurança foi enfraquecido para esses resultados.

Verificação final dos arquivos alterados após a rodada completa: `bun --no-env-file node_modules/eslint/bin/eslint.js services/api/tests/customer-platform-auth-http.test.ts services/api/tests/report-projection-filters-http.test.ts services/api/src/route-inventory.ts tests/integration/database/report-projections.integration.test.ts tests/integration/database/tenant-backup.integration.test.ts` — exit 0, sem erros ou avisos (`eslint-final-delta.log`).

## O QUE AINDA PRECISA DE BANCO/DOCKER

**Todos os comandos desta seção: NAO EXECUTADO.** Executar sequencialmente, somente com Docker local, em recursos descartáveis próprios. Eles aplicam automaticamente a cadeia de migrations no banco descartável; a migration 115 não foi aplicada no 55644 nesta rodada. Não apontar para demo 55438, agências reais, ambientes online ou bancos compartilhados.

Na raiz `D:\travel-platform`, configurar apenas destinos fictícios/locais de teste:

```powershell
$env:CI = 'false'
$env:NODE_ENV = 'test'
$env:RATE_LIMIT_STORE = 'memory'
$env:DATABASE_TEST_HOST = '127.0.0.1'
$env:DATABASE_TEST_NAME = 'travel_platform_test'
$env:ONDA_B_TEST_DB_PORT = '55645'
$env:ONDA_B_TEST_DB_CONTAINER = 'travel-full-finalization-bak-proj-test'
$env:ONDA_B_TEST_DB_PROJECT = 'travel-full-finalization-bak-proj-test'
bun --no-env-file node_modules/vitest/vitest.mjs run --config vitest.database.config.ts tests/integration/database/tenant-backup.integration.test.ts tests/integration/database/report-projections.integration.test.ts
```

Prova de schema, grants, RLS e função da 115:

```powershell
$env:DATABASE_TEST_PORT = '55646'
$env:DATABASE_TEST_CONTAINER_NAME = 'travel-full-finalization-schema-test'
$env:DATABASE_TEST_PROJECT_NAME = 'travel-full-finalization-schema-test'
bun --no-env-file node_modules/vitest/vitest.mjs run --config vitest.database.config.ts tests/integration/database/database.integration.test.ts
```

Invalidação persistida do desafio MFA (suíte completa; usa os pools fictícios de teste definidos no próprio fixture):

```powershell
$env:DATABASE_TEST_PORT = '55647'
$env:DATABASE_TEST_CONTAINER_NAME = 'travel-full-finalization-mfa-test'
$env:DATABASE_TEST_PROJECT_NAME = 'travel-full-finalization-mfa-test'
Push-Location services/api
bun --no-env-file ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/customer-platform-auth-http.test.ts
Pop-Location
```

Gates completos de banco da API, incluindo regressões de pagamentos/financeiro que usam a preparação de grants (70 arquivos; listados no artefato, nunca rodar em paralelo):

```powershell
$env:DATABASE_TEST_PORT = '55648'
$env:DATABASE_TEST_CONTAINER_NAME = 'travel-full-finalization-api-test'
$env:DATABASE_TEST_PROJECT_NAME = 'travel-full-finalization-api-test'
$apiDbTests = @(Get-Content artifacts/full-finalization/db-tests.json -Raw | ConvertFrom-Json | ForEach-Object { "tests/$_" })
Push-Location services/api
bun --no-env-file ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts @apiDbTests
Pop-Location
```

A implementação C/D e os gates locais acima estão fechados. A aprovação de recuperação real, grants/RLS e SQL cíclico exige os comandos de banco desta seção; não há declaração de Full aprovado integralmente sem essa evidência.
