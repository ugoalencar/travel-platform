# Desenho técnico: SEC-01, BAK-01 e DASH-01

Data: 2026-10-24. Autor: sessão Claude delegada. Estado: **somente documentação**.
Nenhum código, schema, migration, banco, `.env` ou ambiente online foi tocado.
SQL e TypeScript abaixo são **esboços não executáveis** para guiar a implementação.

Fontes lidas: `AGENTS.md`, `FULL-LITE-ALIGNMENT-PLAN.md`, `FULL-LITE-PARITY-AUDIT-2026-10-23.md`,
ADR-008, `ACCESS-CONTROL.md` (Lite), `ADR-LITE-BACKUP-001`, `BACKUP-OPERACIONAL.md`,
`docs/08-devops/backup-and-recovery.md`, `docs/BACKUP-RESTORE-RUNBOOK.md` e o código citado
em cada seção. Tudo que está marcado **[padrão adotado]** foi decidido por mim por ser a
opção mais segura e conservadora (o usuário delegou); ver lista final.

Ordem de implementação (plano de alinhamento): **SEC-01 → BAK-01 → DASH-01**. BAK-01 e DASH-01
dependem de SEC-01 (nomes de capacidades e regra de precedência). Full primeiro, Lite depois (DEC-007).

---

## 0. Fatos verificados que moldam os três desenhos

| Fato | Evidência |
|---|---|
| Full: hierarquia fixa `OWNER 100 > ADMIN 80 > MANAGER 60 > AGENT 40 > VIEWER 20`; `requireRole(min)` compara ranks | `packages/domain/tenant-context.ts:388-401` |
| Full: papel e status do usuário são relidos do banco a cada requisição (sessão só guarda `user_id`) | `services/api/src/local-auth.ts:463-470` |
| Full: `permission_restrictions` só **retira** permissão por papel (`MANAGER/AGENT/VIEWER`), chave livre `(resource, action)`; OWNER/ADMIN nunca restringíveis (CHECK no banco + validação); auditoria `PERMISSION_RESTRICTION_*` | `services/api/src/permission-restrictions.ts:49-53,73-121,178-199`; migration `051_invitations_permission_restrictions.sql:97-129` |
| Full: `assertNotRestricted` só é chamado em 4 pontos (`customers:read`, `financial:view`, `employees:view`, `air-services:create`) | `routes/customers.ts:58`, `routes/financial.ts:232`, `routes/commissions.ts:151`, `routes/trips.ts:339` |
| Full: já existe concessão individual **restrita**: `agent_area_grants` (12 módulos, só leitura, só para AGENT, piso `requireRole(AGENT)`, mutações nunca concedidas) | `services/api/src/area-grants.ts:17-30,105-135`; rotas `routes/settings.ts:69-76`; uso em `routes/financial.ts:18` |
| Full: rotas de restrição em `/settings/permission-restrictions` (ADMIN+) | `routes/settings-expanded.ts:276-305` |
| Full: auditoria por `recordAuditEvent` (savepoint; falha de auditoria é engolida a menos que `required: true`); `audit_logs` só SELECT/INSERT | `services/api/src/audit-log.ts:257-275`; `015_audit_logging.sql:52-55` |
| Full: MFA TOTP existe (`mfa_totp_secrets`, `mfa_recovery_codes`, `mfa-provider.ts`, `mfa-encryption.ts`) | `services/api/src/local-auth.ts:9-13,41-43` |
| Full: dashboard é componente com painéis fixos que chama `/commercial/dashboard` (piso VIEWER) e outros; `/financial/dashboard` exige MANAGER; **não há configuração persistida** | `apps/agency/src/pages/DashboardPage.tsx`; `apps/agency/src/lib/api.ts:122`; `route-inventory.ts:875,1197` |
| Full: backup só de infraestrutura (banco inteiro): `infrastructure/ops/backup_production.sh`, runbook; dumps locais **sem cifra**; recuperação por tenant "não implementada"; **sem endpoint/painel por agência** | `docs/BACKUP-RESTORE-RUNBOOK.md:200-217,340-352`; auditoria §6 |
| Lite: permissões efetivas = catálogo (se `grants_all`) ou `role_permissions − REVOKE + GRANT`, calculadas por requisição | `services/api-lite/src/access.ts:124-146` |
| Lite: `user_permissions` tem PK `(tenant_id, user_id, permission)`, logo **GRANT e REVOKE não coexistem** para a mesma permissão | `migrations-travel-lite/004_access_control_dashboard.sql:~130-140` |
| Lite: `PUT /users/:id/permissions` exige `permissions.manage` (master_only), proíbe alterar a si mesmo, exige que o ator **possua** a permissão alterada, `master_only` só por MASTER, audita `USER_PERMISSIONS_CHANGED` | `services/api-lite/src/routes/users.ts:396-455` |
| Lite: backup exige `users.manage` **e** `grantsAll`, reautentica por senha, cifra com AES-256-GCM + scrypt (N=16384, r=8, p=1), AAD com o tenant, limite 2 MiB, rate limit em memória, auditoria `BACKUP_EXPORTED` que falha fechada; **sem restauração** | `routes/backup.ts:13-81`; `tenant-backup.ts:1-51`; teste `tests/backup.test.ts:54-59` |
| Lite: `BACKUP_TABLES` tem **28** tabelas; documentação (`ADR-LITE-BACKUP-001`, `BACKUP-OPERACIONAL.md`) diz **25** — divergência documental | `tenant-backup.ts:6-12` |
| Lite: dashboard persiste só `widgets` (ordem + enabled) por tenant; definições no código; cada widget é calculado no escopo de quem vê; `dashboard.configure` é `master_only` | `routes/dashboard.ts:22-47,298-330`; migration 004 |

Observação de risco já existente: a lacuna de `assertNotRestricted` (só 4 rotas) significa que
"restrição" hoje **não é uma garantia geral** no Full. SEC-01 não deve vender mais do que isso.

---

# PARTE 1: SEC-01, permissões individuais por usuário

## 1.1 Requisito

