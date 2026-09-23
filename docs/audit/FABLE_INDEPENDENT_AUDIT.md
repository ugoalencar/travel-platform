# TRAVEL PLATFORM — AUDITORIA INDEPENDENTE

- **HEAD analisado:** `940a02b4ad3ca6b5547b1fbcd0e73925ddebfa53`
- **Branch:** `main`
- **Data:** 2026-09-23
- **Modo:** READ ONLY / evidence first. Nenhum arquivo de código, teste, migration ou configuração foi alterado. Nenhum commit, push ou deploy.

| Severidade | Quantidade |
|---|---|
| P0 | 1 |
| P1 | 4 |
| P2 | 9 |
| P3 | 10 |

> **Working tree com WIP de outra sessão (não faz parte do HEAD auditado):** no momento da auditoria havia mudanças não commitadas em `media-library.ts`, `offers.ts`, `agency-communications.ts`, `audit-log.ts` e um teste novo `services/api/tests/media-library-http.test.ts`. Esse WIP corrige parte do achado F-08 e adiciona eventos de auditoria de mídia. A auditoria considera **somente o HEAD**; o WIP é citado onde é relevante.

## Método e fontes de evidência

- Leitura de código em `services/api/src`, `apps/*/src`, `packages/domain` e `infrastructure/migrations` (001–094, numeração contínua, sem duplicatas).
- **Catálogo real do Postgres:** as 94 migrations + `002_prepare_local_roles.sql` foram aplicadas num banco de rascunho isolado (`audit_scratch_ro`) no container local descartável, inspecionado via `pg_class`/`pg_policies`/`pg_constraint` e **apagado ao final**. Resultado: 175 tabelas.
- **Reprodução dinâmica** (testes de rascunho fora do repositório, com `buildApp` real e banco falso em memória) para F-01, F-02 e F-03/F-10.
- `npm audit --omit=dev` e checagem de scripts de instalação.
- Nenhum teste existente foi alterado. Testes existentes não foram reexecutados nesta rodada: a rodada anterior registrou 1616/1616 no mesmo HEAD, e a CI real do commit `940a02b` passou.

## Conclusão factual

- **Há blocker técnico para qualquer deploy exposto à internet:** a autenticação do Platform Admin aceita headers de dev em produção (F-01, reproduzido). Qualquer pessoa sem credencial obtém acesso de Platform Owner.
- **Áreas de maior risco:** Platform Admin (auth + RBAC), Import Center (SQL injection latente, fluxo não funcional), visibilidade/segmentação de Offers para o cliente e storage de arquivos (disco local apenas).
- **Features recentes que precisam de revisão:** Media Library (contagem de uso ignora capas de Offer/Communication; a capa nunca chega ao Customer App), Segmentação × Offers/Communications (integração é stub) e Import Center (não funciona via HTTP).
- **O que está sólido e foi verificado:** RLS com `ENABLE` + `FORCE` em **todas** as tabelas tenant, sem policy permissiva; role de runtime sem `SUPERUSER`/`BYPASSRLS`; dev-auth de Staff/Customer com trava dupla; CORS fail-closed; error handler sem vazamento; tokens de sessão e recovery codes guardados como hash; MFA de agência com AES-256-GCM; query builder de segmentação parametrizado; alocação financeira com `FOR UPDATE`; `npm audit` de produção limpo.

---

## ENTREGA 2 — FINDINGS (ordenados por severidade)

### F-01
- **SEVERIDADE:** P0
- **STATUS:** CONFIRMADO (código + reprodução dinâmica)
- **TÍTULO:** Platform Admin aceita identidade forjada por header (`x-dev-platform-*`) em produção

**EVIDÊNCIA**
- `services/api/src/server.ts:45-67` — `baseAppOptions()` **não** passa `platformAuthProvider`.
- `services/api/src/app.ts:264` — `options.platformAuthProvider ?? new PlatformDevAuthProvider()`.
- `services/api/src/platform-dev-auth.ts:4-21` — aceita qualquer `x-dev-platform-user-id` + `x-dev-platform-user-role`, **sem** checar `NODE_ENV` ou `ALLOW_DEV_AUTH`. O role é convertido (`as PlatformUserRole`) sem validação.
- `services/api/src/session-auth.ts:80-94` — `composePlatformAuthProviders` testa o provider dev **primeiro**.
- Contraste: a dev-auth de Staff/Customer tem trava dupla (`dev-auth.ts:46`: `ALLOW_DEV_AUTH === flag && NODE_ENV !== 'production'`). A de plataforma não tem nenhuma.
- Nenhum proxy remove os headers (`infrastructure/Caddyfile.local-staging` e os `vercel.json` não filtram `x-dev-*`).
- Nenhum teste cobre esse caminho (`git grep` por `x-dev-platform-user`/`PlatformDevAuthProvider` em `services/api/tests` e `tests`: 0 arquivos).

