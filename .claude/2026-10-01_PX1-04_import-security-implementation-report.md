# PX1-04 — Relatório de implementação: segurança das rotas `/api/import/*` (Full)

- **Data:** 2026-10-01
- **Status:** Implementação concluída e **todos os gates executados passaram**: `typecheck`, `lint`, `build` e `npm run test` (100 de 100 arquivos, depois de religar o banco de teste; ver seção 4).
- **Prompt:** `.claude/NEXT-PROMPT-PX1-04-IMPORT-SECURITY-IMPLEMENTATION.md`
- **Spec:** `.claude/2026-10-01_PX1-03_import-security-fix-spec.md`

## 1. Branch / worktree

- Branch `codex/px1-import-security`, criada a partir da `main` (`2190f60`) **no próprio checkout `D:\travel-platform`** (não foi criada worktree nova, para reaproveitar o `node_modules` sem instalar dependências).
- A `main` não foi alterada. Nada foi commitado, enviado (push), mergeado nem aberto em PR: as mudanças estão só na árvore de trabalho da branch.
- Worktree Travel Lite (`feature/travel-lite`) e `.opencode` não foram tocados.

## 2. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `services/api/src/routes/import.ts` | `protectedHooks` obrigatório no tipo e aplicado às 7 rotas; `requireRole(ADMIN)` nas 5 escritas (upload, parse, validate, confirm, cancel) e `requireRole(MANAGER)` nas 2 leituras; removidos `sendKnownError` e todos os `catch` que devolviam `error.message`; parsers de entrada (jobId UUID, entityType, sourceSystem ≤100, filename ≤255 sem separador e só csv/tsv, base64 válido com teto de tamanho, mapping, parsedRows ≤ `MAX_IMPORT_ROWS`, limit 1..100, offset ≥ 0); `NotFoundError` sem ecoar o id; ordem final: autenticação → perfil → forma do corpo → allowlist F-03 → serviço |
| `services/api/src/import/service.ts` | 5 `throw new Error` reclassificados: XLSX desativado e formato não suportado → `ValidationError` (400); confirm fora de DRY_RUN → `ConflictError` (409); job inexistente → `NotFoundError` (404, sem o id); entidade não suportada → `ValidationError` (400). `Failed to create import job` permanece `Error` (falha interna → 500 genérico) |
| `tests/security/import-allowlist.test.ts` | `buildTestApp` autentica como ADMIN (`validateUserAgencyAccess` verdadeiro); os 2 testes HTTP F-03 usam jobId UUID; as asserções de 400 e "nenhuma transação aberta" foram mantidas |
| `services/api/tests/import-routes-http.test.ts` | **novo**, 16 testes (seção 3) |
| `docs/03-security/authorization.md` | linha "Import Center" na matriz (leitura MANAGER+, escrita ADMIN+) e nota explicativa |
| `services/api/src/rate-limit.ts` | **não alterado**, conforme o prompt |

## 3. Testes

`services/api/tests/import-routes-http.test.ts` (sem Postgres real; `database` falso e service espionado com `vi.mock`):

- 401 nas 7 rotas sem sessão, sem abrir transação.
- Upload multipart anônimo → 401, sem chamar o serviço.
- Sessão sem acesso à agência → 403.
- VIEWER e AGENT → 403 em todas as escritas e em todas as leituras.
- MANAGER → 403 nas escritas e 200 nas leituras.
- ADMIN e OWNER → fluxo completo (upload 201; parse, validate, confirm e cancel 200); upload multipart autenticado → 201.
- Erro interno → 500 `{ error: 'Internal server error', code: 'INTERNAL_ERROR' }`, sem a mensagem original no corpo (upload, cancel e list).
- Erros do usuário: confirm de job inexistente → 404, confirm fora de DRY_RUN → 409, GET de job inexistente → 404, sem ecoar o id.
- Entrada malformada → 400 sem tocar no banco (16 casos: jobId não UUID, entityType fora da lista, nome com `../`, `.xlsx`, sourceSystem longo, limit inválido/>100, offset negativo, filtro entityType inválido, base64 inválido, mapping e parsedRows malformados).
- Mais de 10.000 linhas → 400 ou 413 (limite global de 2 MiB pode responder antes), sem tocar no banco.
- F-03 autenticado: mapping envenenado → 400 antes de qualquer transação.

Resultado: **16/16** em `import-routes-http.test.ts` e **7/7** em `tests/security/import-allowlist.test.ts`, na execução isolada e também dentro da suíte completa.

Os testes foram escritos antes da implementação e falharam pelo motivo certo (12 de 16 vermelhos: rotas sem proteção devolvendo 500/200 em vez de 401/403/4xx).

## 4. Gates

