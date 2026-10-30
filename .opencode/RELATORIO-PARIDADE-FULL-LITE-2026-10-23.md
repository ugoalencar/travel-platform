# Relatório de Paridade Full–Lite — CEP-01 e CSV-01

- **Data:** 2026-10-23
- **Autor:** OpenCode
- **Itens:** CEP-01 (ordem 7) e CSV-01 (ordem 8) do `docs/00-product/FULL-LITE-ALIGNMENT-PLAN.md`
- **Status:** **HOLD — aguardando revisão do Codex (BASE)**. Nenhum código foi alterado nesta rodada.
- **Natureza:** rodada exclusivamente documental. Não houve migração, alteração de tipos compartilhados, instalação, acesso a `.env`, deploy, commit ou push.
- **Escopo de escrita:** somente este arquivo. Os demais arquivos modificados no worktree são pré-existentes e não foram tocados.

> **Regra Full-first (DEC-007):** o Lite já possui CEP e CSV; o Full ainda não. CEP-01 e CSV-01 não criam funcionalidade nova no Lite — eles **regularizam o Full** para restaurar a ordem correta (Full primeiro, Lite como subconjunto).

---

## 1. Sumário executivo

| Item | Referência no Lite | Lacuna no Full | Proposta | Risco |
|---|---|---|---|---|
| **CEP-01** | `CustomerCepField` + `GET /cep/lookup` (ViaCEP, cache, limites, erros tipados) | Nenhuma consulta de CEP; modal de endereço só tem input livre | Proxy server-side no Full (`services/api/src/cep.ts` + `routes/cep.ts`) e campo controlado no modal de endereço (`apps/agency`) | Médio (novo consumo externo, mas com URL fixa, validação e limites) |
| **CSV-01** | `?format=csv` em `/reports/sales`, `/reports/sellers`, `/reports/commissions`, `/reports/cash-flow` | Todos os `/reports/*` retornam apenas JSON; nenhum `text/csv` no serviço | Serializador puro `report-csv.ts` + `format=csv` opt-in nos endpoints existentes de `/reports/*` + botão “Baixar CSV” | Baixo/médio (CSV injection, escopo de autorização, divergência de granularidade) |

**Conclusão antecipada:**

1. **CEP-01 pode atingir paridade funcional completa** com o Lite, com uma diferença intencional de mapeamento de campo (`neighborhood` → `district`) e uma decisão pendente sobre normalização persistida do CEP.
2. **CSV-01 atinge apenas paridade parcial** nesta rodada. O Full não possui relatório de vendas linha a linha, nem escopo “próprio vendedor”, nem fluxo de caixa diário; e a exportação de comissões depende de COM-01..COM-03. O plano entrega a **serialização CSV segura** sobre os contratos que o Full já tem, sem inventar dados.
3. Nenhuma migração é necessária para nenhum dos dois itens.

---

## 2. Evidências e método

### 2.1 Fontes consultadas

- `AGENTS.md`, `docs/AI_CONTEXT.md`, `QUALITY-GATES.md`.
- `docs/00-product/FULL-LITE-ALIGNMENT-PLAN.md`.
- `docs/travel-lite/CEP-LOOKUP.md` e `docs/adr/ADR-CEP-001-travel-lite-viacep.md`.
- `docs/travel-lite/FULL-LITE-PARITY-AUDIT-2026-10-23.md` (§7 CEP, §9 CSV).
- Código ativo em `apps/travel-lite`, `services/api-lite`, `apps/agency` e `services/api`.
- Testes existentes em `services/api-lite/tests`, `services/api/tests` e `apps/agency/src/**/*.test.tsx`.

### 2.2 Estado do repositório

- Worktree: `D:/travel-platform`, branch `wip/organizacao-2026-10-20`.
- Worktree já estava sujo antes desta rodada (Lite, `apps/agency/src/lib/api.ts`, `PayrollPage.tsx`, `packages/domain/types.ts`, `services/api/src/financial.ts`, `services/api/src/payroll.ts`, entre outros). Nada foi revertido ou commitado.
- **Nenhum teste, lint, typecheck ou build foi executado nesta rodada.** Todos os resultados abaixo são análises estáticas de código.

### 2.3 Comandos de verificação (a executar somente após implementação)

```powershell
# Backend Full — alvos
npm run test -w services/api -- tests/cep.test.ts tests/cep-routes.test.ts
npm run test -w services/api -- tests/report-csv.test.ts tests/reports-csv-http.test.ts
npm run typecheck -w services/api
npm run lint -w services/api

# Frontend Agency — alvos
npm run test -w apps/agency -- src/components/customer/CustomerCepField.test.tsx
npm run test -w apps/agency -- src/pages/CustomerDetailPage.test.tsx src/pages/ReportsPage.test.tsx
npm run typecheck -w apps/agency
npm run lint -w apps/agency

# Gates de repositório, quando a rodada de código for autorizada
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run build
```

---

## 3. CEP-01 — CEP no Full

### 3.1 Situação atual

#### Lite (referência funcional)

| Evidência | Local |
|---|---|
| Componente controlado, debounce 400 ms, `AbortController`, descarte de resposta obsoleta, preservação de edição manual | `apps/travel-lite/src/CustomerCepField.tsx:14-82` |
| Integração no formulário de cliente | `apps/travel-lite/src/pages/CustomersPage.tsx:272-276` |
| Normalização de CEP (8 dígitos, máscara) | `services/api-lite/src/cep.ts:7-19` |
| Contrato `{ status, street, neighborhood, city, state, source }` | `services/api-lite/src/cep.ts:21-28` |
| Provider ViaCEP: URL fixa, `redirect:'error'`, timeout 3 s, limite 16 KiB, cache 24 h/500, 10 req/min por tenant+usuário, 60 req/min global, 10 concorrentes | `services/api-lite/src/cep.ts:38-136` |
| Rota `GET /cep/lookup`, `no-store`, `Retry-After: 60` em 429 | `services/api-lite/src/routes/cep.ts:8-19` |
| Permissões `customers.create` / `customers.update_all` / `customers.update_own` | `services/api-lite/src/routes/cep.ts:10` |
| Feature flag `TRAVEL_LITE_CEP_PROVIDER` | `services/api-lite/src/app.ts:112-120` |
| Testes de provider, rota e integração | `services/api-lite/tests/cep.test.ts`, `cep-routes.test.ts`, `customer-cep.test.ts` |
| Testes do componente | `apps/travel-lite/src/CustomerCepField.test.tsx` |
| Códigos e UX documentados | `docs/travel-lite/CEP-LOOKUP.md`; `docs/adr/ADR-CEP-001-travel-lite-viacep.md` |

#### Full (lacuna)