Permitir que um administrador de agência ajuste, **por usuário**, o que o papel base permite, com
(a) retirada individual (restrição) e (b) concessão individual **delegada e limitada**, sem
substituir a hierarquia base por um GRANT irrestrito, sem enfraquecer RBAC/RLS, e com precedência
clara **restrição > concessão > papel**. Fecha também a pergunta Q4 do ADR-008 (nomes das permissões).

## 1.2 Comportamento atual verificado

Ver tabela da seção 0. Resumo: o Full só estreita por **papel** (não por usuário) e já tem uma
concessão individual estreita (`agent_area_grants`); o Lite tem GRANT/REVOKE por usuário com
limites de delegação, mas sem restrição por papel e com permissões "_all/_own" que não existem no Full.

## 1.3 Lacuna

**Full:** (1) sem restrição por usuário; (2) sem concessão individual além dos 12 módulos de leitura;
(3) `assertNotRestricted` não é aplicado de forma geral nem validada contra um catálogo (um typo
cria restrição inerte silenciosa); (4) dois mecanismos paralelos (`agent_area_grants` e
`permission_restrictions`) sem resolvedor único.
**Lite:** (1) sem restrição por papel; (2) catálogo de 33 chaves diferente do vocabulário do Full
(`users.manage`, `finance.read` vs `resource:action`); (3) escopo `_own` por vendedor sem equivalente
no Full; (4) a precedência é implícita no SQL (GRANT é avaliado por `OR`, por isso só a PK
impede conflito). Documentar a precedência e testar.

## 1.4 Desenho

### 1.4.1 Modelo de decisão (única função, falha fechada)

Vocabulário: manter a tupla `(resource, action)` já usada por `permission_restrictions`
(compatibilidade), agora **validada contra um catálogo em código** (`permission-catalog.ts`).

```text
decide(actor, key, minRoleFloor):
  1. actor.role in {OWNER, ADMIN}            -> ALLOW   (nunca restringível; sem lockout)
  2. restrição de papel (permission_restrictions) existe  -> DENY    ┐ restrição
  3. override do usuário = REVOKE                         -> DENY    ┘ vence tudo
  4. role >= minRoleFloor (base)                          -> ALLOW   papel
  5. override do usuário = GRANT e key.delegable
       e role do usuário em key.grantableToRoles          -> ALLOW   concessão (só chega aqui
                                                                        se o papel NÃO bastava)
  6. caso contrário                                       -> DENY
  qualquer erro de leitura / chave fora do catálogo       -> DENY (lança 403/500, nunca allow)
```

Precedência efetiva: **restrição (2,3) > concessão (5) > papel (4)**. A concessão só "enche" o que o
papel não dá; nunca remove uma restrição. REVOKE do usuário e restrição por papel são ambos
"restrição" (o mais restritivo prevalece). OWNER e ADMIN: overrides e restrições rejeitados na
criação (validação + CHECK), preservando a regra anti-lockout atual.

### 1.4.2 Catálogo e limite de delegação (o que impede "GRANT irrestrito")

`services/api/src/permission-catalog.ts` (novo): cada entrada declara

```ts
// esboço
{ resource: 'financial', action: 'view', minRole: 'MANAGER',
  delegable: true,                // pode ser concedida individualmente
  grantableToRoles: ['AGENT'],    // piso: AGENT, nunca VIEWER nem MANAGER+ (já tem)
  mutation: false }               // concessão de mutação exige delegableMutation: true
```

Regras do catálogo **[padrão adotado]**:
- Só `delegable: true` aceita GRANT. Estado inicial: apenas **leitura** (os 12 módulos de
  `AREA_GRANT_VALUES`, mapeados como `(financial, receivables.read)` etc.), exatamente o que
  `agent_area_grants` já permite, sem ampliar.
- **Nunca delegáveis** (lista fechada no código, com teste): gestão de usuários/convites,
  gestão de permissões e restrições, backup/restauração, configuração de dashboard,
  segurança/MFA/sessões, plataforma/billing, exclusão definitiva, `catalog.manage` e
  `customers.fields_manage` em v1 (ver 1.4.7).
- Concessão de **mutação** só com `delegableMutation: true` explícito no catálogo e decisão humana
  por entrada; nenhuma no v1.
- Alvo do GRANT: papel `AGENT` apenas. Alvo do REVOKE: `MANAGER`, `AGENT`, `VIEWER`.

### 1.4.3 Quem pode alterar (anti-escalada)

Espelhar e endurecer as regras do Lite (`users.ts:396-455`):
- Ator: `OWNER` ou `ADMIN` (`requireRole(ADMIN)`), nunca o próprio usuário-alvo; `ADMIN` não altera
  `OWNER` nem outro `ADMIN`; só `OWNER` altera `ADMIN` (que não tem override mesmo assim: rejeitado).
- O ator só concede o que **ele próprio decide ALLOW** hoje (nunca concede o que não tem).
- Alvo precisa existir **no mesmo `agency_id`** e estar `ACTIVE` (senão 404, sem vazar existência).
- Substituição atômica do conjunto (padrão do Lite e de `setAreaGrants`): `DELETE` + `INSERT` na
  mesma transação, com `SELECT ... FOR UPDATE` do usuário-alvo para serializar edições concorrentes.
- `agencyId` e `actor` vêm só do contexto de autenticação; corpo com `agencyId`/`userId` do alvo
  diferente do path ou campos extras → 400.

### 1.4.4 Dados (esboço de migration, **não executar**)

Migration proposta `NNN_user_permission_overrides.sql` (número = próximo livre após `101`; as
migrations aplicadas são imutáveis):

```sql
-- ESBOÇO
CREATE TABLE user_permission_overrides (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('GRANT','REVOKE')),   -- 'REVOKE' = vocabulário do Lite
  reason TEXT,                                                  -- obrigatório na API para REVOKE/GRANT
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (agency_id, user_id) REFERENCES users (agency_id, id) ON DELETE CASCADE,
  UNIQUE (agency_id, user_id, resource, action)                 -- GRANT e REVOKE não coexistem
);
-- RLS: ENABLE + FORCE; SELECT/INSERT/DELETE USING/WITH CHECK (agency_id = current_agency_id()),
-- idêntico a permission_restrictions; REVOKE ALL FROM PUBLIC; GRANT mínimo ao role de runtime.
-- Sem política de UPDATE: alteração = DELETE + INSERT (trilha de auditoria).
-- CHECK extra de defesa: papel do usuário não pode ser OWNER/ADMIN (trigger de validação, pois o
-- papel está em users; a validação de aplicação é a primeira linha, o trigger é a segunda).
```

