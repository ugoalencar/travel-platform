# Relatório — PX6-MIGRATION-READINESS (2026-10-01)

Prompt: `.opencode/NEXT-PROMPT-PX6-MIGRATION-READINESS.md`
Escopo: verificador de prontidão Lite → Full em `services/api-lite` —
relatório de pendências com severidades, somente leitura, sem sync remota,
sem migration de persistência.

## 1. Auditoria

Docs lidos (base das checagens): `UPGRADE-TO-FULL.md`,
`MIGRATION-MAPPING.md`, `MIGRATION-READINESS.md` (spec das 9 checagens),
`INTEGRATION-MAPPING.md` (contrato do outbox), `ACCESS-CONTROL.md`
(perfis/permissões), `docs/AI_CONTEXT.md`, `AGENTS.md`.

Schema/código auditados: `infrastructure/migrations-travel-lite/001..006`
(domínios de status, CHECKs de comissão, `paid_amount ≤ amount`, FKs
compostas tenant-safe, `roles`/`permissions` do 004, branding do 006),
`src/database.ts` (transação com GUC de tenant), `src/finance.ts`
(estorno baixa `paid_amount` direto, sem alocação própria),
`src/routes/sales.ts` (confirmação atômica: venda + parcelas + comissão),
`src/routes/commissions.ts` (aprovação cria payable), `src/access.ts`
(`requirePermission` any-of), `src/branding.ts` (`parseSlug`),
`src/validation/cpf.ts` (`isValidCpf`), fixture de testes.

Conclusões que moldam o verificador:

- Os CHECKs do banco impedem a maioria dos estados impossíveis → os
  checks de "status inválido" são defensivos (se aparecerem, é BLOCKER).
- Estorno não gera alocação → balancear `paid_amount` exige somar
  alocações **líquidas de estorno** (fórmula no módulo), senão haveria
  falso positivo em todo recebível estornado.
- `users.manage` não está em `role_permissions` → só MASTER (grants_all)
  o possui por padrão → permissão natural do endpoint, **sem criar
  permissão nova** (criação exigiria migration, proibida no prompt).
- O Lite não valida formato de e-mail na escrita → o check de e-mail usa
  regex de formato como critério de migração (não como regra do Lite).

## 2. Formato do relatório (proposto)

`GET /migration/readiness` devolve, sempre com os 9 checks:

```json
{
  "generatedAt": "2026-10-01T…:00.000Z",
  "ready": true,
  "summary": { "blockers": 0, "warnings": 1, "infos": 0 },
  "checks": [{ "id": "tenant_identity", "label": "Tenant com nome e slug válidos", "status": "OK" }],
  "findings": [{
    "id": "SELLER_LOGINS_UNLINKED", "check": "sellers_linked", "severity": "WARNING",
    "problem": "Logins de vendedor ativos sem cadastro de vendedor vinculado.",
    "entity": "sellers", "affected": 2,
    "impact": "…", "action": "…", "owner": "MASTER"
  }],
  "totals": { "users": {}, "sellers": {}, "customers": {}, "sales": {},
              "receivables": {}, "payables": {}, "payments": {},
              "commissions": {}, "outbox": {} }
}
```

- Cada item de `findings` traz **problema, entidade afetada, impacto,
  ação recomendada e quem pode corrigir** (`owner`), além de `severity`
  e `affected` (contagem).
- Severidades da spec → `BLOCKER` (impede migração), `WARNING` (permite
  com validação humana), `INFO` (sem ação obrigatória).
- `checks[].status`: `BLOCKED` / `ATTENTION` / `OK` conforme os findings
  do check. `ready = summary.blockers === 0`.
- `findings` só lista pendências (`affected > 0`); `totals` traz os
  agregados sempre. **Sem valores de linha** (e-mails, CPFs, nomes e slugs
  não aparecem — apenas contagens).

## 3. Implementação

| Arquivo | Papel |
| --- | --- |
| `services/api-lite/src/migration-readiness.ts` | Núcleo: 12 SELECTs somente leitura com `tenant_id` explícito, dentro de `withTenantTransaction`; 9 checks → findings; agrega `summary/checks/findings/totals`. |
| `services/api-lite/src/routes/migration.ts` | `GET /migration/readiness` com `requirePermission(context, 'users.manage')` (MASTER por padrão) + hooks de auth/tenant. |
| `services/api-lite/src/app.ts` | Registro do módulo (rotas com e sem prefixo `/api`). |
| `services/api-lite/tests/migration-readiness.test.ts` | 7 testes focados. |

Decisões:

- **Endpoint, não script local** — já existe alçada de auth/RLS/tenant no
  Fastify; o script local não teria a camada de autorização.
- **Sem persistência**: relatório computado sob demanda (prompt: se
  persistir, parar e propor migration → não persistimos).
- **Permissão existente** `users.manage` (só-MASTER): nova permissão
  exigiria migration de `permissions`/`role_permissions`, proibida.
- Donos por domínio: `users.manage` → `MASTER`;
  `customers/sales/finance/commissions/sellers.manage` →
  `ADMIN ou MANAGER` (donos reais dos `*_all` no matrix da ACCESS-CONTROL).

### Checks e findings