| Evidência | Local |
|---|---|
| Nenhuma ocorrência de ViaCEP, `/cep` ou consulta de CEP em `services/api` e `apps/agency` | busca estática |
| Modal “Novo endereço” com `<Input name="cep" />` livre | `apps/agency/src/pages/CustomerDetailPage.tsx:1756-1797` (CEP em `:1778`) |
| Payload envia `cep` como digitado | `apps/agency/src/pages/CustomerDetailPage.tsx:743-767` |
| Modelo de endereço com `cep?` e `district` | `apps/agency/src/types/customer360.ts:1-20` |
| Colunas e inputs do backend | `services/api/src/customer-addresses.ts:16-17`, `:38-63` |
| Rotas de endereço, `GET` VIEWER / `POST/PATCH/DELETE` AGENT | `services/api/src/routes/customer-documents.ts:132-199` |
| Parser de endereço sem validação de formato de CEP | `services/api/src/routes/customer-documents.ts:866-903` |
| Migração com `cep TEXT` nullable, sem CHECK | `infrastructure/migrations/019_customer_360_addresses.sql:50-93` |
| Hierarquia de papéis (sem permission strings) | `packages/domain/tenant-context.ts:388-409` |
| Erros existentes sem `HttpError` | `services/api/src/errors.ts:13-35`, `:71-114` |
| CSP `connect-src 'self'` | `services/api/src/app.ts:215-235` |
| Proxy de dev `/api` → API, removendo o prefixo | `apps/agency/vite.config.ts:22-27` |
| Cliente sem `signal` no método genérico | `apps/agency/src/lib/api.ts:4147-4161`; `request` aceita `RequestInit` em `:46-59` |
| Padrão de HTTP externo com timeout | `services/api/src/email/resend-provider.ts:36-55`; `captcha-provider.ts:112,198` |
| Rate limit por rota (GET staff já cai em `STAFF_READ`) | `services/api/src/rate-limit.ts:399-427` |

### 3.2 Lacunas objetivas

1. Não existe endpoint de consulta de CEP no Full.
2. O modal não preenche rua/bairro/cidade/UF e não valida o CEP.
3. O Full usa `district`, o Lite usa `neighborhood`; o contrato do provider deve permanecer `neighborhood` e o frontend do Full mapeia para `district`.
4. O Full usa `requireRole` hierárquico, não permission strings. A paridade correta é **AGENT ou superior** (mesmo requisito de `POST /customers/:id/addresses`).
5. O Full não tem `HttpError`; os erros do provider precisam de um mapeamento explícito para preservar os códigos do contrato (`CEP_NOT_FOUND`, `CEP_RATE_LIMIT`, etc.).

### 3.3 Contrato HTTP proposto

Rota Fastify: `GET /cep/lookup` (mesmo esquema de montagem dos demais `/reports/*`, `/customers/*`; o cliente chama `/api/cep/lookup`).

| Item | Valor |
|---|---|
| Autenticação | `protectedHooks` existentes |
| Autorização | `requireRole(UserRole.AGENT)` — equivalente a criar/editar endereço |
| Query | `cep` obrigatório, `^\d{5}-?\d{3}$` (após `trim`) |
| 200 | `{ status: 'ok' \| 'generic', street, neighborhood, city, state, source: 'viacep' }` |
| 400 | `VALIDATION_ERROR` — “Informe um CEP com 8 digitos.” |
| 401 / 403 | autenticação / papel insuficiente |
| 404 | `CEP_NOT_FOUND` |
| 429 | `CEP_RATE_LIMIT` + `Retry-After: 60` |
| 502 | `CEP_INVALID_RESPONSE` ou `CEP_UNAVAILABLE` |
| 503 | `CEP_DISABLED` |
| 504 | `CEP_TIMEOUT` |
| Headers | `cache-control: no-store` em todas as respostas |
| Log | `logLevel: 'silent'`; nenhum payload de CEP ou endereço é logado |

O corpo de erro continua o padrão do Full: `{ error, code }`.

### 3.4 Arquivos exatos

**Criar**

- `services/api/src/cep.ts` — provider e normalização.
- `services/api/src/routes/cep.ts` — rota.
- `services/api/tests/cep.test.ts` — unidade do provider.
- `services/api/tests/cep-routes.test.ts` — rota, autorização e mapeamento de erros.
- `apps/agency/src/components/customer/CustomerCepField.tsx` — campo controlado.
- `apps/agency/src/components/customer/CustomerCepField.test.tsx` — testes do campo.

**Editar**

- `services/api/src/errors.ts` — adicionar `HttpError` (3 linhas de classe + 1 ramo no `resolveErrorResponse`). Alternativa sem tocar o arquivo: mapear no `catch` da rota (ver decisão D-CEP-3).
- `services/api/src/app.ts` — importar/registrar a rota e aceitar `cepLookup?: CepLookup` em `BuildAppOptions` (`:113-149`); registrar após `registerCustomerRoutes` (`:327`).
- `services/api/src/server.ts` — injetar `createServerCepLookup()` em `baseAppOptions()` (`:71-101`).
- `apps/agency/src/lib/api.ts` — exportar `CepLookupResult`, `lookupCep(cep, signal?)`; o `request` interno já repassa `signal`.
- `apps/agency/src/pages/CustomerDetailPage.tsx` — estado controlado do endereço, integração do campo e payload.
- `apps/agency/src/pages/CustomerDetailPage.test.tsx` — mock de `lookupCep` e teste de integração do modal.
- `apps/agency/src/pages/CustomersPage.test.tsx` — adicionar `lookupCep: vi.fn()` ao mock (o `...actual` hoje deixaria a função real escapar).

**Não tocar**

- `packages/domain/**` (contrato compartilhado; dedup reservado ao Codex).
- Migrações (nenhuma é necessária).
- `services/api/src/routes/customers.ts`, `services/api/src/customers.ts` (endereço legado em JSONB não é usado pela UI).
- `apps/agency/index.html` / CSP do cliente (não há chamada direta ao ViaCEP).

### 3.5 Passo a passo

#### Etapa A — provider (`services/api/src/cep.ts`)

Portar a semântica do Lite, não o arquivo literal:

1. `normalizeCep(value)` e `normalizeCustomerCep(value, previous)` com o mesmo contrato do Lite (`services/api-lite/src/cep.ts:7-19`).
2. `CepResult` com `neighborhood` (nome estável do contrato).
3. `CepLookup` com:
   - `fetch` injetável, `now` injetável, `cacheLimit` (default 500), `enabled` (default **false** no Full).
   - TTL 24 h e cache por CEP.
   - Deduplicação de chamadas pendentes.
   - Limites: 10/min por principal (`agencyId:userId`), 60/min global, 10 concorrentes, janela de 60 s.
   - URL **fixa** `https://viacep.com.br/ws/${cep}/json/`; `redirect: 'error'`; `accept: application/json`; `AbortSignal` com timeout de 3 s.
   - Leitura com teto de 16 KiB e `content-type` JSON.
   - Validação de `cep` devolvido, `uf` na lista das 27 UFs, campos com limite de tamanho e sem caracteres de controle.
   - `erro: true` → 404; timeout → 504; resposta inválida → 502; rede/erro inesperado → 502.
   - `street` vazio → `status: 'generic'`.