`agent_area_grants` **permanece** e continua válida: o resolvedor lê as duas fontes (adaptador),
sem migrar dados nem remover a tabela agora (Code Reduction Policy: reusar a abstração existente;
convergência para uma só tabela fica para um passo posterior com decisão registrada).
`permission_restrictions` permanece; passa a ser validada contra o catálogo **somente para novas
criações** (linhas antigas ficam; relatório de linhas "órfãs" no resolvedor, sem apagá-las).

### 1.4.5 Contratos de API (Fastify, `protectedHooks`)

| Método e rota | Piso | Corpo / resposta |
|---|---|---|
| `GET /settings/permission-catalog` | ADMIN | lista `{resource, action, minRole, delegable, grantableToRoles, mutation}` |
| `GET /settings/team/:id/permission-overrides` | ADMIN | `{ overrides: [{resource, action, effect, reason, createdAt, createdBy}] }` |
| `PUT /settings/team/:id/permission-overrides` | ADMIN | `{ overrides: [{resource, action, effect, reason}] }` (conjunto completo) → conjunto salvo; 422 chave fora do catálogo / GRANT em chave não delegável / papel-alvo inválido; 403 anti-escalada; 404 alvo em outra agência |
| `GET /settings/my-permissions` | autenticado | permissões efetivas do próprio usuário (para a UI esconder itens; **a UI nunca é a barreira**) |

`PUT` com `overrides: []` limpa tudo. `reason` obrigatório (1..300 chars). Resposta de erro sem
detalhar chaves de outro tenant. Registrar as rotas no `route-inventory.ts`.

### 1.4.6 Enforcement nos pontos de rota

Novo `requireCapability(database, key, minRole)` em `services/api/src/permissions/` que implementa
a função de 1.4.1 e **substitui** `requireRoleOrAreaGrant` (que passa a delegar a ele; mesma
assinatura para não quebrar chamadores) e a combinação manual `requireRole` + `assertNotRestricted`.
Migração gradual por rota (cada rota troca sem mudar o piso base). Rotas que hoje só chamam
`requireRole` continuam como estão até serem inventariadas; **inventário obrigatório na etapa S0**
(lista de rotas × chave do catálogo). Rota não inventariada → comportamento atual (piso do papel),
nunca "aberta por padrão".

Leitura do override: uma consulta por requisição (`SELECT effect ... WHERE agency_id=$1 AND
user_id=$2 AND resource=$3 AND action=$4`), dentro da transação tenant com RLS. **Sem cache entre
requisições** (a revogação vale na próxima requisição, como já ocorre com o papel).

### 1.4.7 Q4 do ADR-008 (permissões de campos e catálogo)

**[padrão adotado]** Criar chaves próprias, não reutilizar `settings.manage` (que no Lite é de ADMIN
e MANAGER e é largo demais): `customers.fields_manage` e `catalog.manage` no Lite;
`(customers, fields_manage)` e `(catalog, manage)` no Full, ambos com piso **ADMIN** e
**não delegáveis em v1**, de acordo com a decisão já registrada de que a configuração de
categorias/campos é só de administrador. Leitura continua sem exigir essas chaves. A decisão final
de Q4 permanece da sessão da Onda B; este desenho só fixa o contrato compatível.

## 1.5 Auditoria

Eventos novos em `AuditEventType`, gravados com `required: true` (falha de auditoria derruba a
alteração, fechando por falha):
`USER_PERMISSION_OVERRIDES_CHANGED` (metadata: alvo, `before`/`after` como lista `resource:action:effect`,
motivo), `PERMISSION_DENIED_BY_RESTRICTION` (opcional, só amostrado, para investigação; sem dados
pessoais). Nunca registrar segredos. Evento por alteração real (sem evento se o conjunto é igual).

## 1.6 Isolamento por tenant e RLS

Tabela com `agency_id`, RLS forçada, FK composta `(agency_id, user_id)`. O resolvedor só consulta com
`withTenantTransaction`. Teste de isolamento: ator da agência A não lê, não cria e não apaga override
da agência B nem com `id` conhecido. RLS é defesa adicional; a autorização de servidor (1.4.3) é a barreira primária.

## 1.7 Compatibilidade e migração Lite → Full

- Papéis: `MASTER→OWNER`, `ADMIN→ADMIN`, `MANAGER→MANAGER`, `SELLER→AGENT`, `VIEWER→VIEWER`.
- `REVOKE` e `GRANT` mantêm o nome. O resultado efetivo do Lite (`role − REVOKE + GRANT`) equivale a
  1.4.1 desde que não haja restrição por papel (o Lite não tem), logo a conversão é 1:1 para chaves com
  contraparte no Full.
- Overrides do Lite **sem contraparte** no Full (ex.: `*_own` por vendedor, `commissions.pay`,
  `sale_costs.*`) **não são migrados silenciosamente nem ampliados**: o executor de migração gera
  relatório "override não mapeado" para decisão humana (alinhado a `MIGRACAO-LITE-PARA-FULL.md`).
- GRANT migrado para chave não delegável no Full é **rejeitado** e listado; nunca vira permissão mais larga.
- Tabela de mapeamento Lite↔Full fica em `permission-catalog.ts` como campo `liteKey` (fonte única).

## 1.8 Testes Vitest por etapa

**S0, inventário e catálogo (puros):**
- `permission-catalog.test.ts`: toda chave tem `minRole` válido; lista de não-delegáveis inclui users/permissions/backup/dashboard/segurança; nenhuma chave `delegable` é `mutation` no v1; `grantableToRoles` ⊆ `{AGENT}`.
- Teste de completude: toda rota com `assertNotRestricted`/`requireRoleOrAreaGrant` hoje possui chave no catálogo.