| # | Check | Finding | Sev. |
| --- | --- | --- | --- |
| 1 | `tenant_identity` | `TENANT_NAME_INVALID` (nome vazio), `TENANT_SLUG_INVALID` (fora do canônico via `parseSlug`) | BLOCKER |
| 2 | `users_email` | `USERS_INVALID_EMAIL` (regex de formato em usuários ACTIVE) | WARNING |
| 3 | `users_master` | `USERS_NO_ACTIVE_MASTER` | BLOCKER |
| 4 | `sellers_linked` | `SELLER_LOGINS_UNLINKED` (login SELLER sem `sellers.user_id`), `SELLERS_NO_COMMISSION_RULE` (UNDEFINED) | WARNING |
| 5 | `customers_cpf` | `CUSTOMERS_INVALID_CPF` (reutiliza `isValidCpf`/`normalizeCpf`) | WARNING |
| 6 | `sales_status` | `SALES_INVALID_STATUS` (defensivo), `SALES_CONFIRMED_WITHOUT_RECEIVABLES` (confirmação é atômica → ausência = inconsistência) | BLOCKER / WARNING |
| 7 | `ledger_balance` | `RECEIVABLES_PAID_MISMATCH`, `PAYABLES_PAID_MISMATCH` (`paid_amount` ≠ alocações líquidas de estorno), `PAYMENTS_WITHOUT_ALLOCATION` (não-estorno sem alocação) | BLOCKER / WARNING |
| 8 | `commissions_state` | `COMMISSIONS_INVALID_STATUS`, `COMMISSIONS_VALUE_VIOLATION` (espelha CHECKs), `COMMISSIONS_APPROVED_WITHOUT_PAYABLE`, `COMMISSIONS_ON_CANCELLED_SALE` (BLOCKER); `COMMISSIONS_PENDING_RULE` (WARNING) | BLOCKER / WARNING |
| 9 | `outbox_health` | `OUTBOX_FAILED` (`status`/`sync_status` = FAILED), `OUTBOX_PENDING` (INFO: fase sem consumidor) | BLOCKER / INFO |

Os checks defensivos de "status inválido" (3 e 8) não podem ser
provocados via SQL hoje (CHECKs do banco) — permanecem como rede de
segurança caso constraints mudem, e são verificáveis por leitura.

## 4. Testes (7 novos, `services/api-lite`)

1. Formato completo para MASTER (9 checks na ordem da spec; fixture limpa
   → `ready=true`, só `SELLER_LOGINS_UNLINKED` WARNING com `affected=2`).
2. Resposta nunca expõe valores de linha (sem `@a.test`/`not-an-email`).
3. Read-only: contagens de 7 tabelas idênticas antes/depois de 2 chamadas.
4. Autorização: 403 para MANAGER/VIEWER/SELLER, 401 anônimo.
5. Prefixo `/api/migration/readiness` funciona (registro duplo).
6. Nome/slug de tenant inválidos → 2 BLOCKERs, `ready=false`, restaura
   os valores no `finally`.
7. Provocação transversal (INSERTs via `adminPool` fora da RLS):
   e-mail inválido, CPF inválido, vendedor sem regra, CONFIRMED sem
   recebíveis, `paid_amount` dessincronizado (receivable e payable),
   pagamento orfão, comissão APPROVED sem payable, comissão ativa em
   venda cancelada, outbox FAILED + PENDING → exatamente 5 BLOCKERs,
   6 WARNINGs e 1 INFO, com statuses de check e `totals` conferidos.

Resultado: **7/7** no arquivo novo; suíte api-lite **141/141** (16 files).

## 5. Gates

```text
npx turbo run lint typecheck test build --filter=@travel-platform/api-lite
  --filter=@travel-platform/travel-lite --force   → 8/8 OK
npx tsc -p tsconfig.json --noEmit                 → ROOT-TSC-OK
```

- lint api-lite: 0 erros; travel-lite: 0 erros (4 warnings pré-existentes
  `auth.tsx`/`charts.tsx`/`ui.tsx`).
- test travel-lite: 67/67; build travel-lite OK (warning pré-existente de
  chunk > 500 kB).

## 6. Documentação

- `docs/travel-lite/product-experience/MIGRATION-READINESS.md`:
  `Status: implemented (2026-10-01)` + seção *Implementação* (endpoint,
  permissão, formato, tabela dos 9 checks→findings, regras de cálculo).

## 7. Fora de escopo / pendências

- **Sem UI** (tela em Configurações, botão "Verificar prontidão",
  exportação PDF/CSV): evolução futura prevista na spec.
- **Sem persistência/exportação automática** do relatório (por exigência
  do prompt: persistir exigiria migration → não persistimos).
- **Sem consumidor do outbox**: `OUTBOX_PENDING` é INFO nesta fase;
  `OUTBOX_FAILED` é BLOCKER mesmo assim.
- Gate plataforma: `npm run test` segue com falha estrutural pré-existente
  (57 testes de `services/api/tests/` com container hardcoded), alheio a
  este trabalho.
- Nenhum commit realizado (sem autorização).

## 8. Próximos passos sugeridos

1. Revisar/aprovar este trabalho e commitar em `main`.
2. PX7: tela em Configurações → "Verificar prontidão" (consumindo o
   endpoint) conforme a seção *Interface* da spec.
3. Endurecer o onboarding do banco de produção Lite (tenant com MASTER,
   vendedores vinculados, regras de comissão) antes de agendar upgrade —
   o endpoint acima mede exatamente isso.