4. `resolveCepLookupConfig(env)`:
   - `TRAVEL_API_CEP_PROVIDER=viacep` habilita.
   - `production` + ausência da variável → desabilitado (fail-closed).
   - `development`/`test` + ausência → habilitado, espelhando o Lite.
   - `disabled` → desabilitado.
   - Nome e default são decisão D-CEP-1.

Não registrar Payload, CEP ou endereço em log.

#### Etapa B — rota (`services/api/src/routes/cep.ts`)

```ts
export function registerCepRoutes(
  app: FastifyInstance,
  lookup: CepLookup,
  protectedHooks: preHandlerHookHandler[],
): void
```

- `app.get('/cep/lookup', { logLevel: 'silent', preHandler: protectedHooks }, handler)`.
- `requireRole(UserRole.AGENT)` antes de qualquer chamada externa.
- `reply.header('cache-control', 'no-store')`.
- Principal: `${getAgencyId()}:${getUserId()}` — nunca `agencyId` do corpo/query.
- `catch`: se `HttpError` com `statusCode === 429`, `reply.header('retry-after', '60')`; relançar para o error handler.
- Sem `request.query.cep` válido, o provider lança `ValidationError` (400) antes de consumir limite? **Ordem recomendada:** normalizar antes de incrementar contadores, como no Lite (`services/api-lite/src/cep.ts:57-58`).

#### Etapa C — registro (`services/api/src/app.ts` + `server.ts`)

- `BuildAppOptions`: `cepLookup?: CepLookup` (opcional, fail-closed).
- `const cepLookup = options.cepLookup ?? new CepLookup({ enabled: false });`
- `registerCepRoutes(app, cepLookup, protectedHooks);` logo após `registerCustomerRoutes` (`app.ts:327`).
- `server.ts` `baseAppOptions()`: `cepLookup: createServerCepLookup()`.
- Nenhuma alteração em `rate-limit.ts`: GET staff já é classificado como `STAFF_READ`, e o provider aplica limites próprios. Uma classe `CEP` dedicada fica como melhoria futura (D-CEP-5).

#### Etapa D — cliente (`apps/agency/src/lib/api.ts`)

```ts
export interface CepLookupResult {
  status: 'ok' | 'generic';
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  source: 'viacep';
}

export async function lookupCep(cep: string, signal?: AbortSignal): Promise<CepLookupResult> {
  return request<CepLookupResult>(
    `/api/cep/lookup?cep=${encodeURIComponent(cep.replace('-', ''))}`,
    { signal },
  );
}
```

`request` já anexa Bearer, limpa sessão em 401 e traduz a mensagem (`api.ts:46-79`). Não criar um segundo cliente HTTP.

#### Etapa E — campo (`apps/agency/src/components/customer/CustomerCepField.tsx`)

Portar `apps/travel-lite/src/CustomerCepField.tsx` com estas adaptações:

- `CepAddress = { street; district; city; state }` (Full usa `district`).
- Resultado do backend usa `neighborhood`; mapear `neighborhood → district` **antes** de comparar/preencher.
- `FIELDS = ['street', 'district', 'city', 'state']`.
- `lookupCep` no lugar de `api<Result>`; `AbortController` e descarte de resposta obsoleta preservados.
- Debounce 400 ms; consulta somente com máscara `^\d{5}-\d{3}$`.
- Baseline + `dirty` + `autoValues` idênticos ao Lite (`CustomerCepField.tsx:20-58`): nunca sobrescrever campo que o usuário editou durante a consulta.
- Mensagens:
  - sucesso: “Endereço preenchido pelo ViaCEP.”
  - parcial: “CEP sem rua específica. Complete o endereço manualmente.”
  - preservado: “CEP consultado. Campos já preenchidos foram preservados.”
  - erro: mensagem do `ApiError` (já traduzida) ou fallback “Não foi possível consultar o CEP. Preencha manualmente.”
- Erro mantém o botão “Tentar novamente” e **não bloqueia** o salvamento.
- Acessibilidade: `label`, `inputMode="numeric"`, `autoComplete="postal-code"`, `maxLength={9}`, `role="status"`, `aria-live="polite"`, `aria-describedby`.
- UI: reutilizar `Input` e `Button` do design system. Sem CSS novo e sem mudança visual além do campo/status.

#### Etapa F — modal (`CustomerDetailPage.tsx`)

Manter o modal atual (sem extrair componente nesta rodada; extração fica como refactor opcional para o Codex):

1. Criar `EMPTY_ADDRESS` e `const [addressDraft, setAddressDraft] = useState(EMPTY_ADDRESS)`.
2. Ao abrir (`:1530`), resetar `addressDraft` e `formError`.
3. Substituir os inputs de endereço (`:1778-1791`) por controlados:
   - CEP → `<CustomerCepField value={addressDraft.cep} address={{ street, district, city, state }} onChange={...} onAddress={...} />`.
   - `street`, `number`, `complement`, `district`, `city`, `state`, `country` → `value` + `onChange`.
   - `type` e `isPrimary` permanecem uncontrolled (lidos do `FormData`), preservando o comportamento atual.
4. `onAddress(next, expected)`: aplicar somente os campos cujo valor atual ainda é igual ao baseline, exatamente como o Lite faz no pai.
5. `handleCreateAddress` (`:743-767`): montar o payload a partir de `addressDraft` + `formString(form, 'type')` + `form.get('isPrimary')`. Manter `reloadAddresses()` e o tratamento de erro atuais.
6. Não alterar a ordem visual dos campos além de inserir o CEP no mesmo lugar.

**Decisão D-CEP-2 (persistência):** hoje o Full grava `cep` cru. Opções:

- **A (recomendada):** normalizar no servidor com `normalizeCustomerCep(value, previous)` em `parseCreateAddressInput`/`parseUpdateAddressInput`, preservando valores legados quando `value === previous`. Sem migração; muda apenas novos valores.
- **B (mínima):** não normalizar; o cliente envia a máscara e o servidor continua aceitando qualquer texto.

A opção A fecha a lacuna de “CEP inválido salvo”, mas toca o parser de endereço. Se o Codex preferir congelar contratos nesta rodada, seguir B e registrar a pendência.

### 3.6 Testes propostos

#### `services/api/tests/cep.test.ts` (unidade)

| Caso | Resultado esperado |
|---|---|
| `01001000`, `01001-000`, ` 01001-000 ` | normalizam para `01001000` |
| `https://viacep.com.br/ws/01001000/json/`, letras, 7/9 dígitos, vazio, não-string | `ValidationError` |
| resposta válida | `status:'ok'`, campos corretos, `source:'viacep'` |
| `logradouro` vazio | `status:'generic'` |
| `erro: true` / `erro: 'true'` | 404 `CEP_NOT_FOUND` |
| `uf` inválida, `cep` divergente, JSON inválido, `content-type` errado | 502 `CEP_INVALID_RESPONSE` |
| corpo > 16 KiB | 502 |
| `fetch` rejeita | 502 `CEP_UNAVAILABLE` |
| timeout/abort | 504 `CEP_TIMEOUT` |
| 11ª consulta do mesmo principal em 60 s | 429 `CEP_RATE_LIMIT` |
| principal distinto | não herda o limite do anterior |
| cache dentro de 24 h | `fetch` chamado uma vez |
| expiração | nova chamada |
| chamadas concorrentes ao mesmo CEP | uma chamada externa (dedupe) |
| `enabled:false` | 503 `CEP_DISABLED` sem `fetch` |
| timeout de 3 s | `AbortSignal` abortado |
| URL solicitada | host fixo, somente 8 dígitos, sem query injetada |