**S1, resolvedor (puros, banco simulado):**
- Tabela de verdade 1.4.1: papel basta → ALLOW; papel insuficiente + GRANT delegável → ALLOW; GRANT em chave não delegável → DENY; papel insuficiente sem override → DENY.
- **Negação/precedência:** GRANT + restrição por papel → DENY; REVOKE com papel suficiente → DENY; REVOKE com GRANT impossível (UNIQUE) → 409; OWNER/ADMIN com REVOKE → rejeitado; restrição não bloqueia OWNER/ADMIN.
- Falha fechada: erro ao consultar override → DENY; chave desconhecida → DENY; `agency_id` ausente no contexto → erro, nunca allow.

**S2, API (HTTP mockado, Fastify `inject`):**
- Sem token 401; AGENT/MANAGER/VIEWER → 403 em PUT/GET de overrides; ADMIN ok; ADMIN em OWNER → 403; auto-alteração → 403; alvo de outra agência → 404; chave fora do catálogo → 422; GRANT para VIEWER ou MANAGER → 422; `agencyId` no corpo → 400; `reason` ausente → 422.
- Auditoria obrigatória: falha ao gravar evento → alteração revertida (nenhuma linha persistida).
- Escalada por GRANT: AGENT com GRANT de `financial.view` continua **403 em qualquer mutação financeira**; AGENT com GRANT não acessa `/settings/*`.

**S3, banco/RLS (somente com autorização e banco descartável, `npm run test:db`):**
- Isolamento cruzado A/B; INSERT com `agency_id` alheio falha por RLS; UPDATE não existe; DELETE de linha alheia afeta 0 linhas; trigger/CHECK impede override de OWNER/ADMIN; `ON DELETE CASCADE` remove overrides ao remover o usuário.
- Concorrência: duas edições simultâneas do mesmo usuário serializam (estado final = uma das duas, nunca mistura).

**S4, Lite:**
- Atualizar `access.test.ts` para fixar a precedência (documentada): GRANT/REVOKE para a mesma chave não coexistem (PK); `master_only` só por MASTER; ator sem a chave não concede; auto-alteração 403.
- Teste de espelhamento: `PERMISSIONS` ⇔ tabela `permissions` (já existe) inclui `customers.fields_manage` e `catalog.manage`.
- Mapeamento: cada `liteKey` do catálogo Full existe em `PERMISSIONS` do Lite ou é marcado `liteKey: null` explicitamente.

## 1.9 Arquivos a tocar

Full (novos): `services/api/src/permission-catalog.ts`, `services/api/src/permissions/resolver.ts`,
`services/api/src/user-permission-overrides.ts`, migration `NNN_user_permission_overrides.sql`,
testes `services/api/tests/permission-catalog.test.ts`, `permission-resolver.test.ts`,
`user-permission-overrides-http.test.ts` e DB-gated. Full (editar): `permission-restrictions.ts`
(validar contra catálogo em novas criações), `area-grants.ts` (delegar ao resolvedor),
`routes/settings.ts`/`settings-expanded.ts` (novas rotas), `audit-log.ts` (eventos),
`route-inventory.ts`, `apps/agency` (tela "Permissões do usuário" em Equipe, depois da API).
Lite (depois do Full validado): `access.ts` (chaves novas; comentário/teste da precedência),
migration Lite para as novas chaves, `ACCESS-CONTROL.md`.
Docs: ADR novo "Permissões individuais no Full" (mudança arquitetural: obrigatório), `docs/03-security/`.

## 1.10 Riscos

| Risco | Mitigação |
|---|---|
| GRANT virar escalada de privilégio | Catálogo fechado, só leitura em v1, alvo AGENT, ator precisa ter, auditoria obrigatória |
| Restrição achar que cobre tudo (hoje só 4 rotas) | Inventário S0 e documentação honesta; sem chave inventariada o piso do papel manda |
| Dois mecanismos (`agent_area_grants` + overrides) divergirem | Resolvedor único lendo as duas fontes; teste de equivalência |
| Lite e Full com vocabulários diferentes | Campo `liteKey` único; não mapeado = relatório, nunca ampliação |
| Cache obsoleto após revogação | Sem cache entre requisições |

---

# PARTE 2: BAK-01, backup operacional por agência no Full

## 2.1 Requisito

Painel e endpoints no Full para **exportar** os dados operacionais da própria agência (tenant), com
**reautenticação**, **criptografia** e **recuperação comprovada** por teste. Restauração controlada e
auditada. Backup diário/agendado e destino externo **não** fazem parte (continuam não configurados;
não declarar pronto).

## 2.2 Comportamento atual verificado

Full: nenhum endpoint por agência; só rotina de infraestrutura de banco inteiro
(`infrastructure/ops/backup_production.sh`), dump local não cifrado
(`BACKUP-RESTORE-RUNBOOK.md:202-211`), recuperação por tenant "não implementada" (`:347-352`).
Lite (reutilizável): `captureOperationalSnapshot` em uma única instrução SQL (um snapshot MVCC),
limite de tamanho, AES-256-GCM com AAD ligado ao tenant, scrypt, reautenticação por senha, rate
limit, auditoria que falha fechada e histórico em `audit_logs`. Sem restauração.

## 2.3 Lacuna

**Full:** tudo (rota, painel, manifesto de tabelas, cifra, reautenticação, restauração, teste de
recuperação). Há MFA no Full que o Lite não tem: a reautenticação deve exigi-lo quando inscrito.
**Lite:** (1) sem restauração, nem verificação (dry-run); (2) doc diz 25 tabelas, código tem 28;
(3) rate limit só em memória (não distribui entre instâncias); (4) sem hash de integridade por tabela;
(5) KDF no mínimo recomendado; (6) sem teste de completude do manifesto.

## 2.4 Desenho

### 2.4.1 Acesso (depende de SEC-01)

Exportar: **somente `OWNER`** (`requireExactRole(OWNER)`), chave `(backup, export)` **não delegável**
no catálogo SEC-01. Verificar e restaurar: nunca por usuário de agência (ver 2.4.6). Equivalente Lite:
`users.manage` + `grantsAll` (já existe).

### 2.4.2 Reautenticação (step-up)

