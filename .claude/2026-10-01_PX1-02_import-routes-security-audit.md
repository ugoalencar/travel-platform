# PX1-02 — Auditoria de segurança das rotas de importação (Full)

- **Data/hora:** 2026-10-01 10:36
- **Base:** `D:\travel-platform`, branch `main`, `2190f60`
- **Modo:** somente leitura. Nada foi editado, nem a `main` (`2190f60`) nem a worktree do Lite (`e19db89`, limpa). Não houve deploy, migrations ou leitura de `.env`, e `apps/travel-lite`, `services/api-lite` e `docs/travel-lite` não foram tocados. A única escrita foi este relatório.
- **Lido:**
  - `AGENTS.md`, `docs/AI_CONTEXT.md`, `docs/03-security/security-model.md`, `docs/03-security/authorization.md`;
  - `services/api/src/app.ts`, `routes/import.ts`, `import/service.ts`, `database.ts`, `rate-limit.ts`, `security-config.ts`;
  - `packages/domain/tenant-context.ts`, `routes/wishes.ts` (comparação);
  - `tests/security/import-allowlist.test.ts`;
  - `infrastructure/migrations/082_import_center.sql`.

---

## 1. Veredito

**O risco existe e está confirmado (não é falso positivo).** As 7 rotas `/api/import/*` são registradas **sem `preHandler: protectedHooks`** e **sem `requireRole`**.

- **Isolamento entre agências:** preservado. As rotas falham fechadas, porque o serviço exige contexto de agência antes de abrir conexão com o banco.
- **Autenticação:** ausente. Requisições anônimas são aceitas e processadas até o ponto do banco.
- **Autorização (RBAC):** ausente, sem perfil mínimo.
- **Funcionalidade:** quebrada também para usuários legítimos. O hook que cria o contexto de agência nunca roda nessas rotas, então nenhuma chamada consegue concluir com sucesso.
- **Exposição:** erros internos voltam ao cliente com 500.
- **Memória:** o upload multipart sem autenticação é lido inteiro para a memória.

**Severidade:** alta, por ser endpoint público em produção (`api.travelplataforma.com.br`) que aceita upload anônimo. O impacto em dados é baixo, por causa do comportamento fail-closed. O impacto em disponibilidade e higiene de segurança é real.

---

## 2. Evidências

### 2.1 Registro das rotas

`services/api/src/app.ts:331`:

```ts
registerImportRoutes(app, { database: options.database, protectedHooks });
```

`services/api/src/routes/import.ts:47-53`: a assinatura recebe `protectedHooks?: unknown`, e o valor **nunca é lido**. Só `options.database` é usado; o prefixo padrão é `/api/import`.

| Linha | Rota | `preHandler` | `requireRole` |
|---|---|---|---|
| 58 | `POST /api/import/upload` | não | não |
| 152 | `POST /api/import/:jobId/parse` | não | não |
| 179 | `POST /api/import/:jobId/validate` | não | não |
| 212 | `POST /api/import/:jobId/confirm` | não | não |
| 234 | `POST /api/import/:jobId/cancel` | não | não |
| 248 | `GET /api/import/jobs` | não | não |
| 272 | `GET /api/import/:jobId` | não | não |

O comentário do arquivo (linha 12) diz *"All routes require staff authentication (getAgencyId() + getUserId())"*, mas nenhuma rota aplica autenticação. A afirmação está errada.

### 2.2 Ausência de autenticação global

`app.ts:261-262`:

```ts
const protectedHooks = [authenticate, establishTenant, rateLimits.onTrustedTenant];
app.addHook('onRequest', rateLimits.onRequest);
```

O único hook global é o **rate limit por IP**. `authenticate` e `establishTenant` só rodam onde a rota declara `preHandler: protectedHooks`. Não existe `onRequest` nem `preHandler` global de autenticação.

### 2.3 Fail-closed do isolamento