#### `services/api/tests/cep-routes.test.ts` (rota)

Preferir uma instância Fastify mínima com `registerCepRoutes` + `lookup` falso + hooks que estabelecem contexto, no padrão de `services/api-lite/tests/cep-routes.test.ts`. Para 401 real, usar um smoke com `buildApp` no padrão de `services/api/tests/customer-routes.test.ts`.

| Caso | Resultado esperado |
|---|---|
| sem autenticação | 401 |
| `VIEWER` | 403 e provider não chamado |
| `AGENT` | 200 com `{ status, street, neighborhood, city, state, source }` |
| `MANAGER`/`ADMIN`/`OWNER` | 200 (hierarquia) |
| sucesso | `cache-control: no-store` |
| 400 | `VALIDATION_ERROR` |
| 404 | `CEP_NOT_FOUND` |
| 429 | `CEP_RATE_LIMIT` + `retry-after: 60` |
| 503 | `CEP_DISABLED` |
| 502/504 | códigos correspondentes |
| principal | recebido como `${agencyId}:${userId}` |
| query `agencyId` maliciosa | ignorada |

#### `apps/agency/src/components/customer/CustomerCepField.test.tsx` (componente)

Espelhar `apps/travel-lite/src/CustomerCepField.test.tsx`, adaptando `district` e mockando `lookupCep`:

1. Preenche rua/bairro/cidade/UF quando os campos estão vazios.
2. Consulta de novo CEP substitui valores preenchidos automaticamente.
3. Não sobrescreve campo editado manualmente após o preenchimento automático.
4. Não sobrescreve endereço já existente ao abrir/editar (sem consulta no mount).
5. Descarta resposta antiga quando o usuário digita outro CEP durante a consulta.
6. Aborta a requisição no unmount/fechamento e ao trocar o CEP.
7. Erro exibe “Tentar novamente”, mantém o formulário salvavél e não perde os campos.
8. `status:'generic'` mostra a mensagem de complemento manual.
9. Resposta mapeia `neighborhood` para `district`.
10. Não chama `fetch` diretamente para `viacep.com.br`.

#### `apps/agency/src/pages/CustomerDetailPage.test.tsx` (integração)

Adicionar `lookupCep: vi.fn()` e `createCustomerAddress: vi.fn()` ao mock (`vi.mock` usa `...actual`, então sem isso a função real escaparia).

1. Abrir “Novo endereço” não dispara consulta.
2. Digitar `01001-000` dispara `lookupCep('01001000')` após 400 ms e preenche os campos.
3. Digitar número/complemento antes da resposta preserva os valores manuais.
4. Salvar envia `createCustomerAddress` com `cep`, `street`, `number`, `complement`, `district`, `city`, `state`, `country`, `type`, `isPrimary` corretos.
5. Erro de consulta não impede o salvamento manual.
6. Fechar o modal aborta a consulta.

#### `apps/agency/src/pages/CustomersPage.test.tsx`

- Apenas adicionar `lookupCep: vi.fn()` ao mock para impedir chamada real; nenhum comportamento novo é esperado nessa página.

### 3.7 Segurança

- **Sem SSRF:** host fixo, caminho construído apenas com 8 dígitos após validação; sem URL do usuário.
- **Sem PII para terceiros:** somente o CEP é enviado ao ViaCEP; nenhum nome, documento ou `agencyId`.
- **Tenant:** o principal de rate limit vem do contexto autenticado; nenhum `agencyId` de query/corpo é aceito.
- **Autorização:** `requireRole(AGENT)` antes do consumo externo; `VIEWER` não consulta.
- **Abuso:** limites por principal e globais, cache e dedupe; `Retry-After` em 429.
- **Resposta externa:** `redirect:'error'`, timeout, teto de bytes, `content-type` JSON, validação de campos e UF.
- **Logs:** `logLevel:'silent'`; sem CEP/endereço em log.
- **CSP/CORS:** inalterados. O navegador continua falando apenas com a própria API (`connect-src 'self'`).
- **Fail-closed:** provider desabilitado por default em produção sem configuração explícita.

### 3.8 Paridade e decisões pendentes (CEP)

| Ponto | Lite | Full proposto |
|---|---|---|
| Onde o campo aparece | Formulário de cliente | Modal “Novo endereço” em `CustomerDetailPage` |
| Nome do bairro | `neighborhood` | `district` na UI; `neighborhood` no contrato |
| Autorização | permissions `customers.*` | `requireRole(AGENT)` |
| Flag | `TRAVEL_LITE_CEP_PROVIDER` | `TRAVEL_API_CEP_PROVIDER` (D-CEP-1) |
| Erros | `HttpError` | `HttpError` no Full (D-CEP-3) |
| Normalização ao salvar | sim | opcional (D-CEP-2) |

| ID | Decisão | Recomendação | Impacto se não decidida |
|---|---|---|---|
| D-CEP-1 | Nome/default da flag no Full | `TRAVEL_API_CEP_PROVIDER`; habilitado em dev, desabilitado em produção sem valor | Sem flag, produção falha aberta ou fica sem CEP |
| D-CEP-2 | Normalizar CEP persistido | Opção A (normalizar novos valores, preservar legado) | CEP inválido continua sendo gravado |
| D-CEP-3 | `HttpError` em `errors.ts` vs. mapeamento local | `HttpError` aditivo (espelha o Lite e evita duplicação) | Códigos de erro divergentes ou `catch` duplicado |
| D-CEP-4 | Compartilhar provider com o Lite agora | Não; duplicar ~120 linhas e registrar dedup para o BASE | Import cross-service quebra `tsconfig.build.json` do Full |
| D-CEP-5 | Classe de rate limit dedicada | Não nesta rodada; limites no provider | Limite HTTP genérico de `STAFF_READ` continua valendo |

### 3.9 Critérios de aceite (CEP-01)

- [ ] `GET /cep/lookup` responde 200/400/401/403/404/429/502/503/504 conforme a tabela.
- [ ] `VIEWER` recebe 403; `AGENT+` recebe 200.
- [ ] Nenhuma chamada do navegador ao ViaCEP; CSP inalterada.
- [ ] CEP válido preenche rua/bairro/cidade/UF sem sobrescrever edição manual.
- [ ] CEP genérico preenche cidade/UF e informa complemento manual.
- [ ] Erro/429 mantém o salvamento manual disponível e exibe retry.
- [ ] Consulta obsoleta é descartada; requisição é abortada ao fechar/trocar.
- [ ] `agencyId` nunca vem do cliente; logs não contêm CEP/endereço.
- [ ] Testes, lint, typecheck e build dos workspaces afetados passam.