**Reprodução executada** (`NODE_ENV=production`, `buildApp` sem `platformAuthProvider`, igual ao `server.ts`):
```
no-headers GET /platform/subscribers                      -> 401
forged PLATFORM_OWNER GET /platform/subscribers           -> 200 {"subscribers":[...]}
forged role=ANYTHING GET /platform/audit                  -> 200 {"logs":[...]}
forged READ_ONLY_AUDITOR PATCH /platform/subscriptions/x/status -> 200
```

**IMPACTO:** acesso anônimo total ao Platform Admin: lista de todas as agências assinantes (contato, e-mail, telefone), chamados de suporte de **todos** os tenants (`listSupportCases` sem filtro), audit logs e métricas financeiras da plataforma. Permite também escrita: suspender assinaturas, alterar planos, settings e feature flags, publicar banners na landing pública (vetor de phishing) e abrir "support sessions".

**CENÁRIO DE FALHA:** a API sobe em `api.travelplataforma.com.br` (domínio já referenciado nos `vercel.json`), e um atacante envia `curl -H 'x-dev-platform-user-id: x' -H 'x-dev-platform-user-role: PLATFORM_OWNER' https://api.../platform/subscribers`.

**COMO REPRODUZIR:** `app.inject` em `/platform/subscribers` com os dois headers, `NODE_ENV=production` e sem `platformAuthProvider`.

**CORREÇÃO SUGERIDA:** aplicar ao provider de plataforma a mesma trava dupla do staff, ou não compor o dev provider quando `NODE_ENV=production`. Fazer o `server.ts` injetar explicitamente o provider de produção. Validar o role contra o enum `PlatformUserRole`. Fazer `validateProductionEnvironment` recusar subir se o dev provider estiver ativo.

**TESTE QUE DEVERIA EXISTIR:** `buildApp` com `NODE_ENV=production` + headers `x-dev-platform-*` ⇒ 401 em todas as rotas `/platform/*`; role fora do enum ⇒ 401/403.

**Contexto de exposição:** `docs/release/PILOT_REMOTE_DEPLOYMENT_REPORT.md` (2026-09-20) indica infraestrutura remota **ainda não provisionada**. Não há evidência de API pública hoje, por isso é blocker de deploy, não incidente ativo.

---

### F-02
- **SEVERIDADE:** P1
- **STATUS:** CONFIRMADO (código + reprodução)
- **TÍTULO:** Rotas de escrita do Platform Admin sem autorização por role

**EVIDÊNCIA:** em `services/api/src/platform-routes.ts`, só o toggle de feature flag (`:486`) e as escritas comerciais (`:568`) chamam `requirePlatformRole`. Planos (POST/PATCH/DELETE `:184-225`), assinaturas (`:235-270`), leads, subscribers, settings, suporte, banners (`:654`), partners, referrals e support sessions aceitam **qualquer** principal autenticado, incluindo `READ_ONLY_AUDITOR`. Na reprodução do F-01, `READ_ONLY_AUDITOR` fez `PATCH /platform/subscriptions/x/status` → 200.

**IMPACTO:** mesmo com F-01 corrigido, um usuário de plataforma de baixo privilégio (auditor/marketing/suporte) consegue suspender tenants, alterar planos e editar settings globais.

**CORREÇÃO SUGERIDA:** matriz explícita por rota (`PLATFORM_OWNER`/`PLATFORM_ADMIN` para escrita; `BILLING_ADMIN` só para billing, etc.) e negação por padrão.

**TESTE QUE DEVERIA EXISTIR:** para cada rota de escrita `/platform/*`, `READ_ONLY_AUDITOR` ⇒ 403.

---

### F-03
- **SEVERIDADE:** P1
- **STATUS:** CONFIRMADO no código; exploração LATENTE (NECESSITA TESTE após o wiring do hook)
- **TÍTULO:** SQL injection e escrita arbitrária de colunas no Import Center (nome de coluna vindo do cliente)