- `services/api/src/database.ts:116-127`: `withTenantTransaction` chama `getTenantContext()` **antes** de `tenantPool.connect()`.
- `packages/domain/tenant-context.ts:264-271`: sem contexto, lança `TenantError('No tenant context available. Ensure Fastify tenant hook is applied.', 'NO_TENANT_CONTEXT')`.
- `services/api/src/import/service.ts`: todas as funções exportadas passam primeiro por `withTenantTransaction`, diretamente ou via `getImportJob`. São elas: `createImportJob`:54, `parseImportFile`:105→`getImportJob`, `dryRunImport`:185, `executeImport`:283, `cancelImport`:339, `listImportJobs`:465, `getImportJobById`:499. As consultas filtram `agency_id = getAgencyId()`.
- `082_import_center.sql:134-155`: RLS ENABLE + FORCE e 4 políticas por agência em `import_jobs` e `import_mapping_templates`.

**Conclusão:** nenhuma requisição chega ao banco sem contexto de agência, e não há vazamento entre agências.

### 2.4 Erro interno exposto

Os blocos `catch` devolvem `error.message` cru com 500:

- `upload`: `routes/import.ts:143-146`;
- `parse`: `:170-173`;
- `cancel`: `:240-243`;
- `jobs`: `:265-268`;
- `:jobId`: `:282-285`;
- `validate` e `confirm`, via `sendKnownError` (`:37-43`), que também faz `reply.status(500).send({ error: message })` para qualquer erro que não seja `ValidationError`.

Uma chamada anônima recebe `500 {"error":"No tenant context available. Ensure Fastify tenant hook is applied."}`. Isso revela detalhe de implementação (Fastify, hook de tenant) e contraria o padrão obrigatório do `security-model.md` §3 ("nunca enviar `error.message` em 500").

### 2.5 Leitura de multipart antes da autenticação

`routes/import.ts:64-90`: com `content-type: multipart/form-data`, o handler percorre `request.parts()` e **acumula todos os chunks do arquivo em memória** (`chunks.push`, `Buffer.concat`). O limite é `MAX_IMPORT_FILE_SIZE = 10 MiB` (`import/types.ts:212`); o plugin multipart aceita até 20 MiB (`app.ts:211`, `document-attachments.ts:23`). Só **depois** disso o serviço chama `getTenantContext()` e falha.

`parse` faz `Buffer.from(body.fileContent, 'base64')` antes do serviço, limitado pelo `bodyLimit` de 2 MiB (`security-config.ts:150`).

### 2.6 Rate limit

`rate-limit.ts`: `/api/import/*` cai no fallback `STAFF_WRITE` (300 req/min) ou `STAFF_READ` (600 req/min) **por IP** (`request:<classe>:<ip>:<rota>`, linha 246). Não é aplicada a classe `PUBLIC_ANONYMOUS` (120/min), que seria a adequada para chamadas anônimas.

### 2.7 Sem uso pela interface

Nenhum app em `apps/*/src` chama `/api/import` (busca por `api/import` e `/import/` sem resultados fora de testes). A funcionalidade está exposta na API, mas não tem interface.

---

## 3. Comparação com um módulo protegido corretamente

`services/api/src/routes/wishes.ts`:

```ts
app.get('/wishes', { preHandler: protectedHooks }, async () => { ... });
app.post('/wishes', { preHandler: protectedHooks }, async (request, reply) => {
  requireRole(UserRole.AGENT);
  const { customerId, data } = parseCreateWishInput(request.body);
  ...
```

| Aspecto | `wishes.ts` (correto) | `import.ts` (atual) |
|---|---|---|
| `preHandler: protectedHooks` | em todas as rotas | em nenhuma |
| Autenticação (`authenticate`) | sim, responde 401 sem sessão | não roda |
| Contexto de agência (`establishTenant`) | sim | não roda; o serviço falha |
| Rate limit da agência (`onTrustedTenant`) | sim | não |
| `requireRole` | sim (perfil mínimo por rota) | não |
| Erro 500 | tratado pelo handler global, genérico | `error.message` cru |
| Validação de entrada | parser dedicado | casts `as {...}` sem validação de tipo (`entityType`, `parsedRows`, `limit`/`offset` via `parseInt`) |