### 3.10 Fora de escopo (CEP-01)

- Migração de dados ou alteração da coluna `cep`.
- Edição de endereço no Full (a UI atual só cria).
- Compartilhamento do provider em `packages/*`.
- Consulta por CEP no portal do cliente ou em outros formulários.
- Cache distribuído/Redis para CEP.

---

## 4. CSV-01 — CSV no Full

### 4.1 Situação atual

#### Lite (referência funcional)

| Evidência | Local |
|---|---|
| `escapeCsvCell` / `toCsv` (vírgula, aspas duplicadas, BOM, CRLF) | `services/api-lite/src/routes/reports.ts:31-43` |
| `sendCsv` (`text/csv; charset=utf-8` + `content-disposition`) | `services/api-lite/src/routes/reports.ts:45-54` |
| Flag `format=csv` | `services/api-lite/src/routes/reports.ts:27-29` |
| Relatórios: vendas, vendedores, comissões, fluxo de caixa | `services/api-lite/src/routes/reports.ts`; `services/api-lite/src/sales-analytics.ts` |
| Cliente: `apiCsv` e `downloadBlob` | `apps/travel-lite/src/api.ts:131-145` |
| Botões e nomes de arquivo | `apps/travel-lite/src/pages/ReportsPage.tsx:99-113,155`; `SellerReportPanel.tsx:98-104` |
| Testes RFC 4180 + BOM + isolamento | `services/api-lite/tests/reports.test.ts:237-370` |

Lacuna conhecida do Lite: `escapeCsvCell` não neutraliza injeção de fórmula (`=`, `+`, `-`, `@`, tab, CR). O Full **não deve copiar essa lacuna**.

#### Full (lacuna)

| Evidência | Local |
|---|---|
| Rotas `/reports/*` somente JSON | `services/api/src/routes/reports.ts:39-127` |
| `requireRole(MANAGER)` em todas | `services/api/src/routes/reports.ts` (ex.: `:43`, `:53`) |
| Formas de linha | `services/api/src/reports.ts:25-33` (vendas), `:119-123` (aging), `:168-174` (fornecedor), `:207-213` (funcionário), `:244-249` (despesa operacional), `:281-285` (previsto vs. realizado), `:323-328` (fluxo), `:362-368` (rentabilidade), `:499-505` (pessoal) |
| Nenhum `text/csv`, `format=csv` ou `content-disposition` | busca estática |
| Frontend gerencial sem exportação | `apps/agency/src/pages/ReportsPage.tsx:389-547` |
| Relatórios detalhados sem exportação | `apps/agency/src/pages/DetailedReportsPage.tsx` |
| Cliente sem helper de blob/download | `apps/agency/src/lib/api.ts:4147-4217`; padrão de blob em `:1153-1175` |
| Sem `services/api/tests/reports*.test.ts` | busca estática |
| Sem migração necessária | — |

### 4.2 Lacunas objetivas

1. Nenhum endpoint exporta CSV.
2. Não há serializador seguro (RFC 4180 + BOM + CRLF + proteção contra CSV injection).
3. O frontend não baixa blob autenticado.
4. A granularidade e o escopo dos relatórios do Full divergem do Lite:
   - vendas: Full é **agregado** por `groupBy`; Lite é **linha a linha** por venda.
   - vendas: Full é `MANAGER` tenant-wide; Lite tem `sales_all` vs. `sales_own`.
   - fluxo de caixa: Full é **mensal**; Lite é **diário**.
   - comissões: Full tem `/commissions/report` (MANAGER), mas está fora do escopo desta rodada por regra explícita.
5. `Sale` do Full não possui `sale_number`, categoria ou parcelas; colunas do Lite não podem ser reproduzidas sem inventar dados (`packages/domain/types.ts:303-318,517-523`; `services/api/src/sales.ts:631-661`).

**Portanto:** CSV-01 entrega paridade de **formato de exportação** e cobre os relatórios equivalentes disponíveis; **não** entrega paridade de conteúdo/escopo. Isso precisa ser declarado no aceite e acompanhado pelo Codex.

### 4.3 Contrato CSV proposto

| Regra | Valor |
|---|---|
| Ativação | `?format=csv` (opt-in); ausente = JSON atual, inalterado |
| `format` inválido | 400 `VALIDATION_ERROR` (D-CSV-2) |
| Delimitador | `,` |
| Quebra de linha | `\r\n` |
| Encoding | UTF-8 com BOM (`\uFEFF`) |
| Cabeçalho | primeira linha, nomes ASCII em `snake_case` já usados pelo JSON |
| Linhas | uma por item; **sem** linha de totais (Lite também não inclui) |
| Valores monetários | número cru com ponto decimal (`1500.5`), sem `R$`, sem separador de milhar |
| Datas | `YYYY-MM-DD`; períodos `YYYY-MM` |
| Nulos | célula vazia |
| Aspas | RFC 4180: aspas duplicadas; célula entre aspas se contiver `,`, `"`, CR ou LF |
| Fórmula | célula **texto** iniciada por `=`, `+`, `-`, `@`, TAB ou CR recebe prefixo `'`; números negativos permanecem numéricos |
| Content-Type | `text/csv; charset=utf-8` |
| Content-Disposition | `attachment; filename="<slug-ascii>.csv"` |
| Cache | `private, no-store` |
| Outros headers | `x-content-type-options: nosniff` |
| Autorização | a mesma `requireRole` do JSON, executada **antes** da consulta |
| Tenant | mesma consulta do JSON; nenhum `agencyId` do cliente |
| Nome do arquivo | gerado no servidor, ASCII, sem entrada livre (exceto `groupBy` sanitizado) |

**Contrato de função (novo módulo puro):**

```ts
export type CsvValue = string | number | null | undefined;

export function escapeCsvCell(value: CsvValue): string;
export function toCsv(headers: readonly string[], rows: readonly (readonly CsvValue[])[]): string;
export function isCsvRequest(query: unknown): boolean;
export function sendReportCsv(
  reply: FastifyReply,
  filename: string,
  headers: readonly string[],
  rows: readonly (readonly CsvValue[])[],
): FastifyReply;
```

`escapeCsvCell` deve tratar `number` antes da regra de fórmula:

```ts
if (value === null || value === undefined) return '';
if (typeof value === 'number') return String(value); // -150 continua -150
const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
```

### 4.4 Mapeamento endpoint → CSV

Todos os endpoints abaixo já existem em `services/api/src/routes/reports.ts`; a mudança é somente de serialização.