**EVIDÊNCIA**
- `routes/import.ts:168-179` — o `mapping` vem do body em `/validate` e é salvo inteiro em `import_jobs.mapping` (`import/service.ts:207-215`).
- `import/validator.ts:149-152` — campo de destino desconhecido é "pulado em silêncio" na validação, mas **continua** no mapping salvo.
- `import/service.ts:380-402` — `insertEntity` interpola `targetField` direto em `INSERT INTO ${tableName} (${columnList})`. A única exclusão é `id/created_at/updated_at/deleted_at`.
- Para `EMPLOYEE`, o destino é a tabela `users` (`:418-419`), permitindo escolher `role`, `password_hash` e `status` (criar um `OWNER` com senha conhecida no próprio tenant).
- O INSERT usa `row.data` **cru**, não o `normalizedData` validado.

**Por que está latente:** as rotas de import não usam `protectedHooks` (ver F-10), então `getAgencyId()` falha antes de qualquer query. A reprodução confirmou `500 "No tenant context available"` com 0 queries executadas. **A correção óbvia de "ligar o hook para o Import Center funcionar" ativa a injection.**

**IMPACTO (quando ativo):** escalonamento de privilégio dentro do tenant; injeção no identificador de coluna para `INSERT ... SELECT` lendo tabelas sem RLS acessíveis ao role de runtime (ver F-06: `platform_users.password_hash`, `mfa_secret`).

**CORREÇÃO SUGERIDA:** allowlist estrita de colunas por entidade, aplicada no `validate` **e** no `insert`; nunca interpolar identificadores vindos do cliente; nunca permitir `users.role/password_hash` via import; inserir a partir de `normalizedData`.

**TESTE QUE DEVERIA EXISTIR:** mapping com destino fora da allowlist (inclusive `role`, `password_hash`, `name) ...`) ⇒ 400 no validate e nenhuma linha inserida.

---

### F-04
- **SEVERIDADE:** P1
- **STATUS:** CONFIRMADO (código + documentação divergente)
- **TÍTULO:** Segmentação de Offers para o cliente é fail-open; oferta oculta acessível por id

**EVIDÊNCIA**
- `services/api/src/customer-portal.ts:273-291` — todo segmento ativo com `filter_definition` entra em `eligibleSegmentIds`. O comentário admite: *"include all active segments — the segment filtering will be fully implemented when the segmentation query builder is integrated"*. Uma oferta com `target_segment_id` aparece para **qualquer** cliente do tenant.
- `customer-portal.ts:309-326` — `getAvailableOfferById` não checa `show_on_customer_app` nem `target_segment_id`: qualquer cliente abre por id uma oferta ativa marcada como oculta do app. O mesmo check é reutilizado pelo tracking (`customer-engagement.ts:74-78`).
- `runFilterDefinition` (o query builder real) só é importado por `customer-segments.ts` e `routes/customer-segments.ts`.
- Documentação: `docs/product/CENTRAL_COMUNICACAO_AGENCIA.md:102-106` afirma que *"Membership é computado em tempo de leitura via `customer_segments.filter_definition`"*.
- Communications fazem o inverso (fail-closed): `agency-communications.ts:333` exige `target_segment_id IS NULL`, então comunicações segmentadas **nunca** aparecem.

**IMPACTO:** uma oferta exclusiva (ex.: desconto VIP) vaza para todos os clientes do tenant, e a agência não recebe nenhum aviso disso.

**CORREÇÃO SUGERIDA:** usar `runFilterDefinition` (ou um `EXISTS` equivalente) para o `customerId` corrente; aplicar a mesma regra em `getAvailableOfferById`; alinhar Communications à mesma regra.

**TESTE QUE DEVERIA EXISTIR:** cliente fora do segmento ⇒ oferta segmentada ausente da lista e 404 por id; oferta com `show_on_customer_app=false` ⇒ 404 por id.

---

### F-05
- **SEVERIDADE:** P1 (prontidão de deploy / integridade de dados)
- **STATUS:** CONFIRMADO
- **TÍTULO:** Storage só em disco local; adaptador Supabase é código morto

**EVIDÊNCIA**
- `services/api/src/supabase-storage.ts` não é importado por nenhum arquivo, e `STORAGE_PROVIDER` não é lido em lugar nenhum de `services/api/src`.
- Todo upload (documentos/passaportes, fotos de viagem, Media Library) passa por `file-storage.ts:29` → `UPLOADS_DIR ?? ./uploads`.
- O `Dockerfile` de produção não declara volume (só `docker-compose.local-staging.yml:70-78` monta um).
- Divergências: `docs/staging-uat-golive/ENV_CHECKLIST.md:90` lista `STORAGE_PROVIDER` (`LOCAL` ou `S3`); `docs/product/MEDIA_LIBRARY.md` cita o adaptador Supabase como "já presente"; o commit `0178895` anuncia "Supabase storage".