---

## 4. Impacto provável

| Dimensão | Impacto | Detalhe |
|---|---|---|
| Autenticação | **Alto** | Qualquer pessoa na internet alcança os handlers e o parse de multipart sem sessão |
| Autorização (RBAC) | **Alto, latente** | Hoje não existe perfil mínimo. Quando a autenticação for corrigida *sem* perfil, um VIEWER ou AGENT poderá importar em massa clientes, fornecedores e funcionários (`executeImport`). Importação em lote é operação administrativa |
| Isolamento entre agências | **Baixo hoje** | Fail-closed confirmado (§2.3), sem leitura ou escrita entre agências. O risco aparece se alguém corrigir de forma errada, por exemplo chamando `establishTenant` sem `authenticate`, ou passando a agência pelo corpo da requisição |
| Exposição de erro interno | **Médio** | Mensagens internas e de bibliotecas em 500 (§2.4). Hoje revela a arquitetura de hooks; com autenticação, poderia revelar mensagens do Postgres (constraint, coluna) |
| Memória / negação de serviço | **Médio a alto** | Por IP: até 300 uploads/min × até 10 MiB em memória, antes de qualquer autenticação. Com vários IPs e requisições simultâneas, isso pode esgotar a memória da instância Render. O rate limit não usa a classe anônima |
| Disponibilidade da funcionalidade | **Alto (funcional)** | Para usuários legítimos todas as rotas devolvem 500. A Central de Importação do Full não funciona, o que pesa na estratégia Lite → Full de importação |

---

## 5. Cobertura de testes

| Teste | O que cobre | Lacuna |
|---|---|---|
| `tests/security/import-allowlist.test.ts` (F-03, commit `c9caaec`) | Allowlist de campos (sem `role` em funcionário, campos alinhados); rejeição de alvos injetados; `POST /api/import/:jobId/validate` → 400 para mapping envenenado **antes** de qualquer transação | Monta o app com `authProvider: { authenticate: () => null }` (anônimo) e **espera 400**. O teste **depende da ausência de autenticação** e não verifica 401/403 |
| `services/api/tests/*auth*` (`auth-http`, `local-auth`, `production-auth`, `platform-routes-auth`…) | Autenticação de sessão e plataforma em geral | Nenhum toca `/api/import` |
| `tests/security/tenant-isolation.test.ts`, `tenant-fastify-lifecycle.test.ts` | Isolamento e ciclo do hook de agência | Não cobre `/api/import`; não existe teste genérico que garanta que toda rota `/api/*` exige autenticação |
| Inventário de rotas | `route-inventory.ts` existe só em worktrees históricas (`core-integration-phase`, `release-core-a`), **não na `main`** | Não há verificação automática de rotas sem `preHandler` |

**Não existe teste** de 401 sem sessão, 403 por perfil, isolamento entre agências por `jobId`, erro genérico em 500 ou upload anônimo rejeitado antes do parse.

---

## 6. Correção recomendada (não implementada)

1. **Aplicar `protectedHooks` em todas as 7 rotas**, mudando o tipo do parâmetro de `unknown` para o mesmo usado pelos demais módulos:

   ```ts
   app.post(`${prefix}/upload`, { preHandler: protectedHooks }, async (request, reply) => { ... });
   ```

   Com o `preHandler`, o Fastify autentica **antes** de o handler consumir o multipart. Um anônimo recebe 401 sem ler o arquivo, o que resolve o §2.5.

2. **Perfil mínimo com `requireRole`** (proposta, a confirmar):
   - `upload`, `parse`, `validate`, `confirm`, `cancel`: `UserRole.ADMIN`. É escrita em lote de cadastros e inclui funcionários.
   - `GET /jobs` e `GET /:jobId`: `UserRole.MANAGER`.
   - Alternativa: um area grant `IMPORTS` em `area-grants.ts`, se o produto quiser liberar por usuário. Isso exige migration nova e fica para outra rodada.