| Endpoint | `groupBy`/filtros | Cabeçalho CSV | Nome do arquivo | Paridade Lite |
|---|---|---|---|---|
| `/reports/sales` | `groupBy=period\|employee\|destination\|customer\|product`, `from`, `to` | `key,label,count,total` | `vendas-<groupBy>.csv` | Parcial (agregado vs. linha; sem escopo own) |
| `/reports/financial/receivables-aging` | — | `bucket,count,total` | `contas-a-receber-aging.csv` | Sem equivalente Lite |
| `/reports/financial/payables-aging` | — | `bucket,count,total` | `contas-a-pagar-aging.csv` | Sem equivalente Lite |
| `/reports/financial/supplier-exposure` | — | `supplier_id,supplier_name,open_total,paid_total,count` | `exposicao-fornecedores.csv` | Sem equivalente Lite |
| `/reports/financial/employee-expenses` | — | `employee_id,employee_name,payroll_total,commission_total,total` | `despesas-funcionarios.csv` | Sem equivalente Lite |
| `/reports/financial/operational-expenses` | — | `category_id,category_name,total,count` | `despesas-operacionais.csv` | Sem equivalente Lite |
| `/reports/financial/expected-vs-actual` | `from`, `to` | `label,expected,actual` | `previsto-vs-realizado.csv` | Sem equivalente Lite |
| `/reports/financial/cash-flow` | `from`, `to` | `period,inflow,outflow,net` | `fluxo-de-caixa-<from>-a-<to>.csv` | Parcial (mensal vs. diário) |
| `/reports/profitability` | `groupBy=sale\|trip\|destination\|salesperson\|air\|land` | `key,label,revenue,cost,margin` | `rentabilidade-<groupBy>.csv` | Sem equivalente Lite |
| `/reports/personnel` | `groupBy=employee\|month` | `key,label,salary_expense,commission_total,total` | `pessoal-<groupBy>.csv` | Sem equivalente Lite |

**Fora do escopo (bloqueado por regra):**

- `/commissions/report` (`services/api/src/routes/commissions.ts:353-364`) — exportação de comissões exige decisão de COM-01..COM-03. Não incluir nesta rodada.
- `financial.ts` / `payroll.ts` — nenhuma regra de negócio é alterada.

**Nota de escopo financeiro:** os endpoints `/reports/financial/*` são apenas leitura e serialização na borda HTTP de `routes/reports.ts`; não alteram `financial.ts`. Se o Codex interpretar “não tocar financeiro” de forma estrita, limitar a Fase 1 a `/reports/sales` e `/reports/financial/cash-flow`, mantendo as demais linhas como Fase 2 (D-CSV-1).

### 4.5 Arquivos exatos

**Criar**

- `services/api/src/report-csv.ts` — serializador puro.
- `services/api/tests/report-csv.test.ts` — unidade.
- `services/api/tests/reports-csv-http.test.ts` — HTTP/autorização/tenant.

**Editar**

- `services/api/src/routes/reports.ts` — `format` opcional em cada rota; após calcular `rows`, se CSV, `sendReportCsv`. Nenhuma consulta nova.
- `apps/agency/src/lib/api.ts` — `api.csv(path)` e `downloadBlob(blob, filename)`; o primeiro usa `fetch` + `authHeaders` + `handleAuthResponse` + `safeJson` já existentes (`:3880-3892`), devolvendo `{ blob, filename }` a partir de `content-disposition`.
- `apps/agency/src/pages/ReportsPage.tsx` — botão “Baixar CSV” na seção gerencial, usando o **mesmo path** já carregado + `format=csv`.
- `apps/agency/src/pages/ReportsPage.test.tsx` — adicionar `csv: vi.fn()` ao mock e testar o botão.

**Não tocar**

- `services/api/src/reports.ts` (consultas e regras).
- `services/api/src/financial.ts`, `payroll.ts`, `commissions.ts`, `routes/commissions.ts`.
- `packages/domain/**`, migrações, `rate-limit.ts`.
- `apps/agency/src/pages/DetailedReportsPage.tsx` (usar `/financial/reports/*`, fora do contrato desta rodada).

### 4.6 Passo a passo

1. **Serializador puro** (`report-csv.ts`):
   - `escapeCsvCell` com a ordem número → fórmula → RFC 4180.
   - `toCsv` com BOM e CRLF, sem linha extra além do cabeçalho + linhas.
   - `isCsvRequest(query)`: aceita apenas `format === 'csv'`; `format` presente e diferente → `ValidationError`.
   - `sendReportCsv`: `reply.type('text/csv; charset=utf-8')`, `content-disposition`, `cache-control: private, no-store`, `x-content-type-options: nosniff`, `reply.send(toCsv(...))`.
   - `sanitizeFilenamePart(value)`: `[^a-z0-9-]` removido, minúsculo, máximo 24 caracteres, fallback `report`.
   - Sem `Date`, sem I/O, sem `database`.

2. **Rotas** (`routes/reports.ts`):
   - Estender o tipo de `Querystring` de cada rota com `format?: string` (ou usar um helper que aceita `unknown`, evitando repetir o tipo).
   - Manter `requireRole(UserRole.MANAGER)` como primeira instrução.
   - Calcular `rows` exatamente como hoje.
   - `if (isCsvRequest(request.query)) return sendReportCsv(reply, filename, HEADERS, rows.map(toRow));`
   - `return { rows };` inalterado.
   - `filename` determinístico e ASCII; `from`/`to` só entram no nome após `normalizeDatePart` (regex `^\d{4}-\d{2}-\d{2}$`), senão `all`.
   - Nenhuma alteração nos parsers de data (`new Date(...)`) para não mudar o JSON.

3. **Cliente** (`lib/api.ts`):
   - `api.csv(path)`: fetch `${API_BASE_URL}/api${path}`, `authHeaders(false)`, `handleAuthResponse`, erro via `safeJson` + `translateApiErrorMessage`, `blob`, filename do header.
   - `downloadBlob`: `URL.createObjectURL`, `<a download>`, `click`, `remove`, `revokeObjectURL`; aceitar fallback `relatorio.csv`.
   - Reutilizar o padrão de `openDocumentAttachment` (`:1153-1175`), sem refatorar os três usos existentes nesta rodada.

4. **UI** (`ReportsPage.tsx`):
   - Extrair o cálculo de `path` da `useEffect` para uma função pura `reportPath(...)` usada tanto pelo carregamento quanto pelo download (evita divergência de filtros).
   - Botão “Baixar CSV” ao lado dos seletores/tabs, com estado `downloading`, `disabled` durante a requisição, e erro no mesmo `error` da seção.
   - Não adicionar filtros de data novos; exportar exatamente o que a tabela mostra.
   - Sem mudança de layout além do botão.

5. **Testes**: ver 4.7.

### 4.7 Testes propostos

#### `services/api/tests/report-csv.test.ts` (unidade)