**IMPACTO:** em host de container (Railway/Render, previstos no relatório de piloto), arquivos somem a cada redeploy/restart e não são compartilhados entre réplicas. Isso é perda de documentos de clientes.

**CORREÇÃO SUGERIDA:** ligar o adaptador por configuração com fail-closed em produção (recusar subir com storage local sem volume declarado); smoke test de persistência.

**TESTE QUE DEVERIA EXISTIR:** teste de contrato rodando o mesmo suite contra os adaptadores local e Supabase; gate de produção que exige `STORAGE_PROVIDER` válido.

---

### F-06
- **SEVERIDADE:** P2 (defesa em profundidade)
- **STATUS:** CONFIRMADO (catálogo)
- **TÍTULO:** 44 tabelas de plataforma sem RLS, legíveis pelo mesmo role de runtime das requisições de agência

**EVIDÊNCIA:** consulta a `pg_class` no banco com as 94 migrations: 44 tabelas com `relrowsecurity = false` e `SELECT` concedido a `travel_app_runtime_local`. Entre elas: `platform_users` (`password_hash`, `mfa_secret`), `platform_sessions`, `billing_*`, `subscriptions`, `support_cases`, `subscriber_tenants`, `platform_referral_credits`. As três últimas têm `agency_id`. Por outro lado, **todas** as tabelas tenant têm `ENABLE` + `FORCE`, e nenhuma tabela com RLS está sem policy.

**IMPACTO:** qualquer bug de SQL em código tenant (ex.: F-03) lê credenciais e dados de plataforma de todas as agências. O isolamento hoje depende apenas de o código de plataforma nunca ser chamado a partir do caminho tenant.

**CORREÇÃO SUGERIDA:** role de banco separado para plataforma, com `REVOKE` dessas tabelas para o role de runtime tenant, ou RLS negando acesso quando existe contexto de tenant.

**TESTE QUE DEVERIA EXISTIR:** com contexto de tenant, `SELECT` em `platform_users` ⇒ permission denied.

---

### F-07
- **SEVERIDADE:** P2
- **STATUS:** CONFIRMADO
- **TÍTULO:** MFA do Platform Admin: segredo em texto puro e sem fluxo de enrollment

**EVIDÊNCIA:** `platform-local-auth.ts:194` usa `user.mfa_secret` direto em `verifyCode`, sem decrypt. Não há código que grave `platform_users.mfa_secret` (só os testes, em texto puro: `customer-platform-auth.test.ts:215`). A migration `025_platform_super_admin_authorization.sql:25` comenta *"Encrypted TOTP secret"*. O MFA de agência usa `mfa-encryption.ts` (AES-256-GCM); o de plataforma não.

**IMPACTO:** as contas mais privilegiadas têm o segredo TOTP legível no banco (combinado com F-06, legível pelo role tenant).

**CORREÇÃO SUGERIDA:** reutilizar `encryptMfaSecret`/`decryptMfaSecret` e criar um fluxo de enrollment auditado.

---

### F-08
- **SEVERIDADE:** P2
- **STATUS:** CONFIRMADO no HEAD (o WIP não commitado corrige)
- **TÍTULO:** Media Library ignora capas de Offer/Communication na contagem de uso e na proteção de delete

**EVIDÊNCIA (HEAD):** `deleteMediaAsset` e `getMediaAssetUsage` contam só `media_asset_links`. As capas de Offer/Communication ficam em `offers.cover_media_asset_id` / `agency_communications.cover_media_asset_id` com FK `ON DELETE SET NULL` (`093_offer_communication_cover_asset.sql`).

**IMPACTO:** um asset usado só como capa aparece como "Usado em: nenhum lugar", o botão Excluir aparece (`MediaLibraryPage.tsx`), e excluir remove a capa das ofertas/comunicações em silêncio. Isso viola o critério "assets usados não apagados perigosamente". Também existem **dois mecanismos de capa** (tabela de link com `usage=COVER` para Proposal e coluna FK para Offer/Communication), o que é uma inconsistência de domínio.

**TESTE QUE DEVERIA EXISTIR:** asset usado só como capa de Offer ⇒ delete 409 e usage `OFFER: 1`.

---

### F-09
- **SEVERIDADE:** P2
- **STATUS:** CONFIRMADO
- **TÍTULO:** Capa da Media Library nunca chega ao Customer App (Offer/Communication)