Uma requisição, três fatores de controle **[padrão adotado]**:
`POST /settings/backup/export` com `{ currentPassword, archivePassword, mfaCode? }`.
- Senha atual verificada por `verifyPassword` (`password-hashing.ts`); se o usuário tem MFA inscrito,
  `mfaCode` (TOTP ou recovery code) é **obrigatório** e verificado por `mfa-provider`.
- `archivePassword` ≥ 12 chars, diferente da senha de acesso, nunca persistida nem logada;
  comparação de igualdade só em memória.
- Rate limit por `userId` + IP; falha incrementa contador e gera `BACKUP_EXPORT_DENIED` auditado.
  Como o limitador atual é em memória, o Full deve usar o armazenamento já existente de
  `rate-limit.ts` do Full e **documentar** que múltiplas instâncias exigem contador compartilhado.
- Corpo com qualquer campo extra (inclusive `agencyId`) → 400. Agência vem **só** do contexto.
- Resposta `cache-control: no-store`.

### 2.4.3 O que é exportado

**Manifesto explícito** `BACKUP_TABLE_MANIFEST` em `services/api/src/tenant-backup.ts`:
por tabela, `table`, `columns` (lista **permitida**, não "todas menos X"), `restoreOrder` (topológico
por FK) e `restorePolicy` (`insert` | `skip`). Regras:
- Incluir somente tabelas com `agency_id` de **dados operacionais** (clientes, vendas, financeiro,
  comissões, catálogo, cadastros, importações, documentos *metadados*). O inventário das ~184
  tabelas é a **etapa B0** (não foi feito aqui por escopo; ver 2.8).
- **Sempre excluídas** (lista no código, com teste): `users.password_hash`, `auth_sessions`,
  `customer_sessions`, `password_reset_tokens`, `*_reset_tokens`, `mfa_totp_secrets`,
  `mfa_recovery_codes`, `mfa_requirements`, `mfa_totp_attempts`, tokens/hashes de convite,
  segredos e credenciais de conectores/webhooks, chaves de API, `billing_webhook_*`, qualquer coluna
  com `secret|token|password|credential|api_key` no nome, e `audit_logs` (imutável; não é
  restaurado, apenas o evento de backup é registrado).
- Arquivos binários de storage (documentos, fotos) **não** vão no arquivo: só metadados/chaves.
  Limitação a documentar (restaurar metadados sem os arquivos deixa referências sem objeto).
- **Teste de completude** (DB-gated): toda tabela com coluna `agency_id` precisa estar no manifesto
  ou numa lista `EXCLUDED_WITH_REASON`. Nova tabela sem decisão → o teste falha (evita backup que
  silenciosamente "esquece" uma tabela, que é o risco real hoje no Lite).
- Dados pessoais (CPF, documentos) vão no arquivo **cifrado**; é backup completo, não mascarado.

### 2.4.4 Formato e criptografia

Formato `travel-platform-tenant-operations-v1`:

```jsonc
// ESBOÇO do envelope cifrado
{ "format": "travel-platform-encrypted-v1", "agencyId": "…", "algorithm": "aes-256-gcm",
  "kdf": "scrypt", "kdfParams": { "N": 131072, "r": 8, "p": 1 },   // padrão adotado: mais forte que o Lite
  "salt": "b64", "iv": "b64", "tag": "b64", "data": "b64" }
// plaintext (antes de cifrar): { format, agencyId, createdAt, schemaVersion, manifest:
//   [{ table, rows, sha256 }], tables: { <table>: [...] } }
```

- AAD = `travel-platform-backup-v1:<agencyId>` (liga o arquivo ao tenant; um arquivo de A não abre/valida para B).
- `schemaVersion` = maior migration aplicada (`schema_migrations`); restauração recusa versão incompatível.
- `sha256` por tabela (do JSON canônico ordenado) para detectar corrupção/truncamento depois de decifrar.
- IV aleatório de 12 bytes por arquivo; chave derivada em memória e zerada após o uso (como o Lite).
- Leitor aceita `kdfParams` do arquivo (compatível com parâmetros futuros); **não** aceita formato Lite.

### 2.4.5 Consistência, tamanho e entrega

- Leitura em **uma transação** `READ ONLY` isolamento `REPEATABLE READ` via `withTenantTransaction`
  (RLS é o isolamento por tenant; o filtro `agency_id` explícito é a segunda camada).
  `SET LOCAL statement_timeout` (padrão 30 s).
- Limite de tamanho **[padrão adotado]** 25 MiB de JSON de origem; acima → 413 `BACKUP_TOO_LARGE`
  ("solicite cópia assistida"). Não implementar streaming/jobs no v1; registrar como evolução.
- Entrega: o arquivo cifrado vai na resposta; **nada é gravado em disco do servidor** nem em storage;
  o histórico é só a auditoria `BACKUP_EXPORTED` (arquivo, linhas, tabelas, hash do manifesto; sem
  senha). `GET /settings/backup/status` lista os últimos 20 eventos e informa
  `automatic: { configured: false }`. O histórico prova geração, não guarda do arquivo.
- Falha ao gravar a auditoria (`required: true`) → **nenhum arquivo é devolvido** (falha fechada, como o Lite).

### 2.4.6 Restauração controlada e auditada

**[padrão adotado]** Não existe restauração self-service no v1. Há dois degraus:

1. **Verificação (dry-run) pelo próprio OWNER**: `POST /settings/backup/verify` com o arquivo +
   `archivePassword` + reautenticação. Decifra em memória, valida formato, `agencyId == contexto`,
   `schemaVersion`, hashes do manifesto, e devolve **relatório de diferenças** (linhas a inserir,
   conflitos por chave, tabelas ausentes). **Não escreve nada.** Gera `BACKUP_VERIFIED` e um
   `reportHash` (prova do relatório).
2. **Restauração por procedimento assistido do operador de plataforma** (script em
   `infrastructure/ops/`, conexão administrativa fora do app), exigindo: ticket/justificativa, o
   `reportHash` do dry-run, **cópia prévia atual do tenant** feita imediatamente antes, **segundo
   aprovador** (par humano), janela de manutenção e transação única atômica. Modo padrão
   **"restaurar em tenant vazio ou banco descartável"**; "sobrescrever tenant existente" fica
   desabilitado até aprovação humana específica. Ordem por `restoreOrder`, constraints verificadas ao
   final, contagem e `sha256` por tabela comparados com o manifesto antes do `COMMIT`; qualquer
   divergência → `ROLLBACK`. Eventos na trilha de plataforma (`platform_audit_logs`, migration 034):
   `RESTORE_REQUESTED`, `RESTORE_APPROVED`, `RESTORE_EXECUTED`, `RESTORE_FAILED`, sem segredos.

