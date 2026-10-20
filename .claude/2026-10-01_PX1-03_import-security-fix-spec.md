# PX1-03 — Especificação de correção: segurança das rotas de importação (Full)

- **Data/hora:** 2026-10-01 10:45
- **Base:** `D:\travel-platform`, `main` em `2190f60`
- **Modo:** só especificação, sem código, testes, migrations ou deploy. A única escrita foi este relatório. `apps/travel-lite`, `services/api-lite`, `docs/travel-lite` e `.opencode` não foram tocados.
- **Origem:** `.claude/2026-10-01_PX1-02_import-routes-security-audit.md`
- **Lido nesta rodada:**
  - `routes/import.ts`, `app.ts`, `routes/wishes.ts`, `routes/customers.ts`, `rate-limit.ts`, `errors.ts`;
  - `import/service.ts`, `import/types.ts`, `import/allowlist.ts`;
  - `packages/domain/tenant-context.ts` (`requireRole`);
  - `tests/security/import-allowlist.test.ts`, `services/api/tests/api-foundation.test.ts`;
  - `QUALITY-GATES.md`, `SCRIPTS.md`.

---

## 1. Objetivo

Fazer `/api/import/*` seguir o mesmo contrato de segurança dos demais módulos staff:

1. **Autenticar antes de qualquer processamento.** Sem sessão, responde 401 sem ler o corpo nem o multipart.
2. **Autorizar por perfil** (`requireRole`) em cada rota.
3. **Manter o isolamento entre agências** como já é hoje (contexto pelo `establishTenant`, RLS e filtro `agency_id`).
4. **Nunca devolver `error.message` interno em 500**; usar o handler global (`errors.ts`).
5. **Validar a entrada** (tipos, enums, tetos) antes de chamar o serviço.
6. **Cobrir tudo com testes HTTP** de 401, 403, isolamento entre agências e erro seguro.

## 2. Escopo da rodada futura

**Dentro:**
- `routes/import.ts`: preHandler, RBAC, erros, validação.
- `import/service.ts`: trocar os `throw new Error(...)` que são erro do usuário pelas classes tipadas.
- Testes HTTP novos e ajuste do teste F-03 existente.
- Documentação da matriz de permissões.

**Fora** (registrar como follow-up, não fazer junto):
- Area grant `IMPORTS` por usuário (exige migration).
- Interface de importação no `apps/agency` (o patch estacionado não deve ser reaproveitado sem revisão).
- Leitura do arquivo via Supabase Storage em vez do corpo.
- Reescrita do `executeImport` (ver §7.4, que é recomendação separada).
- Teste de inventário de rotas: recomendado, mas pode ser uma rodada própria (§8, T-12).

**Produção:** a correção muda a API em produção (Render). Merge e deploy exigem autorização explícita, CI verde, deploy manual (auto-deploy segue OFF) e smoke pós-deploy (§9).

## 3. Arquivos a alterar

| Arquivo | Tipo | Mudança |
|---|---|---|
| `services/api/src/routes/import.ts` | código | `preHandler: protectedHooks` nas 7 rotas; `requireRole`; remover os `try/catch` que devolvem `error.message`; parsers de entrada; tipar `protectedHooks` |
| `services/api/src/import/service.ts` | código | Trocar 5 `throw new Error` por `ValidationError`, `ConflictError` ou `NotFoundError` (§6.2); teto de `parsedRows` |
| `tests/security/import-allowlist.test.ts` | teste | `buildTestApp` com principal autenticado (ADMIN) nos 2 testes HTTP; manter a garantia "nenhuma transação para mapping envenenado" |
| `services/api/tests/import-routes-http.test.ts` | teste novo | Bateria de testes do §8 (sem Postgres real, com `database` fake, como o F-03) |
| `docs/03-security/authorization.md` | doc | Linha "Import Center" na matriz |
| `services/api/src/rate-limit.ts` | código, **opcional** | Classe ou regra mais restrita para `/api/import/` em escrita (§7.3) |

Não é necessária migration. As tabelas `import_jobs` e `import_mapping_templates` já têm RLS FORCE e políticas por agência (082).

## 4. Mudanças propostas em `routes/import.ts`

### 4.1 Assinatura e imports