**EVIDÊNCIA:** `customer-portal.ts:260-262` (`OFFER_COLUMNS` do cliente) não inclui `cover_media_asset_id`. O único download de mídia para o cliente é o de Proposal (`routes/customer-portal.ts:143-169`). `apps/customer/src` não referencia `coverMediaAssetId`: o Customer App só renderiza `imageUrl`.

**DIVERGÊNCIA:** `docs/product/MEDIA_ASSET_USAGE.md` e `docs/release/MEDIA_LIBRARY_REPORT.md` marcam como ✅ o critério de o Customer App exibir Offer/Communication com o asset.

**IMPACTO:** a agência seleciona a capa pela biblioteca e o cliente não vê imagem nenhuma. O fallback `image_url` não é combinado com o asset em nenhum lugar, então as duas fontes divergem.

---

### F-10
- **SEVERIDADE:** P2
- **STATUS:** CONFIRMADO (código + reprodução)
- **TÍTULO:** Import Center não funciona via HTTP e tem fluxos inseguros de confirmação

**EVIDÊNCIA**
- `routes/import.ts:33-44` recebe `protectedHooks`, mas **nenhuma** rota o usa. Reproduzido: anônimo e autenticado ⇒ `500 "No tenant context available. Ensure Fastify tenant hook is applied."`. O header do arquivo (`:12`) afirma *"All routes require staff authentication"*.
- Prefixo `/api/import`, enquanto o frontend remove `/api` (vite `rewrite`, `vercel.json`). A UI nunca alcança essas rotas (`/import/jobs` ⇒ 404), e não há chamada a elas em `apps/agency/src`.
- `/upload` lê o arquivo multipart e o **descarta**: o `storageKey` é fabricado (`:95`) e o conteúdo nunca é salvo. O `/parse` exige o conteúdo de novo no body.
- `executeImport` (`import/service.ts:261-326`): checagem de status fora da transação, `UPDATE` sem `AND status='DRY_RUN'` e sem `FOR UPDATE`. Dois confirms concorrentes importam duas vezes.
- `parsedRows` do confirm vem do **body** (`routes/import.ts:194-202`), mas a classificação do dry run é aplicada **por índice**, permitindo trocar as linhas depois da validação.
- O preview guarda só as 50 primeiras linhas (`types.ts:221`, `service.ts:194`), e `executeImport` pula linhas sem preview: imports com mais de 50 linhas são truncados sem aviso.
- XLSX e formato inválido lançam `Error` genérico, e o usuário recebe "Internal server error" em vez da mensagem pt-BR.
- `/upload` processa multipart de usuário **anônimo** (até `MAX_IMPORT_FILE_SIZE`) antes de qualquer auth.
- Zero testes cobrem o módulo.

---

### F-11
- **SEVERIDADE:** P2
- **STATUS:** CONFIRMADO
- **TÍTULO:** Cadeia de comissão de parceiro inteira executável por AGENT, furando o piso ADMIN de criação de payable

**EVIDÊNCIA:** `requireRole(UserRole.AGENT)` em `createPartner`, `createPartnerContract`, `createPartnerLink`, `generatePartnerCommission`, `approvePartnerCommission` e `createPayableFromPartnerCommission` (`partner-commissions.ts`, `partners.ts`). Criar payable pelo módulo financeiro exige `ADMIN` (`routes/financial.ts:122-123`).

**MITIGAÇÃO EXISTENTE:** o valor deriva do total da venda × taxa do contrato, com unicidade por (parceiro, venda).

**IMPACTO:** o mesmo AGENT cria o parceiro, define a taxa, atribui a venda, aprova a comissão e gera a obrigação financeira. Não há segregação de funções.

---

### F-12
- **SEVERIDADE:** P2
- **STATUS:** CONFIRMADO
- **TÍTULO:** CTA URL e image URL de Communication sem validação de esquema

**EVIDÊNCIA:** `agency-communications.ts:117-128` / `:189-192` não validam `ctaUrl`/`imageUrl`. O Customer App renderiza `<a href={comm.ctaUrl} target="_blank" rel="noopener noreferrer">` (`CustomerHomePage.tsx:223-231`). O React 19 neutraliza `javascript:`, mas `data:`, `http:` e domínios de phishing passam.

**IMPACTO:** uma conta staff comprometida (MANAGER) direciona clientes finais a páginas maliciosas com a marca da agência.

**CORREÇÃO SUGERIDA:** allowlist `https:` (e `wa.me`/`mailto:` se desejado) no servidor.

---

### F-13
- **SEVERIDADE:** P2
- **STATUS:** CONFIRMADO
- **TÍTULO:** Bundle público do Customer App embute a árvore de admin staff sem guarda de rota