3. **Respostas de erro:** trocar os `catch` locais e o fallback de `sendKnownError` por um erro genérico (`{ error: 'Erro interno', code: 'INTERNAL_ERROR' }`) com log no servidor, ou deixar propagar para o error handler global, como fazem os demais módulos. Manter `ValidationError` → 400 e `TenantError` → 401/403 pelo mapeamento global.
4. **Validação de entrada:** validar `entityType` contra o enum, limitar `parsedRows` (quantidade de linhas) e `limit`/`offset` com teto, em vez dos casts `as`.
5. **Rate limit:** opcional. Uma classe `IMPORT` mais restrita (por exemplo 20 por 15 min, como `SENSITIVE_MUTATION`) no classificador de `rate-limit.ts`, porque cada chamada processa até 10 MiB.
6. **Testes novos** (Vitest, padrão de `buildApp` + `inject`):
   - 401 nas 7 rotas sem sessão;
   - upload anônimo devolvendo 401 **sem** chamar o serviço (espiar `withTenantTransaction` ou o parser);
   - 403 para VIEWER e AGENT nas escritas;
   - 200/201 para ADMIN;
   - `jobId` de outra agência devolvendo 404;
   - 500 com corpo genérico, sem `error.message`;
   - ajustar o teste F-03 existente para autenticar como ADMIN.
7. **Documentação:** corrigir o comentário de cabeçalho do `import.ts` e registrar a regra de perfil em `docs/03-security/authorization.md`.
8. **Prevenção:** um teste de inventário que percorra `app.printRoutes()` ou os registros e exija `preHandler` em toda rota `/api/*` fora de uma lista pública explícita. Isso teria pegado esta falha.

## 7. Arquivos que provavelmente mudariam

| Arquivo | Mudança |
|---|---|
| `services/api/src/routes/import.ts` | `preHandler`, `requireRole`, tratamento de erro, validação de entrada, tipo de `protectedHooks` |
| `tests/security/import-allowlist.test.ts` | Autenticar como ADMIN nos testes HTTP que hoje usam sessão nula |
| `services/api/tests/import-routes.test.ts` (novo) | 401/403/404 entre agências, erro genérico, upload anônimo não lido |
| `services/api/src/rate-limit.ts` | (Opcional) classe dedicada para `/api/import/` |
| `services/api/src/area-grants.ts` + nova migration | (Só se optar por area grant `IMPORTS`) |
| `docs/03-security/authorization.md` | Linha "Import Center" na matriz de permissões |
| `tests/security/route-protection-inventory.test.ts` (novo, opcional) | Garantia de `preHandler` em toda rota `/api/*` |

## 8. Riscos de regressão da correção

| Risco | Mitigação |
|---|---|
| O teste F-03 existente passa a receber 401 em vez de 400 | Atualizar o teste para autenticar (é esperado; o teste dependia da falha) |
| A ordem dos hooks muda o comportamento do F-03: o 400 por mapping envenenado passaria a ocorrer **depois** da autenticação | Aceitável. Manter a garantia "nenhuma transação aberta para mapping envenenado" (`assertMappingInUnion` antes do serviço) e testar com usuário autenticado |
| Escolher um perfil mínimo alto demais (ADMIN) pode bloquear um piloto que espere MANAGER importando | Confirmar com o produto. A rota não tem interface hoje (§2.7), então o impacto imediato em usuários é nulo |
| `onTrustedTenant` passa a contar essas chamadas no limite da agência | Esperado. Verificar se 10 MiB por chamada não exige classe própria |
| Multipart com `preHandler`: confirmar que `request.parts()` continua funcionando depois do hook de autenticação (o corpo multipart não é consumido pelo preHandler) | Coberto por teste de upload autenticado com arquivo CSV real |
| Mudar a forma do erro 500 pode afetar algum cliente que leia `error` | Não há cliente na interface (§2.7); risco nulo hoje |
| A correção altera a produção (API em Render) | Exige rodada própria com autorização explícita, CI verde, deploy manual (auto-deploy segue OFF) e smoke `401` em `/api/import/jobs` depois do deploy |

---

**Resultado:** risco confirmado e especificado. Nenhuma alteração foi feita.
