# Travel Lite — Migration Readiness

Status: implemented (2026-10-01)

## Objetivo

Definir o verificador de prontidão para upgrade Lite → Full. O verificador deve apontar pendências antes de agendar migração.

## Checagens obrigatórias

- Tenant com nome e slug válidos.
- Usuários ativos com e-mail válido.
- Pelo menos um MASTER.
- Vendedores vinculados quando necessário.
- Clientes sem CPF inválido.
- Vendas com status válido.
- Recebíveis e pagamentos balanceados.
- Comissões sem estado impossível.
- Outbox sem falhas críticas pendentes.

## Resultado esperado

Relatório por severidade:

- **Bloqueador:** impede migração.
- **Atenção:** permite migração com validação humana.
- **Informativo:** não impede.

## Ações sugeridas

Cada item deve indicar:

- problema;
- entidade afetada;
- impacto;
- ação recomendada;
- quem pode corrigir.

## Interface

Inicialmente pode ser relatório técnico/operacional. Evolução futura:

- tela em Configurações;
- botão "Verificar prontidão";
- exportação PDF/CSV.

## Critérios de aceite

- Relatório não altera dados.
- Não acessa produção/staging sem autorização.
- Pode ser rodado antes de qualquer migração.

## Implementação (2026-10-01)

Endpoint somente leitura, computado sob demanda (sem persistência e sem
migration):

- `GET /migration/readiness` (e `GET /api/migration/readiness`), de
  `services/api-lite/src/routes/migration.ts`, com
  `requirePermission(context, 'users.manage')` — MASTER por padrão.
- Núcleo em `services/api-lite/src/migration-readiness.ts`: apenas SELECTs
  com `tenant_id` explícito dentro de `withTenantTransaction`; nenhum dado
  é alterado e nenhum valor de linha (e-mail, CPF, nome) sai da função —
  só contagens.
- Testes: `services/api-lite/tests/migration-readiness.test.ts` (formato,
  isenção de e-mails na resposta, read-only, 403/401, prefixo `/api`,
  provocação de BLOCKERs/WARNINGs/INFO).

### Formato do relatório

```json
{
  "generatedAt": "ISO-8601",
  "ready": "true somente sem BLOCKER",
  "summary": { "blockers": 0, "warnings": 0, "infos": 0 },
  "checks": [{ "id": "tenant_identity", "label": "…", "status": "OK | ATTENTION | BLOCKED" }],
  "findings": [{
    "id": "USERS_NO_ACTIVE_MASTER", "check": "users_master", "severity": "BLOCKER",
    "problem": "…", "entity": "users", "affected": 1,
    "impact": "…", "action": "…", "owner": "MASTER"
  }],
  "totals": { "users": {}, "sellers": {}, "customers": {}, "sales": {},
              "receivables": {}, "payables": {}, "payments": {},
              "commissions": {}, "outbox": {} }
}
```

Os 9 checks sempre aparecem em `checks`; `findings` só traz pendências
(`affected > 0`). Severidades conforme a seção *Resultado esperado*:
`BLOCKER` (impede), `WARNING` (validação humana), `INFO` (sem ação).

### Ids de finding

| Check | Findings |
| --- | --- |
| `tenant_identity` | `TENANT_NAME_INVALID`, `TENANT_SLUG_INVALID` (BLOCKER) |
| `users_email` | `USERS_INVALID_EMAIL` (WARNING) |
| `users_master` | `USERS_NO_ACTIVE_MASTER` (BLOCKER) |
| `sellers_linked` | `SELLER_LOGINS_UNLINKED`, `SELLERS_NO_COMMISSION_RULE` (WARNING) |
| `customers_cpf` | `CUSTOMERS_INVALID_CPF` (WARNING) |
| `sales_status` | `SALES_INVALID_STATUS` (BLOCKER), `SALES_CONFIRMED_WITHOUT_RECEIVABLES` (WARNING) |
| `ledger_balance` | `RECEIVABLES_PAID_MISMATCH`, `PAYABLES_PAID_MISMATCH` (BLOCKER), `PAYMENTS_WITHOUT_ALLOCATION` (WARNING) |
| `commissions_state` | `COMMISSIONS_INVALID_STATUS`, `COMMISSIONS_VALUE_VIOLATION`, `COMMISSIONS_APPROVED_WITHOUT_PAYABLE`, `COMMISSIONS_ON_CANCELLED_SALE` (BLOCKER), `COMMISSIONS_PENDING_RULE` (WARNING) |
| `outbox_health` | `OUTBOX_FAILED` (BLOCKER), `OUTBOX_PENDING` (INFO) |

Regras de cálculo relevantes: slug canônico via `parseSlug` de
`branding.ts`; CPF via `isValidCpf`/`normalizeCpf`; e-mail por regex de
formato (o Lite não valida formato na escrita); valor pago considera
alocações líquidas de estorno (estorno baixa `paid_amount` direto, sem
alocação própria); `PENDING_RULE`/`APPROVED` sem payable ou com valor
contraditório contam como estado impossível.