**EVIDÊNCIA:** `apps/customer/src/App.tsx:127-177` monta clientes, ofertas, propostas, transporte, financeiro etc. dentro de `AppShell`, sem `RequireAuth`. `lib/api.ts:52-58` depende do proxy do Vite, que injeta headers dev só em desenvolvimento.

**IMPACTO:** não vaza dados (em produção as chamadas voltam 401), mas publica no domínio do cliente uma UI interna quebrada e a estrutura de endpoints. `docs/AI_CONTEXT.md` já registra a duplicação como decisão de produto pendente.

---

### F-14
- **SEVERIDADE:** P2
- **STATUS:** CONFIRMADO (código); exploração NECESSITA TESTE
- **TÍTULO:** Guarda de SSRF do Pescador não fixa o IP validado (DNS rebinding residual)

**EVIDÊNCIA:** `pescador.ts:124` chama `resolveAndValidateHost` e **descarta** o `ResolvedTarget`; o `fetch` (`:125`) resolve DNS de novo, sem `lookup`/dispatcher fixo. `ssrf-guard.ts:99` usa `dns.lookup` sem `all: true` (valida só o primeiro A). O comentário em `pescador.ts:112-117` afirma que o rebinding está fechado. O resto da guarda é sólido: redirects manuais revalidados, limite de 2 MiB, timeout de 8 s.

**IMPACTO:** um staff autenticado com domínio de TTL 0 pode alcançar endereços internos do host da API.

---

### F-15 a F-24 — P3

| ID | STATUS | Título | Evidência |
|---|---|---|---|
| F-15 | CONFIRMADO | MFA legado em texto puro nunca é migrado; `MFA_ENCRYPTION_KEY` não é exigida no boot de produção | `local-auth.ts:271-276`/`:746-749` só repassam o texto puro (o comentário em `mfa-encryption.ts:107-110` promete criptografar no primeiro acesso); `env.ts` não valida a chave, então o primeiro enrollment em produção falha com 500 |
| F-16 | CONFIRMADO | Engagement: `COMMUNICATION_CTA_CLICKED` nunca deduplicado; dedup de views não atômico; tracking de comunicação ignora placement/segmento | `customer-engagement.ts:120-141`, `:46-69`; `getVisibleCommunicationById` (`agency-communications.ts:345-364`). Limitado por `CUSTOMER_WRITE` = 60/min |
| F-17 | CONFIRMADO | `recordPayment` sem chave de idempotência (duplo submit gera dois pagamentos) | `financial.ts:2048-2091`. A alocação impede quitar duas vezes (`FOR UPDATE` + capacidade, `:2103-2155`) |
| F-18 | CONFIRMADO | Asset `ARCHIVED` continua vinculável; MIME confia no header do cliente, sem checar conteúdo | `media-library.ts` (HEAD) valida só a existência ao vincular; `routes/media-library.ts:95` usa `file.mimetype`. Mitigado por blocklist de extensão (`html`/`svg`) e `nosniff` do helmet |
| F-19 | CONFIRMADO | Plataforma: comparação da chave do stopgap não é em tempo constante; "not found" vira 500 | `app.ts:416-424`; `platform-routes.ts:199-201` (`throw new Error('Plan not found')`) |
| F-20 | CONFIRMADO | Triplicação de "próxima ação": `customer_interactions.next_action_at` existe no schema, mas nenhum código lê ou grava | Catálogo + `grep` sem ocorrências. Na prática, dois conceitos ativos (`commercial_opportunities.next_action_at` no cockpit e `commercial_tasks.due_at`) |
| F-21 | CONFIRMADO (latente) | Billing de plataforma em cascata: `subscriber_tenants → billing_invoices → billing_payments` | `pg_constraint` `ON DELETE CASCADE`. Não existe caminho de delete hoje |
| F-22 | CONFIRMADO | `getSupportCaseById` carrega os chamados de todos os tenants para achar um | `platform-services.ts:769-771` |
| F-23 | CONFIRMADO | `docs/AI_CONTEXT.md` desatualizado | Cita migrations `001..037` e "31 route modules"; o HEAD tem 94 migrations e mais módulos (media-library, import etc.) |
| F-24 | CONFIRMADO | Communications: datas inválidas e `displayPriority` não numérico viram 500 | `routes/agency-communications.ts:114-117` (`new Date(...)`/`Number(...)` sem checagem) |

---

## ENTREGA 3 — MATRIZ POR DOMÍNIO