Restaurar um arquivo do **Lite** no Full é proibido (formato e chave `tenant_id` ≠ `agency_id`);
a ida do Lite para o Full segue `MIGRACAO-LITE-PARA-FULL.md`, não o backup.

### 2.4.7 Recuperação comprovada (critério de aceite)

Não declarar BAK-01 pronto sem: (a) teste automatizado de ida e volta; (b) um **ensaio registrado**
em banco novo descartável autorizado (data, operador, `schemaVersion`, contagens, hashes, resultado)
anexado em `docs/08-devops/`. O ensaio do demo do Lite não vale como prova do Full.

## 2.5 Auditoria

`BACKUP_EXPORTED`, `BACKUP_EXPORT_DENIED` (motivo genérico: senha/MFA/limite), `BACKUP_VERIFIED`,
e na plataforma `RESTORE_*`. Metadados: arquivo, contagens, hash do manifesto, `userId`, IP truncado.
Nunca: senhas, conteúdo, chave, salt/iv completos.

## 2.6 Compatibilidade e migração futura Lite → Full

Backup é **recuperação da mesma agência no mesmo produto**, não migração. O Lite pode mais tarde adotar
o formato novo (leitura retrocompatível com `travel-lite-encrypted-v1`). Documentar no Lite a
correção 25→28 tabelas já agora (sem código) como pendência do Lite.

## 2.7 Testes Vitest por etapa

**B1, núcleo puro (sem banco):**
- Cifra: ida e volta ok; senha errada → falha; `tag` adulterado → falha; `data` truncado → falha; AAD de outra agência → falha; dois exports do mesmo conteúdo geram `iv`/`salt` diferentes; chave zerada após uso (padrão do Lite).
- Manifesto: nenhuma coluna proibida (`password|token|secret|credential|api_key`) em nenhuma entrada; tabelas sempre excluídas ausentes; `restoreOrder` respeita FKs do manifesto; hash de tabela estável (ordem canônica).
- Limite: payload acima do limite → 413 sem vazar tamanho exato além do necessário.

**B2, API (HTTP mockado):**
- 401 sem token; 403 para ADMIN/MANAGER/AGENT/VIEWER (só OWNER); senha errada → 403 + `BACKUP_EXPORT_DENIED`; MFA inscrito sem `mfaCode` → 403; `archivePassword` curta/igual → 422; campo `agencyId` no corpo → 400; rate limit → 429 com `Retry-After`; `cache-control: no-store`; falha de auditoria → sem arquivo.
- **Negação SEC-01:** AGENT com GRANT de qualquer chave financeira continua 403 em `/settings/backup/*`; chave `(backup, export)` rejeitada como GRANT no PUT de overrides (422).

**B3, banco/RLS (autorizado, descartável, `npm run test:db`):**
- Exporta só a agência da sessão (A); linhas de B ausentes; nenhuma coluna proibida no plaintext decifrado.
- **Completude do manifesto** (toda tabela com `agency_id` classificada).
- **Recuperação:** semear A e B → exportar A → `verify` (relatório sem escrita: contagens do banco inalteradas) → apagar A no banco descartável → restaurar pelo procedimento → comparar contagens e `sha256` por tabela com o manifesto; **B inalterado**; restaurar arquivo de A como se fosse de B falha (AAD/`agencyId`); versão de schema incompatível falha; arquivo corrompido falha sem escrita parcial (rollback).
- Auditoria: eventos presentes; nenhum contém senha ou conteúdo.

**B4, Lite:** adaptar o teste de completude e o hash por tabela; manter `backup.test.ts`; corrigir a documentação das 28 tabelas.

## 2.8 Arquivos a tocar

Full (novos): `services/api/src/tenant-backup.ts`, `services/api/src/routes/backup.ts` (registrar em
`app.ts` apenas na consolidação), `infrastructure/ops/restore_tenant.sh` (+ doc), testes em
`services/api/tests/tenant-backup*.test.ts`, `apps/agency/src/pages/settings/BackupSection.tsx` (UI
depois da API), ADR novo "Backup operacional por agência no Full", ensaio em `docs/08-devops/`.
Full (editar): `audit-log.ts` (eventos), `route-inventory.ts`, `permission-catalog.ts` (SEC-01: `backup` não delegável).
Lite (depois): `tenant-backup.ts` (hash/manifesto/KDF por versão), `docs/travel-lite/BACKUP-OPERACIONAL.md`, `ADR-LITE-BACKUP-001` (25→28).
**Etapa B0 (antes de codar):** inventário das tabelas `agency_id` do Full e classificação
(incluir/excluir/por quê), revisado pelo Codex.

## 2.9 Riscos

| Risco | Mitigação |
|---|---|
| Manifesto esquecer tabela e dar falsa segurança | Teste de completude obrigatório; classificação explícita |
| Arquivo com PII vazar | Cifra obrigatória, senha própria, `no-store`, sem persistência no servidor, MFA |
| Perda da `archivePassword` | Aviso na UI; sem recuperação (igual ao Lite) |
| Restauração sobrescrever dado recente | Dry-run, cópia prévia, tenant vazio por padrão, segundo aprovador |
| Limitador em memória multi-instância | Contador compartilhado ou documentado; falha fechada em dúvida |
| Binários de storage fora do arquivo | Limitação documentada; backup de storage é outro item |
| Prometer backup diário | Texto da UI e docs mantêm "não configurado" |

---

# PARTE 3: DASH-01, dashboard configurável por agência no Full

## 3.1 Requisito

Permitir que a agência escolha **quais painéis aparecem e em que ordem** no dashboard do Full, com a
configuração persistida no servidor. **A configuração jamais concede acesso a dados**: quem não pode ver
um dado hoje não passa a vê-lo por ele estar habilitado.