| Caso | Resultado esperado |
|---|---|
| texto simples | inalterado |
| vírgula, aspas, CRLF/LF | célula entre aspas, aspas duplicadas |
| `=SUM(A1:A2)` | `"'=SUM(A1:A2)"` |
| `+55`, `@cmd`, `\tfoo`, `\rfoo` | prefixo `'` e quoting quando necessário |
| `-150` (number) | `-150` (sem prefixo) |
| `null`/`undefined` | vazio |
| BOM | primeiro caractere `\uFEFF` |
| CRLF | todas as quebras `\r\n` |
| cabeçalho + 0 linhas | apenas cabeçalho + CRLF |
| número decimal | `1500.5`, nunca `1.500,50` |
| data ISO | `2026-10-23` |
| `isCsvRequest` | `csv` → true; ausente/`json`/array/objeto → false/erro conforme contrato |

#### `services/api/tests/reports-csv-http.test.ts` (HTTP)

Usar o padrão de `services/api/tests/financial-http.test.ts`/`customer-routes.test.ts` (`buildApp` + banco descartável). **Não executar fixtures nesta rodada.**

| Caso | Resultado esperado |
|---|---|
| `AGENT`/`VIEWER` em `/reports/sales?format=csv` | 403 (não bypassa `requireRole`) |
| `MANAGER` | 200 `text/csv; charset=utf-8` |
| `content-disposition` | `attachment; filename="vendas-period.csv"` |
| BOM + CRLF | bytes `EF BB BF`, linhas `\r\n` |
| CSV vs. JSON | mesmo número de linhas, mesmos valores por célula |
| `groupBy=customer` com nome contendo vírgula/aspas | célula corretamente escapada |
| nome de cliente começando com `=` | prefixo `'` |
| `-150` em `net` | permanece `-150` |
| `format=csv` + `from/to` | filtros iguais aos do JSON |
| sem `format` | JSON idêntico ao atual |
| `format=xml` | 400 `VALIDATION_ERROR` |
| tenant A | CSV não contém dados do tenant B |
| `cache-control` | `private, no-store` |
| `/reports/financial/cash-flow?format=csv` | cabeçalho `period,inflow,outflow,net` |
| `/reports/profitability?format=csv` | cabeçalho `key,label,revenue,cost,margin` |
| `/reports/personnel?format=csv` | cabeçalho `key,label,salary_expense,commission_total,total` |

#### `apps/agency/src/pages/ReportsPage.test.tsx`

Mock atual substitui o objeto `api` inteiro (`vi.mock` retorna apenas `{ api: { get } }`); incluir `csv: vi.fn()`.

1. Aba Vendas → botão “Baixar CSV” chama `api.csv('/reports/sales?groupBy=period&format=csv')`.
2. Aba Financeiro com `cash-flow` → path com `format=csv`.
3. Sucesso chama `downloadBlob` com o blob e o filename do header.
4. Erro exibe mensagem e reabilita o botão.
5. Durante o download, botão fica `disabled`.
6. Nenhum teste existente muda de comportamento quando `format` está ausente.

### 4.8 Segurança

- **CSV/Formula injection:** prefixo `'` em células de texto; números negativos preservados; teste explícito com `=`, `+`, `-`, `@`, TAB e CR.
- **Header injection:** filename gerado no servidor; `groupBy` sanitizado; nunca ecoar `from`/`to` sem regex.
- **Autorização:** `requireRole(MANAGER)` antes da consulta; `format=csv` não cria caminho alternativo.
- **Tenant:** mesma consulta e mesmo `getAgencyId()`; CSV não faz query própria.
- **Dados financeiros:** `private, no-store`, `nosniff`; sem cache compartilhado.
- **Sem PII nova:** exporta apenas o que o JSON já retorna ao mesmo papel.
- **Sem nova superfície de escrita:** GET somente.

### 4.9 Paridade e decisões pendentes (CSV)

| ID | Decisão | Recomendação | Impacto |
|---|---|---|---|
| D-CSV-1 | Incluir todos os `/reports/*` ou só vendas + fluxo na Fase 1 | Incluir todos os 10 endpoints no mesmo serializer, pois é a mesma mudança local e não altera regras; se “financeiro” for estrito, Fase 1 = vendas + cash-flow | Escopo da revisão do Codex |
| D-CSV-2 | `format` inválido | 400 explícito | Evita parâmetro silenciosamente ignorado |
| D-CSV-3 | Exportação de comissões | Fora desta rodada; depende de COM-01..COM-03 | Paridade CSV permanece incompleta |
| D-CSV-4 | Corrigir formula injection no Lite | Backport posterior, fora desta rodada | Lite continua vulnerável a CSV injection |
| D-CSV-5 | Refatorar os 3 downloads de blob existentes | Não nesta rodada; reutilizar o novo helper depois | Duplicação pequena e pré-existente |
| D-CSV-6 | Exportar `DetailedReportsPage` | Não; usa `/financial/reports/*`, contrato distinto | Página detalhada continua sem CSV |

### 4.10 Critérios de aceite (CSV-01)

- [ ] `?format=csv` funciona em `/reports/sales` e `/reports/financial/cash-flow` (mínimo) e, se aprovado, nos demais `/reports/*`.
- [ ] JSON sem `format` permanece byte-equivalente em estrutura e valores.
- [ ] CSV começa com BOM, usa CRLF e vírgula; aspas/quebras são RFC 4180.
- [ ] Fórmulas em células de texto são neutralizadas; números negativos permanecem numéricos.
- [ ] `AGENT`/`VIEWER` recebem 403; `MANAGER+` recebe 200.
- [ ] CSV nunca contém dados de outro tenant.
- [ ] `content-type`, `content-disposition`, `cache-control` e `nosniff` corretos.
- [ ] Botão “Baixar CSV” baixa o mesmo conjunto que a tabela exibe.
- [ ] Nenhuma alteração em comissões, folha, financeiro ou migrações.
- [ ] Testes, lint, typecheck e build dos workspaces afetados passam.

### 4.11 Fora de escopo (CSV-01)

- Relatório de vendas linha a linha no Full.
- Escopo “próprio vendedor” (`sales_own`) e permissões por usuário (SEC-01).
- Exportação de comissões (`/commissions/report`).
- Fluxo de caixa diário.
- Exportação na `DetailedReportsPage` (`/financial/reports/*`).
- XLSX, PDF ou agendamento de exportação.

---

## 5. Dependências e coordenação

| Item | Depende de | Motivo |
|---|---|---|
| CEP-01 | BASE (contratos/rotas) | Registro em `app.ts`/`server.ts` e eventual classe de erro compartilhada |
| CEP-01 | SEC-01 (se permissions substituírem roles) | Hoje `requireRole(AGENT)` é o equivalente fiel ao Lite; se SEC-01 introduzir permissão granular, o CEP deve usar a mesma permissão de criação/edição de cliente |
| CSV-01 | BASE | Serializador e contrato de resposta |
| CSV-01 | SEC-01 | Escopo por usuário/vendedor, se aplicável a relatórios |
| CSV-01 (comissões) | COM-01..COM-03 | Exportação de comissões não pode ser feita antes das regras |
| DASH-01 | SEC-01 | Sem relação direta com CEP/CSV; não é bloqueado por esta rodada |

**Reservado ao Codex (não implementar aqui):**