| Gate | Resultado |
|---|---|
| `npm run typecheck` | OK (7/7 tarefas) |
| `npm run lint` | OK: 0 erros. Um erro inicial no teste novo (`import()` type annotation) foi corrigido. Os 13 warnings em `services/api` e os demais são pré-existentes, em arquivos que não foram alterados |
| `npm run test` | **OK, em duas etapas.** 1ª execução: 87 de 100 arquivos passaram (1402 testes; 311 pulados; 0 falhas de asserção) e 13 arquivos com Postgres não rodaram por conflito de container. Depois de o container órfão ser removido, os 13 foram reexecutados em serial e **passaram: 13 arquivos, 311 testes**. Total: **100 de 100 arquivos** |
| `npm run build` | OK (7/7 tarefas, 21 s) |

### Os 13 arquivos bloqueados: causa e fechamento

Na 1ª execução, 13 arquivos de teste com Postgres real (`bookings-http`, `customer-e2e`, `customer-routes`, `customer-segments`, `employee-commission-rules`, `financial-http`, `offer-routes`, `platform-commercial`, `proposal-visual-http`, `transport-operations-http`, `trip-e2e`, `trip-routes`, `wish-routes`) falharam no setup, antes de executar qualquer teste, com:

`Conflict. The container name "/travel-platform-postgres-local" is already in use`

**Causa:** o compose usa nome de container fixo e esse nome é fixado também nos próprios arquivos de teste. Havia um container órfão `travel-platform-postgres-local`, do projeto compose `travel-platform-sale-item-routes-postgres`, deixado por outra suíte que não o derrubou; como cada suíte só derruba o próprio projeto, ele bloqueou as seguintes. Nenhum desses arquivos usa as rotas ou o serviço de importação.

**Tentativa que não funcionou:** reexecutar com `DATABASE_TEST_PORT` e `DATABASE_TEST_CONTAINER_NAME` próprios. Os testes ignoram a variável de nome, então os 13 falharam de novo no setup (311 pulados). Também tentei remover o container, e o Claude Code bloqueou o comando; **não contornei**.

**Fechamento:** o container órfão foi removido por fora (o Codex registrou a remoção em `.claude/2026-10-01_PX1-04_full-remaining-tests-serial-pass.md`). O Codex então rodou em serial 13 arquivos **diferentes** dos meus (`customer-portal-*`, `sales`, `trips`, `wishes` etc.), com 13/13 e 177 testes. Como as duas listas não têm arquivo em comum, rodei eu mesmo os 13 originais em serial, a partir de `services/api`, com `--maxWorkers=1`:

`Test Files 13 passed (13)` · `Tests 311 passed (311)` · 302 s

Depois da execução não ficou nenhum container `travel-platform-*`. Com isso, o gate `npm run test` está fechado: **100 de 100 arquivos passaram**, sem nenhuma falha de asserção em nenhuma das execuções.

## 5. Itens não executados

- `npm run test:db`: não rodado, porque nenhum teste novo depende de Postgres/RLS real e o container fixo já estava ocupado. O teste de isolamento entre agências com Postgres (T-10 do spec) **não foi adicionado**.
- T-12 (inventário de rotas sem `preHandler`): opcional, não feito.
- Rate limit dedicado para `/api/import/*`: não implementado, por decisão do prompt. Registrado como follow-up.
- `npm run secrets:scan` e `npm run migrations:validate`: fora da lista de gates do prompt; não rodados.

## 6. Riscos restantes

- **Produção continua vulnerável até o deploy.** Esta correção só existe na branch local. Merge e deploy exigem autorização, CI verde, deploy manual e smoke pós-deploy (`GET /api/import/jobs` sem token deve dar 401; hoje dá 500).
- **`confirm` não revalida as linhas:** insere as linhas enviadas pelo cliente. O perfil ADMIN e o teto de 10.000 linhas limitam o abuso. Revalidar no servidor fica como correção à parte.
- **Perfil mínimo:** ADMIN nas escritas pode ser restritivo se o produto quiser que MANAGER importe. Hoje nenhum app chama `/api/import`, então o impacto imediato é nulo.
- **Mudanças de código HTTP:** erros do serviço que eram 500 viram 400/404/409, e entradas antes aceitas (limit inválido, mais de 10.000 linhas, arquivos que não sejam csv/tsv) passam a ser rejeitadas.
- **Isolamento entre agências** não foi coberto por teste novo com banco real. Segue protegido por RLS e pelo filtro `agency_id`, sem alteração nesta rodada.

## 7. Confirmações

- **Sem deploy, sem migration, sem produção/staging e sem leitura de `.env`:** nenhum deploy, nenhuma migration, nenhum `prisma migrate`/`db push`/`generate`, nenhuma instalação de dependência, nenhum acesso a produção ou staging, nenhuma leitura de arquivo `.env`.
- Sem commit, push, PR ou merge.