## 3.2 Comportamento atual verificado

Full: painéis fixos em `apps/agency/src/pages/DashboardPage.tsx`; dados de
`/commercial/dashboard` (piso VIEWER, `route-inventory.ts:875`) e outros endpoints; o dashboard
financeiro tem piso MANAGER (`:1197`); não há editor nem tabela. Lite: definições de widget em
`routes/dashboard.ts:22-47`, cada widget com `source` ∈ {sales, finance, commissions}; visibilidade
decidida por escopos do espectador (`viewerScopes`/`visible`, `:77-88`); `dashboard_settings` guarda só
`[{key, enabled}]` por tenant; `dashboard.configure` é `master_only`; `GET /dashboard` calcula no
escopo de quem vê; `PUT /dashboard/settings` exige lista completa sem repetição e audita `DASHBOARD_CONFIGURED`.

## 3.3 Lacuna

**Full:** sem catálogo de widgets em código, sem tabela de layout, sem endpoint de configuração,
sem editor. **Lite:** (1) sem controle de versão/concorrência no `PUT` (última escrita vence);
(2) sem limite explícito de tamanho do JSON além da validação de chaves; (3) layout por agência apenas
(sem preferência individual) — **mantido**, é decisão de produto, não lacuna a corrigir agora.

## 3.4 Desenho

### 3.4.1 Princípio de segurança

O layout é **apresentação**, a autorização é **dado**. Cada widget declara no código a exigência de
acesso da sua fonte (`requires`), e o servidor avalia essa exigência **a cada leitura**, com o resolvedor
do SEC-01 (piso do papel + restrição + concessão), e só então executa a consulta, que por sua vez
aplica o escopo existente (`agency_id` + RLS). A configuração armazenada **não contém**: filtros,
consultas, parâmetros, permissões, escopos, ids de usuário ou qualquer campo além de `key`, `enabled`
e posição (a ordem do array).

### 3.4.2 Catálogo de widgets em código

`services/api/src/dashboard-widgets.ts` (novo): cada entrada `{ key, title, kind, requires: {resource, action, minRole}, load(client, ctx) }`
onde `load` **reutiliza as funções de consulta já existentes** (as mesmas que servem
`/commercial/dashboard` e `/financial/dashboard`); não se cria segunda via de acesso a dados.
**Etapa D0:** inventariar os painéis atuais de `DashboardPage.tsx`, mapear cada um à sua fonte e ao
piso real da rota de origem; se a fonte não tem piso definido, o widget usa o **mais restritivo** entre as
candidatas (**[padrão adotado]**, fail-closed).

### 3.4.3 Dados (esboço de migration, **não executar**)

```sql
-- ESBOÇO
CREATE TABLE dashboard_layouts (
  agency_id TEXT PRIMARY KEY REFERENCES agencies(id) ON DELETE RESTRICT,
  widgets JSONB NOT NULL CHECK (jsonb_typeof(widgets) = 'array' AND jsonb_array_length(widgets) <= 50),
  version INTEGER NOT NULL DEFAULT 1,
  updated_by_user_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (agency_id, updated_by_user_id) REFERENCES users (agency_id, id)
);
-- RLS ENABLE+FORCE; SELECT/INSERT/UPDATE com agency_id = current_agency_id(); sem DELETE
-- (restaurar padrão = grava o layout default); REVOKE ALL FROM PUBLIC.
```

Sem linha → layout padrão do código (todos os widgets habilitados, ordem padrão).

### 3.4.4 Contratos de API

| Rota | Piso | Comportamento |
|---|---|---|
| `GET /dashboard/widgets` | VIEWER | Layout efetivo **já filtrado** pelo que **este** usuário pode ver. Widgets sem permissão são **omitidos** (nem chave, nem título, nem dado, nem "bloqueado"). Cada widget visível vem com seus dados calculados no escopo do espectador. |
| `GET /settings/dashboard` | ADMIN | Layout completo da agência (todas as chaves do catálogo, `enabled`, ordem) + `version`. Mostra o catálogo inteiro **sem dados**, só metadados. |
| `PUT /settings/dashboard` | ADMIN | `{ version, widgets: [{ key, enabled }] }`. Exige todas as chaves do catálogo exatamente uma vez (como o Lite); chave desconhecida/duplicada/campo extra → 422; `version` diferente da atual → 409 (concorrência otimista); incrementa `version`; audita. |

`/commercial/dashboard` e as demais rotas existentes **não mudam**; continuam com os próprios pisos,
de modo que habilitar/desabilitar widget nunca altera o que o endpoint original entrega.
`dashboard.configure` mapeia para `(dashboard, configure)`, piso ADMIN, **não delegável** (equivalente ao
`master_only` do Lite).

### 3.4.5 Frontend (`apps/agency`)

Editor simples (ordem + liga/desliga) em Configurações; o dashboard passa a renderizar a lista vinda de
`GET /dashboard/widgets` (a UI é só renderização; a decisão de acesso nunca é do cliente). Nenhuma chave de
widget no cliente decide o que carregar sem passar pelo servidor.

## 3.5 Auditoria

`DASHBOARD_CONFIGURED` (metadata: chaves habilitadas em ordem, `version` anterior/nova, sem dados).
Gravada com `required: true`. Tentativa negada (papel insuficiente) → 403 sem evento extra.

## 3.6 Isolamento por tenant

`agency_id` do contexto; tabela com RLS forçada; widgets calculados dentro de `withTenantTransaction`.
Layout de A nunca é lido por B.

## 3.7 Compatibilidade e migração Lite → Full

`dashboard_settings.widgets` do Lite (`[{key, enabled}]`) converte para o layout do Full **por chave**
quando existe widget equivalente no catálogo do Full (campo `liteKey` no catálogo de widgets); chaves
sem equivalente são listadas no relatório de migração e descartadas do layout (não carregam dados, então
nenhum dado é perdido). Os dois modelos são só configuração, de baixo risco. O Lite mantém seu catálogo
próprio (subconjunto) e não ganha widgets que o Full não tenha (DEC-007).

## 3.8 Testes Vitest por etapa