- `packages/domain/**` e qualquer contrato compartilhado.
- Migrações e init do banco.
- Consolidação de `errors.ts`, `app.ts`, `server.ts` e do cliente `lib/api.ts`.
- Deduplicação do provider CEP entre Full e Lite.
- Permissões/RBAC (SEC-01) e backup (BAK-01).

---

## 6. Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Divergência de semântica CEP (`neighborhood` vs. `district`) | Alta | Médio | Mapeamento explícito no componente + teste dedicado |
| Provider CEP duplicado entre serviços | Certa | Baixo | Registrar dedup no BASE; não importar cross-service agora |
| Normalização de CEP alterar endereços legados | Média | Médio | `normalizeCustomerCep(value, previous)` + decisão D-CEP-2 |
| CSV injection | Média | Alto | Prefixo `'` + testes com fórmulas |
| Exportação vazar dados entre tenants | Baixa | Crítico | Mesma query/tenant do JSON + teste de isolamento |
| `format=csv` bypassar autorização | Baixa | Crítico | `requireRole` antes da consulta + teste 403 |
| Divergência entre JSON e CSV | Média | Médio | Teste comparando ambos com o mesmo filtro |
| Escopo crescer para “paridade de relatório” | Alta | Médio | Aceite declara paridade parcial; itens de conteúdo ficam para rodada futura |
| Nome de arquivo com entrada do usuário | Baixa | Médio | Whitelist/sanitização + nome fixo por endpoint |

---

## 7. Decisões pendentes (consolidado)

| ID | Tema | Dono sugerido | Bloqueia código? |
|---|---|---|---|
| D-CEP-1 | Nome/default da flag `TRAVEL_API_CEP_PROVIDER` | Codex | Sim (config) |
| D-CEP-2 | Normalizar CEP persistido no Full | Codex + segurança | Não (pode ficar para depois) |
| D-CEP-3 | `HttpError` aditivo em `errors.ts` | Codex | Sim (mapeamento de erro) |
| D-CEP-4 | Dedup do provider Full/Lite | Codex (BASE) | Não |
| D-CEP-5 | Classe de rate limit `CEP` | Codex | Não |
| D-CSV-1 | Todos os `/reports/*` ou só vendas + fluxo | Codex | Sim (escopo) |
| D-CSV-2 | 400 para `format` inválido | Codex | Não |
| D-CSV-3 | Exportação de comissões | Claude/Codex + COM | Sim (paridade completa) |
| D-CSV-4 | Backport de formula injection no Lite | Codex | Não (rodada futura) |
| D-CSV-5 | Refatorar downloads de blob | Codex | Não |
| D-CSV-6 | CSV na `DetailedReportsPage` | Codex | Não |

---

## 8. Checklist para revisão do Codex

- [ ] CEP-01 usa `requireRole(AGENT)` ou a permissão equivalente aprovada no SEC-01.
- [ ] CEP-01 não introduz chamada de navegador ao ViaCEP e não altera CSP/CORS.
- [ ] CEP-01 não aceita `agencyId` do cliente.
- [ ] CEP-01 tem flag fail-closed em produção.
- [ ] CEP-01 não altera `customer_addresses` nem migrações.
- [ ] CSV-01 não altera o JSON existente quando `format` está ausente.
- [ ] CSV-01 não cria query paralela; usa `rows` já calculadas.
- [ ] CSV-01 não toca comissões/folha/financeiro.
- [ ] CSV-01 neutraliza fórmulas e preserva números negativos.
- [ ] CSV-01 tem teste de 403 e de isolamento de tenant.
- [ ] Nomes de arquivo são ASCII e gerados no servidor.
- [ ] Nenhum teste foi marcado como executado sem execução real.

---

## 9. Anexo A — Matriz de paridade

### CEP

| Capacidade | Lite | Full hoje | Full proposto |
|---|---|---|---|
| Consulta server-side | Sim | Não | Sim |
| Preenchimento automático | Sim | Não | Sim |
| Preservação de edição manual | Sim | N/A | Sim |
| Cancelamento/descarte de resposta obsoleta | Sim | N/A | Sim |
| Cache + limites | Sim | Não | Sim |
| Erros tipados | Sim | Não | Sim |
| Feature flag | Sim | Não | Sim (D-CEP-1) |
| Testes provider/rota/componente | Sim | Não | Sim |

### CSV

| Capacidade | Lite | Full hoje | Full proposto |
|---|---|---|---|
| `/reports/sales` CSV | Sim (linha a linha) | Não | Sim (agregado) |
| Vendedores | Sim | Não | Equivalente via `groupBy=employee` |
| Comissões | Sim | Não | Fora do escopo (COM) |
| Fluxo de caixa CSV | Sim (diário) | Não | Sim (mensal) |
| BOM/CRLF/RFC 4180 | Sim | Não | Sim |
| Formula injection | Não protegido | N/A | Protegido |
| Escopo own-seller | Sim | Não | Fora do escopo (SEC-01) |
| Botão de download | Sim | Não | Sim |

---

## 10. Anexo B — Evidências rápidas (arquivo:linha)

- `apps/travel-lite/src/CustomerCepField.tsx:14-82` — lógica de CEP do Lite.
- `services/api-lite/src/cep.ts:7-19,21-28,38-136` — normalização, contrato e provider.
- `services/api-lite/src/routes/cep.ts:8-19` — rota, permissão e headers.
- `apps/agency/src/pages/CustomerDetailPage.tsx:743-767,1530,1756-1797` — modal e payload atuais.
- `services/api/src/customer-addresses.ts:16-17,38-63` — modelo de endereço.
- `services/api/src/routes/customer-documents.ts:132-199,866-903` — rotas e parser.
- `infrastructure/migrations/019_customer_360_addresses.sql:50-93` — schema.
- `packages/domain/tenant-context.ts:388-409` — hierarquia de papéis.
- `services/api/src/errors.ts:13-35,71-114` — erros e handler.
- `services/api/src/app.ts:215-235,327` — CSP e registro de clientes.
- `services/api/src/server.ts:71-101` — composição de opções.
- `apps/agency/src/lib/api.ts:46-79,1153-1175,4147-4217` — request, blob e cliente genérico.
- `apps/agency/vite.config.ts:22-27` — proxy `/api`.
- `services/api/src/routes/reports.ts:39-127` — rotas de relatório.
- `services/api/src/reports.ts:25-33,119-123,168-174,207-213,244-249,281-285,323-328,362-368,499-505` — formas de linha.
- `services/api-lite/src/routes/reports.ts:27-54` — serializador CSV do Lite.
- `apps/travel-lite/src/api.ts:131-145` — `apiCsv`/`downloadBlob` do Lite.
- `apps/agency/src/pages/ReportsPage.tsx:389-547` — seção gerencial do Full.

---

**Fim do relatório.** Status final: **HOLD** até revisão do Codex. Nenhum código, migração, tipo compartilhado, dependência ou configuração foi alterado; nenhum teste foi executado.