| Domínio | Status | Risco | Principal achado | Teste existente? | Ação |
|---|---|---|---|---|---|
| Auth | Parcial | Crítico | F-01 dev-auth de plataforma em produção | Não (plataforma) / Sim (staff/customer) | Corrigir antes de qualquer deploy |
| RLS | Bom (tenant) | Médio | F-06 tabelas de plataforma sem RLS | Sim (`test:db`, tenant) | Separar role de plataforma |
| RBAC | Bom (staff) / Fraco (plataforma) | Alto | F-02; F-11 | Parcial | Matriz de roles da plataforma |
| Customers | Bom | Baixo | — | Sim | — |
| Commercial | Bom | Baixo | F-20 conceito morto | Parcial | Decidir o conceito canônico |
| Tasks | Bom | Baixo | F-20 | Sim | — |
| Offers | Fraco (lado cliente) | Alto | F-04 segmentação fail-open | Não (negativos) | Integrar o query builder |
| Proposals | Bom | Baixo | `SENT` segue editável (observação) | Sim (12 HTTP) | — |
| Bookings | Não aprofundado | — | — | Sim | — |
| Trips | Bom | Baixo | — | Sim | — |
| Finance | Bom | Baixo/Médio | F-11, F-17 | Sim | Segregação de funções |
| Communications | Parcial | Médio | F-12; segmentadas nunca aparecem | Parcial | Validar URL; regra de segmento |
| Media Library | Parcial | Médio | F-08, F-09 | Não no HEAD (WIP adiciona) | Commitar o WIP; entregar capa ao cliente |
| Engagement Tracking | Bom | Baixo | F-16 | Sim | — |
| Segmentation | Builder bom / integração stub | Alto | F-04 | Sim (builder) | Integrar |
| Import Center | Não funcional | Alto (latente) | F-03, F-10 | Não | Reescrever o fluxo com allowlist |
| Customer App | Bom (dados) | Médio | F-09, F-13 | Sim | Separar o staff tree |
| Platform Admin | Fraco | Crítico | F-01, F-02, F-07 | Não | Bloqueador |
| Storage | Fraco (deploy) | Alto | F-05 | Não (contrato) | Ligar o adaptador |
| Deploy/Config | Parcial | Alto | F-01, F-05; CORS/rate-limit fail-closed ✓ | Parcial | Gates de boot |

---

## ENTREGA 4 — DOCUMENTAÇÃO vs CÓDIGO

| Documentação diz | Código faz | Divergência | Risco |
|---|---|---|---|
| `CENTRAL_COMUNICACAO_AGENCIA.md:102-106`: membership do segmento computado via `filter_definition` | Todos os segmentos ativos são elegíveis (Offers); segmentadas nunca aparecem (Communications) | Feature anunciada não existe | P1 (F-04) |
| `PILOT_REMOTE_DEPLOYMENT_REPORT.md:70`: "Auth (Platform) ✅ Implementado" | Produção usa `PlatformDevAuthProvider` por padrão | Controle anunciado não protege | P0 (F-01) |
| `routes/import.ts:12`: "All routes require staff authentication" | Nenhuma rota usa `protectedHooks` | Comentário falso | P1/P2 (F-03, F-10) |
| `import/service.ts:41`: arquivo "já armazenado no Supabase Storage" | O arquivo é descartado no upload | Feature fantasma | P2 |
| `MEDIA_LIBRARY.md` / `ENV_CHECKLIST.md`: adaptador Supabase / `STORAGE_PROVIDER` | Adaptador não importado; variável não lida | Configuração sem efeito | P1 (F-05) |
| `MEDIA_ASSET_USAGE.md`, `MEDIA_LIBRARY_REPORT.md`: Customer App exibe o asset de Offer/Communication | Só Proposal tem rota de mídia para o cliente | Critério marcado como ✅ indevidamente | P2 (F-09) |
| `MEDIA_LIBRARY.md`: asset em uso não pode ser excluído | Capa de Offer/Communication não conta como uso (HEAD) | Proteção incompleta | P2 (F-08) |
| Migration 025: `mfa_secret` "Encrypted TOTP secret" | Texto puro | Controle anunciado ausente | P2 (F-07) |
| `mfa-encryption.ts:107-110`: plaintext legado criptografado no primeiro acesso | Só repassa | Migração nunca ocorre | P3 (F-15) |
| `pescador.ts:112-117`: DNS rebinding fechado | IP não é fixado | Superestimado | P2 (F-14) |
| `AI_CONTEXT.md`: migrations 001..037, 31 módulos de rota | 94 migrations, mais módulos | Mapa de IA desatualizado | P3 (F-23) |

---

## ENTREGA 5 — GAPS DE TESTE IMPORTANTES