```diff
-import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
+import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
+import { requireRole } from '../../../../packages/domain/tenant-context';
+import { UserRole } from '../../../../packages/domain/types';
 ...
-import { ValidationError } from '../errors';
+import { ValidationError } from '../errors';
+import { ImportEntityType, MAX_IMPORT_FILE_SIZE, MAX_IMPORT_ROWS } from '../import/types';

 export function registerImportRoutes(
   app: FastifyInstance,
-  options: { database: DatabaseRuntime; protectedHooks?: unknown },
+  options: { database: DatabaseRuntime; protectedHooks: preHandlerHookHandler[] },
   opts?: { prefix?: string },
 ): void {
-  const database = options.database;
+  const { database, protectedHooks } = options;
```

`protectedHooks` passa a ser **obrigatório** no tipo, como em `customers.ts`. Assim o TypeScript impede que alguém registre o módulo sem os hooks.

### 4.2 Padrão de cada rota (exemplo: upload)

```diff
-  app.post(`${prefix}/upload`, async (request: FastifyRequest, reply: FastifyReply) => {
-    try {
+  app.post(`${prefix}/upload`, { preHandler: protectedHooks }, async (request, reply) => {
+    requireRole(UserRole.ADMIN);
       const contentType = request.headers['content-type'] ?? '';
       if (contentType.includes('multipart/form-data')) {
         ... (leitura do multipart inalterada, já com teto de 10 MiB) ...
-        if (!entityType || !fileBuffer || !originalFilename) {
-          return reply.status(400).send({ error: '...' });
-        }
+        const input = parseUploadFields({ entityType, sourceSystem, originalFilename, fileBuffer });
         const result = await createImportJob(database, input);
-        return reply.status(201).send(result);
+        reply.code(201);
+        return result;
       }
       ...
-    } catch (error) {
-      const message = error instanceof Error ? error.message : 'Erro ao criar import job';
-      return reply.status(500).send({ error: message });
-    }
   });
```

Pontos-chave:
- O `preHandler` roda **antes** do handler. O Fastify não consome o stream multipart antes do handler (`request.parts()`), então o anônimo recebe 401 sem que o arquivo seja lido.
- `requireRole(...)` é a primeira linha do handler, como em `customers.ts`/`wishes.ts`. Ele lança `ForbiddenError` (uma `TenantError`), que o handler global converte em 403.
- O 413 do limite de 10 MiB continua sendo devolvido pela própria rota. Pode ficar, porque não expõe dado interno; o ideal é lançar um erro tipado com `statusCode` 413 ou manter o `reply.status(413)` explícito.

### 4.3 Remoção do `sendKnownError` e dos `catch` locais

```diff
-function sendKnownError(error: unknown, reply: FastifyReply, fallbackMessage: string): FastifyReply {
-  if (error instanceof ValidationError) { return reply.status(400).send(...); }
-  const message = error instanceof Error ? error.message : fallbackMessage;
-  return reply.status(500).send({ error: message });
-}
```

Os erros passam a propagar para `registerErrorHandler` (`errors.ts`).

### 4.4 `validate` mantém a ordem F-03

```ts
app.post(`${prefix}/:jobId/validate`, { preHandler: protectedHooks }, async (request) => {
  requireRole(UserRole.ADMIN);
  const { jobId } = parseJobIdParam(request.params);
  const { mapping, parsedRows } = parseValidateBody(request.body); // tipos + tetos
  assertMappingInUnion(mapping); // F-03: antes de qualquer transação
  return dryRunImport(database, jobId, mapping, parsedRows);
});
```

A ordem passa a ser **autenticação → perfil → forma do corpo → allowlist (F-03) → serviço**. A garantia do F-03 ("nenhuma transação aberta para mapping envenenado") continua valendo.

## 5. RBAC recomendado por rota

| Rota | Perfil mínimo | Justificativa |
|---|---|---|
| `POST /api/import/upload` | **ADMIN** | Inicia uma carga em lote de cadastros (clientes, fornecedores, **funcionários**, tags) |
| `POST /api/import/:jobId/parse` | **ADMIN** | Mesma operação; processa arquivo e grava no job |
| `POST /api/import/:jobId/validate` | **ADMIN** | Grava o mapeamento e o resultado do dry-run no job |
| `POST /api/import/:jobId/confirm` | **ADMIN** | **Escreve em massa** nas tabelas de negócio; é o ponto mais sensível |
| `POST /api/import/:jobId/cancel` | **ADMIN** | Muda o estado do job; mantém simetria com quem pode iniciar |
| `GET /api/import/jobs` | **MANAGER** | Leitura de histórico; o gerente precisa acompanhar as cargas da equipe |
| `GET /api/import/:jobId` | **MANAGER** | Idem, para o detalhe do job |