**D1, catálogo e validação (puros):**
- `dashboard-widgets.test.ts`: toda entrada tem `requires` válido e `load` definido; chaves únicas; nenhum widget sem `requires`.
- Validação do `PUT`: lista incompleta, duplicada, chave desconhecida, campo extra (`permission`, `scope`, `filter`, `agencyId`) → 422; `version` stale → 409; mais de 50 itens → 422.

**D2, autorização (HTTP mockado):**
- **Negação central:** AGENT sem concessão com widget financeiro **habilitado** → o widget **não aparece** em `GET /dashboard/widgets` e a consulta de origem **não é executada** (espiar `load`); a resposta não contém nem a chave.
- AGENT com GRANT (SEC-01) de leitura financeira → o widget aparece com dados; revogado → some na próxima requisição; restrição por papel vence a concessão.
- VIEWER/AGENT/MANAGER em `GET/PUT /settings/dashboard` → 403; ADMIN/OWNER ok; sem token 401.
- Habilitar/desabilitar widget não altera a resposta de `/commercial/dashboard` nem de `/financial/dashboard` (mesmos dados, mesmo 403).
- Escopo: o mesmo widget retorna números diferentes conforme o espectador (quando há escopo), nunca os do administrador que configurou.

**D3, banco/RLS (autorizado, descartável):**
- Isolamento A/B no layout; `UPDATE` com `agency_id` alheio falha; `version` incrementa de forma atômica sob concorrência (duas gravações simultâneas → uma recebe 409).

**D4, Lite:** adicionar `version` ao `PUT /dashboard/settings` (compatível: campo opcional na primeira etapa) e teste de 409; manter os testes de escopo atuais.

## 3.9 Arquivos a tocar

Full (novos): `services/api/src/dashboard-widgets.ts`, `services/api/src/routes/dashboard.ts`,
migration `NNN_dashboard_layouts.sql`, testes `services/api/tests/dashboard-*.test.ts`,
`apps/agency/src/pages/DashboardSettings*.tsx`. Full (editar): `apps/agency/src/pages/DashboardPage.tsx`,
`apps/agency/src/lib/api.ts` (arquivo reservado a outra frente; coordenar via Codex),
`audit-log.ts`, `route-inventory.ts`, `permission-catalog.ts`.
Lite (depois): `routes/dashboard.ts` (`version`), `ACCESS-CONTROL.md`.

## 3.10 Riscos

| Risco | Mitigação |
|---|---|
| Configuração virar vetor de vazamento (alguém habilitar widget e ver dado) | Omissão por widget no servidor + teste de negação central; layout sem parâmetros |
| Segunda via de consulta divergir dos endpoints atuais | `load` reutiliza as funções existentes; teste de equivalência |
| Pisos desconhecidos na fonte do widget | Usa o mais restritivo; D0 documenta |
| Última escrita vence | `version` + 409 |
| Dependência de `apps/agency/src/lib/api.ts` (reservado) | Só mexer após liberação do Codex |

---

# Ordem de implementação consolidada (Full primeiro, depois Lite)

1. **SEC-01:** S0 inventário/catálogo → S1 resolvedor → S2 API + auditoria → S3 banco/RLS → UI Full → S4 Lite.
2. **BAK-01:** B0 inventário de tabelas → B1 núcleo cifra/manifesto → B2 API export/verify → B3 banco + recuperação comprovada + ensaio → UI Full → B4 Lite.
3. **DASH-01:** D0 inventário de painéis → D1 catálogo/validação → D2 API + negação → D3 banco/RLS → UI Full → D4 Lite.

Migrations só com autorização explícita. Banco de teste só descartável e novo, nunca demo, Gadotti ou online.
Cada etapa fecha com lint, typecheck, testes relevantes e build (`QUALITY-GATES.md`); revisão do Codex antes de seguir.

# Decisões adotadas por padrão

1. Vocabulário Full `(resource, action)` mantido e validado por catálogo; Lite guarda `liteKey` para mapear.
2. Precedência: **restrição (papel ou REVOKE do usuário) > GRANT > papel**; OWNER/ADMIN nunca restringíveis.
3. GRANT só para chaves `delegable` do catálogo, só leitura em v1, só para usuário `AGENT`; mutações, gestão de usuários/permissões, backup, dashboard e segurança são não delegáveis.
4. `agent_area_grants` e `permission_restrictions` permanecem; resolvedor único lê as duas fontes; unificação de tabelas fica para depois.
5. Efeito `REVOKE` (nome do Lite) em vez de `DENY`; GRANT e REVOKE não coexistem (UNIQUE).
6. Overrides do Lite sem contraparte no Full não são migrados nem ampliados: viram relatório para decisão humana.
7. `customers.fields_manage` e `catalog.manage` como chaves próprias, piso ADMIN, não delegáveis (Q4 final continua com a sessão da Onda B).
8. Sem cache de permissão entre requisições; qualquer erro ou chave desconhecida nega.
9. Backup: só OWNER, reautenticação com senha + MFA quando inscrito, KDF scrypt N=131072, limite 25 MiB, sem persistência do arquivo no servidor, `audit_logs` e segredos fora do arquivo.
10. Restauração: sem self-service; dry-run pelo OWNER e execução assistida pelo operador da plataforma com segundo aprovador, cópia prévia e tenant vazio por padrão; arquivo do Lite não restaura no Full.
11. BAK-01 só é "pronto" com teste de ida e volta **e** ensaio registrado em banco descartável; backup diário continua "não configurado".
12. Dashboard: layout por agência (não por usuário), só `key`/`enabled`/ordem, widgets sem permissão omitidos, `version` para concorrência, configurar = ADMIN+ e não delegável, fonte desconhecida usa o piso mais restritivo.

# Pendências que exigem decisão humana (não bloqueiam o desenho)

- Confirmar a lista inicial de chaves delegáveis (v1 = os 12 módulos de leitura já existentes).
- Confirmar se algum dia mutações poderão ser delegadas (hoje: não).
- Confirmar o limite de 25 MiB e se streaming/jobs entram numa fase seguinte.
- Definir quem é o "segundo aprovador" e o canal de ticket da restauração.
- Confirmar o destino e a periodicidade de um backup diário real (fora deste escopo).