1. Auth de plataforma em modo produção (headers dev ⇒ 401). **0 testes.**
2. RBAC por role nas rotas de escrita `/platform/*`.
3. Import Center: nenhum teste (rotas, allowlist de mapping, idempotência do confirm, mais de 50 linhas).
4. Offers do cliente: casos negativos de segmento e de `show_on_customer_app=false` por id.
5. Media Library no HEAD: nenhum teste HTTP (o WIP adiciona `media-library-http.test.ts`, não commitado). Faltam os casos de capa-só e de asset arquivado.
6. Contrato de storage: adaptador local vs Supabase e persistência entre reinícios.
7. Isolamento das tabelas de plataforma a partir de contexto tenant.
8. SSRF com rebinding / múltiplos registros A.
9. Segregação de funções na cadeia de comissão de parceiro.

---

## ENTREGA 6 — TOP 10 PRÓXIMAS AÇÕES

1. **F-01** — travar o `PlatformDevAuthProvider` em produção, injetar o provider real no `server.ts` e adicionar o teste de regressão.
2. **F-02** — matriz de roles nas rotas de escrita da plataforma, com negação por padrão.
3. **F-03** — allowlist de colunas no Import Center **antes** de qualquer tentativa de ligar as rotas (ordem obrigatória: allowlist → hook).
4. **F-05** — ligar o adaptador de storage com fail-closed de produção. Pré-requisito do piloto (documentos de clientes).
5. **F-04** — integrar `runFilterDefinition` à visibilidade de Offers e ao `getAvailableOfferById`, com testes negativos.
6. **F-06 + F-07** — separar o role de banco da plataforma e criptografar o MFA de plataforma.
7. **F-08 + F-09** — commitar o WIP de contagem de uso/delete e entregar a capa do asset ao Customer App (Offer/Communication).
8. **F-10** — refazer o fluxo do Import Center: armazenar o arquivo, confirmar com base nas linhas persistidas, usar `UPDATE ... WHERE status='DRY_RUN'`, sem teto de 50 linhas.
9. **F-12 + F-14** — allowlist de esquema de URL e IP fixo no fetch do Pescador.
10. **F-11** — segregação de funções: payable de comissão com o mesmo piso do módulo financeiro (`ADMIN`).

---

## ENTREGA 7 — VERIFICAÇÃO DE PRONTIDÃO

**PRONTO PARA DESENVOLVIMENTO CONTÍNUO? — SIM.**
Base tenant sólida e verificada (RLS `FORCE` em todas as tabelas tenant, role sem bypass, 1616 testes verdes e CI verde no HEAD). Os problemas estão concentrados e têm correção localizada.

**PRONTO PARA DEPLOY DE STAGING? — NÃO** enquanto F-01 existir, se o staging for acessível pela internet. Passa a **CONDICIONAL** com F-01 e F-02 corrigidos, ou com o staging restrito a rede privada/VPN. F-05 também precisa de volume persistente ou storage externo, senão os uploads somem entre deploys.

**PRONTO PARA PILOTO REAL? — NÃO.**
Exige F-01, F-02, F-03 (pelo menos a allowlist), F-04 (a segmentação vaza ofertas), F-05 (persistência de documentos de clientes) e F-06/F-07 (credenciais de plataforma).

---

## ENTREGA 8 — NÃO FAZER (antes de resolver os itens acima)

- **Não** ligar `protectedHooks` nas rotas de import para "fazer o Import Center funcionar" antes da allowlist (F-03). Isso ativa a SQL injection.
- **Não** fazer deploy público da API, nem de staging aberto, antes do F-01.
- **Não** iniciar o refactor de split do `app.ts`, a consolidação de `apps/customer` ↔ `apps/agency` ou a unificação de `next_action_at` antes dos P0/P1: são mudanças amplas sem redução de risco imediata.
- **Não** iniciar novas features sobre segmentação (campanhas segmentadas, WhatsApp segmentado) antes da integração real do query builder (F-04).
- **Não** expandir a Media Library (vídeo, documentos, versionamento) antes de F-08/F-09 e do storage externo (F-05).
- **Não** adicionar novos providers de auth antes de padronizar a trava de ambiente em todos os providers dev.

---

FABLE AUDIT COMPLETE

HEAD: 940a02b4ad3ca6b5547b1fbcd0e73925ddebfa53
P0: 1
P1: 4
P2: 9
P3: 10
READY FOR STAGING: NÃO (CONDICIONAL após F-01 + F-02, ou staging em rede privada)
READY FOR PILOT: NÃO