- **OWNER** passa por todas, pela hierarquia (100 ≥ 80).
- **Alternativa,** se o produto quiser que o MANAGER importe: rebaixar as 5 escritas para MANAGER, **exceto** quando `entityType = EMPLOYEE`, que fica em ADMIN. Funcionário é dado de RH e se liga a usuários. Isso exige checar o `entityType` do job no `parse`, `validate` e `confirm`. É **decisão de produto**; o padrão recomendado é ADMIN em todas as escritas.
- **Área por usuário:** se no futuro houver um grant `IMPORTS` (padrão de `area-grants.ts`), ele soma ao perfil mínimo e não o substitui. Precisa de migration e fica para outra rodada.

## 6. Tratamento de erro seguro

### 6.1 Regra

- Nenhum `catch` local devolvendo `error.message`.
- Erros do usuário: lançar as classes tipadas de `services/api/src/errors.ts` (`ValidationError` → 400, `NotFoundError` → 404, `ConflictError` → 409), cuja mensagem é escrita para o usuário.
- Erros de autenticação e perfil: `UnauthorizedError` → 401, `TenantError`/`ForbiddenError` → 403 (já mapeados).
- Qualquer outro erro: o handler global devolve `500 { error: 'Internal server error', code: 'INTERNAL_ERROR' }` e registra no log `errorMessage` (até 500 caracteres) com o `requestId`. O diagnóstico fica no servidor, não no cliente.

### 6.2 Reclassificação necessária em `import/service.ts`

Sem isso, mensagens legítimas para o usuário viram 500 genérico.

| Linha | Hoje | Deve ser |
|---|---|---|
| 124 | `throw new Error('Importação de arquivos XLSX está temporariamente desabilitada…')` | `ValidationError` (400) |
| 128 | `throw new Error('Formato de arquivo não suportado…')` | `ValidationError` (400) |
| 275 | `throw new Error('Import job must be in DRY_RUN status to confirm…')` | `ConflictError` (409), mensagem em pt-BR |
| 374 | `throw new Error('Import job not found: ${jobId}')` | `NotFoundError` (404), **sem ecoar o id** |
| 447 | `throw new Error('Entity type … not yet supported')` | `ValidationError` (400) |
| 72 | `throw new Error('Failed to create import job')` | Mantém `Error` (é falha interna → 500 genérico) |

Os `ValidationError` do `allowlist.ts` (70, 105, 128) e do `service.ts:406` já estão corretos.

## 7. Validação de entrada

### 7.1 Parsers locais em `routes/import.ts`

Mesmo padrão manual dos demais módulos, sem introduzir Zod nesta rodada:

| Entrada | Regra |
|---|---|
| `:jobId` | string não vazia com formato UUID (as tabelas usam `gen_random_uuid()::TEXT`); se inválido, 400 sem chegar ao banco |
| `entityType` (upload) | deve pertencer ao enum `ImportEntityType` **e** à lista suportada pela rota (`CUSTOMER`, `SUPPLIER`, `EMPLOYEE`, `TAG`); hoje o array está duplicado e hardcoded, e deve passar a derivar do enum ou da allowlist |
| `sourceSystem` | opcional, string até 100 caracteres |
| `originalFilename` | obrigatório, até 255 caracteres, sem separador de caminho (`/`, `\`), extensão em `csv`/`tsv` (o XLSX segue desativado) |
| arquivo (multipart) | teto atual de 10 MiB (`MAX_IMPORT_FILE_SIZE`) mantido |
| `fileContent` (parse, base64) | string base64 válida; tamanho decodificado ≤ `MAX_IMPORT_FILE_SIZE`; o `bodyLimit` global de 2 MiB continua valendo antes |
| `mapping` | objeto plano de string para string, até 200 chaves; o F-03 (`assertMappingInUnion`) segue logo depois |
| `parsedRows` (validate/confirm) | array com **no máximo `MAX_IMPORT_ROWS` (10.000)**; cada item com `rowNumber` inteiro positivo e `data` objeto de strings |
| `limit`/`offset` (jobs) | inteiros; `limit` entre 1 e 100 (padrão 20); `offset` ≥ 0; NaN vira 400, em vez de passar `parseInt` cru |

### 7.2 Mensagens

Em pt-BR, sem repetir dados sensíveis recebidos (não incluir o `jobId` nem o conteúdo de células nas mensagens).

### 7.3 Rate limit (opcional, recomendado)

Hoje `/api/import/*` cai em `STAFF_WRITE` (300/min) e `STAFF_READ` (600/min). Recomendado: no `classify` de `rate-limit.ts`, tratar **escritas** em `^/api/import/` como `SENSITIVE_MUTATION` (20 a cada 15 min por IP), ou criar uma classe própria `IMPORT` com algo como 60 a cada 15 min. Um fluxo completo usa 4 escritas (upload → parse → validate → confirm), e `SENSITIVE_MUTATION` permitiria cerca de 5 importações por IP a cada 15 min. **Decidir com o produto;** se não houver decisão, deixar para depois, porque autenticação mais perfil ADMIN já reduzem muito o risco.

### 7.4 Recomendação separada (fora do escopo mínimo)

O `executeImport` (`service.ts:267-300`) confere só `status = DRY_RUN` e insere o `row.data` **enviado pelo cliente** no `confirm`. As linhas confirmadas não precisam ser as mesmas que passaram pelo dry-run, e não há teto além do que for adicionado no §7.1.

Num follow-up, o `confirm` deve **reexecutar `validateImportRows`**, ou usar as linhas guardadas no servidor durante o `validate`, e rejeitar divergência. Até lá, o teto de 10.000 linhas e o perfil ADMIN limitam o abuso.

## 8. Testes mínimos obrigatórios

Arquivo novo: `services/api/tests/import-routes-http.test.ts`, com `buildApp` + `app.inject` e um `database` falso (`withTenantTransaction` espionado), no padrão de `tests/security/import-allowlist.test.ts`. O principal autenticado vem de:

```ts
authProvider: { authenticate: () => Promise.resolve({ userId: 'u-1', agencyId: 'agency-a', role: UserRole.ADMIN, email: 'a@test' }) },
validateUserAgencyAccess: () => Promise.resolve(true),
```

| ID | Nome sugerido | Verifica |
|---|---|---|
| T-01 | `returns 401 on every import route without a session` | As 7 rotas → 401 `UNAUTHORIZED`; `withTenantTransaction` nunca chamado |
| T-02 | `does not read an anonymous multipart upload` | `POST /upload` multipart anônimo → 401, serviço e parser não chamados (spy em `createImportJob`/`withTenantTransaction`) |
| T-03 | `forbids VIEWER and AGENT from import writes` | upload/parse/validate/confirm/cancel → 403 `FORBIDDEN` para VIEWER e AGENT |
| T-04 | `forbids MANAGER from import writes but allows reads` | Escritas → 403; `GET /jobs` e `GET /:jobId` → 200 |
| T-05 | `allows ADMIN and OWNER to run the import flow` | upload → 201; parse/validate/confirm → 200 (serviço espionado/stub) |
| T-06 | `never echoes internal error messages on 500` | Serviço lança `Error('boom: secret detail')` → 500 `{ error: 'Internal server error', code: 'INTERNAL_ERROR' }`; o corpo não contém "boom" |
| T-07 | `maps user errors to 4xx` | Formato não suportado → 400; job inexistente → 404 sem ecoar o id; confirm fora de DRY_RUN → 409 |
| T-08 | `rejects malformed input before the service` | `jobId` não UUID, `entityType` fora da lista, `limit=abc`, `parsedRows` acima de 10.000, base64 inválido → 400, sem transação |
| T-09 | `keeps F-03: poisoned mapping rejected before any transaction (authenticated)` | Versão autenticada (ADMIN) dos 2 testes F-03 existentes |
| T-10 | `isolates import jobs per agency` | Com Postgres real (padrão das suítes `*-http` com container): job da agência A pedido pela agência B → 404; `GET /jobs` de B não lista o de A |
| T-11 | `rejects a cross-agency session` | `validateUserAgencyAccess` falso → 403 |
| T-12 | (opcional) `every /api/* route declares the protected preHandler` | Inventário via `onRoute` coletando rotas `/api/*` sem `preHandler`, com lista pública explícita; impede regressão do mesmo tipo |

**Ajuste no teste existente** `tests/security/import-allowlist.test.ts`: o `buildTestApp` passa a ter um principal ADMIN e `validateUserAgencyAccess: true`. As asserções de 400 e "`withTenantTransaction` não chamado" continuam iguais.

## 9. Gates depois da implementação

Ordem, a partir da raiz do repositório:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test`, que inclui `services/api` e `tests/security`. Lembrar que é sequencial por arquivo e usa o container de teste de nome fixo; garantir que não sobrou container de outra rodada.
4. `npm run test:db`
5. `npm run build`
6. `npm run secrets:scan`
7. `npm run migrations:validate` (não deve mudar nada; nenhuma migration nova)
8. Ou `.\pre-pr.ps1`, que encadeia os mesmos.

**Depois do deploy autorizado** (manual, Render; auto-deploy OFF), o smoke deve verificar:
- `GET https://api.travelplataforma.com.br/api/import/jobs` sem token → **401** (hoje dá 500);
- `POST /api/import/upload` sem token, com um arquivo pequeno → **401**;
- `/readiness` e `/version` normais.

## 10. Riscos de regressão e mitigação

| Risco | Mitigação |
|---|---|
| O teste F-03 atual (anônimo, espera 400) passa a receber 401 | Ajuste previsto (§8), autenticando como ADMIN; manter a asserção de nenhuma transação |
| `requireRole(ADMIN)` bloqueia um fluxo que o produto espera que o MANAGER faça | Hoje não há interface (nenhum app chama `/api/import`), então o impacto imediato é nulo; registrar a decisão em `authorization.md` |
| Reclassificar erros do serviço muda os códigos HTTP (500 → 4xx) | É o comportamento desejado; nenhum cliente depende disso hoje; T-07 cobre |
| Remover os `catch` locais faz exceções de terceiros (parser CSV) virarem 500 genérico | Esperado; a mensagem fica no log; se algum erro do parser for do usuário, envolvê-lo em `ValidationError` no `service.ts` |
| Multipart e `preHandler`: o stream não pode ser consumido pelo hook | `authenticate`/`establishTenant` só leem headers; T-05 com multipart real garante que o `request.parts()` funciona depois do hook |
| O `onTrustedTenant` passa a contar as chamadas no limite da agência | Esperado; observar no piloto |
| Os parsers novos rejeitam entradas antes aceitas (`limit` inválido, `parsedRows` > 10.000) | Não há cliente; documentar os tetos |
| `protectedHooks` obrigatório no tipo quebra uma chamada de teste que registre o módulo sem hooks | O typecheck pega; ajustar a chamada |
| Mudança em produção | Rodada própria, PR revisado, CI verde, deploy manual autorizado e smoke §9 |

## 11. Ordem segura de implementação (para o agente executor)

1. Criar a branch a partir da `main` atualizada (por exemplo `fix/import-routes-auth`). Não commitar na `main`.
2. **Testes vermelhos primeiro:** criar `import-routes-http.test.ts` com T-01, T-02, T-03 e T-06; rodar e confirmar que **falham** pelo motivo certo (200/400/500 em vez de 401/403/500 genérico).
3. Em `routes/import.ts`, tipar `protectedHooks` e aplicar `preHandler: protectedHooks` nas 7 rotas. T-01 e T-02 ficam verdes; o teste F-03 existente fica vermelho, como esperado.
4. Ajustar `tests/security/import-allowlist.test.ts` para principal ADMIN (T-09) e confirmar verde.
5. Adicionar `requireRole` conforme o §5. T-03, T-04 e T-05 ficam verdes.
6. Remover `sendKnownError` e os `catch` locais; reclassificar os 5 `throw` do `service.ts` (§6.2). T-06 e T-07 ficam verdes.
7. Adicionar os parsers de entrada (§7.1). T-08 fica verde.
8. Adicionar T-10 e T-11 (isolamento com Postgres de teste) e T-12 se aprovado.
9. (Opcional, com decisão) regra de rate limit (§7.3) e teste correspondente.
10. Atualizar `docs/03-security/authorization.md` (matriz) e o comentário de cabeçalho do `import.ts`.
11. Rodar todos os gates do §9 e registrar o relatório final em `.claude/` (data/hora no nome).
12. Abrir PR. **Merge e deploy só com autorização explícita**, seguidos do smoke de produção do §9.

---

**Resultado:** especificação concluída; nenhuma alteração de código, teste, migration ou ambiente.
