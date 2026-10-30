# Relatório — PX5 Plan Capabilities Contract (2026-10-02)

Prompt: `.opencode/NEXT-PROMPT-PX5-PLAN-CAPABILITIES-CONTRACT.md`
Escopo: base técnica de capabilities Lite/Pro/Full — contrato estático
tipado + endpoint somente leitura, sem billing e sem migration, sem
mudar autorização.

## 1. Auditoria

Docs lidos: `AGENTS.md`, `docs/AI_CONTEXT.md`,
`PLAN-CAPABILITIES.md` (matriz de 9 capabilities × 3 planos + princípios
de mensagem), `UPGRADE-TO-FULL.md`, `MIGRATION-READINESS.md`,
`ACCESS-CONTROL.md`, `INTEGRATION-MAPPING.md`.

API/código auditados: `services/api-lite/src/app.ts` (registrars de rota
com/sem prefixo `/api`), padrão de rotas (`branding.ts` mostra o uso de
`protectedHooks`), `tests/helpers/fixture.ts` (logins por perfil e por
tenant), `access.ts` (o endpoint NÃO deve chamar `requirePermission` —
informativo).

Descoberta relevante: **sessão paralela em andamento no frontend PX5**
(arquivos não rastreados/alterados em `apps/travel-lite/`:
`planCapabilities.ts`, `planUi.tsx`, `pages/PlanPage.tsx` + edits em
páginas). O stub do frontend já declara as keys (`clientes`, `vendas`,
`financeiro`, `importacao`, `dashboard`, `mobile`, `branding`,
`integracoes`, `migracao`), `PlanKey`, `PlanCell {level, label}` e diz:
"when the API exposes the tenant's plan and limits, that response
replaces CURRENT_PLAN and becomes the single source (see the PX5
report)". **O contrato da API foi alinhado a esse formato** para
substituição direta; arquivos de frontend não foram tocados.

## 2. Contrato implementado

| Arquivo | Papel |
| --- | --- |
| `services/api-lite/src/capabilities.ts` | `CAPABILITIES` (matriz estática tipada da doc), `CURRENT_PLAN: PlanKey = 'LITE'` (constante de servidor), derivação pura `capabilityStatus` / `minPlanFor` / `upgradeTargetFor`, `buildPlanCapabilities()`. |
| `services/api-lite/src/routes/plan.ts` | `GET /plan/capabilities` com `protectedHooks` (qualquer autenticado lê; anônimo 401; handler síncrono — sem DB). |
| `services/api-lite/src/app.ts` | Registro do módulo (com e sem `/api`). |
| `services/api-lite/tests/plan-capabilities.test.ts` | 8 testes focados. |

### Resposta

```json
{
  "plan": "LITE",
  "capabilities": [{
    "key": "importacao",
    "category": "Operações",
    "label": "Importação CSV/XLSX",
    "description": "Carga de planilhas com conferência antes de gravar.",
    "minPlan": "PRO",
    "status": "LIMITED",
    "upgradeTarget": "PRO",
    "reason": "No Lite a importação é limitada; o plano Pro traz a importação completa.",
    "plans": {
      "LITE": { "level": "partial", "label": "Sim, limitada" },
      "PRO": { "level": "full", "label": "Sim" },
      "FULL": { "level": "full", "label": "Sim" }
    }
  }]
}
```

Campos exigidos pelo prompt: `category` (categoria), `label`,
`description` (descrição curta), `minPlan` (plano mínimo para o nível
completo), `status`, `reason` (motivo) e `upgradeTarget`. `plans` entrega
a matriz completa por plano (mesmo formato `PlanCell` do frontend).

### Semântica

- `status` derivado do plano atual: `full → AVAILABLE`, `partial →
  LIMITED`, `none` com presença no Pro → `PRO_ONLY`, `none` só no
  Full/nunca → `FULL_ONLY`.
- `minPlan`: primeiro plano com nível `full` (`null` se nenhum).
- `upgradeTarget`: `null` (AVAILABLE), `PRO` (PRO_ONLY), `FULL`
  (FULL_ONLY), ou primeiro plano acima do atual com `full` (LIMITED).
- Estado atual: 3 `AVAILABLE` (`clientes`, `vendas`, `financeiro`) e 6
  `LIMITED` (`importacao` → target PRO; `dashboard`, `mobile`,
  `branding`, `integracoes`, `migracao` → target FULL). Nenhuma
  capability usa `none` hoje; o nível e os status `PRO_ONLY`/`FULL_ONLY`
  já existem na derivação e são cobertos por teste unitário sintético.

### Regras de segurança cumpridas

- **Plano = constante de servidor** (`CURRENT_PLAN = 'LITE'`): query
  string, body, header ou coluna de tenant não alteram a resposta
  (provado pelo teste `?plan=FULL`).
- **Sem persistence**: nada gravado — persistir plano por tenant
  exigiria migration; conforme a regra do prompt, não implementamos
  (proposta registrada abaixo).
- **Informativo ≠ entitlement**: nenhuma chamada a `requirePermission`
  foi alterada/criada; o endpoint só exige autenticação e não concede
  nada. Nenhuma regra de autorização existente foi tocada.
- **Sem billing/checkout/assinatura/trial/integração externa.**
- Resposta sem dados de tenant (mesmo corpo para qualquer tenant).

## 3. Testes (8 novos, `services/api-lite`)

1. Contrato completo para MASTER: 9 keys na ordem da doc, status/minPlan/
   upgradeTarget exatos por capability, `reason` `null` ⇔ `AVAILABLE`,
   células da matriz (`importacao` LITE "Sim, limitada", `dashboard` PRO
   "Avançado", `migracao` FULL "Nativo").
2. Mesmo corpo para MASTER, MANAGER, VIEWER e SELLER (informativo).
3. 401 anônimo; 200 em `/api/plan/capabilities`.
4. `?plan=FULL&status=AVAILABLE` ignorado — corpo idêntico, `plan` segue
   `LITE`.
5. Tenant isolation: tenant-a e tenant-b com corpos profundos iguais e
   nenhuma string de tenant/e-mail na resposta.
6–8. Derivação pura: `AVAILABLE`/`LIMITED`/`PRO_ONLY`/`FULL_ONLY`
   (inclui níveis sintéticos `none`), `minPlan` (`LITE`/`PRO`/`FULL`/
   `null`) e `upgradeTarget` por status.

Resultado: **8/8** no arquivo novo; suíte api-lite **149/149** (17 files).

## 4. Gates

```text
npx turbo run lint typecheck test build --filter=@travel-platform/api-lite
  --filter=@travel-platform/travel-lite --force   → 8/8 OK
```

- api-lite: lint 0 erros, typecheck OK, test 149/149, build OK.
- travel-lite: lint 0 erros (4 warnings pré-existentes em
  `auth.tsx`/`charts.tsx`/`ui.tsx`), typecheck OK, test 83/83 (inclui
  `plan.test.tsx` da sessão paralela de frontend), build OK (warning
  pré-existente de chunk > 500 kB).
- **Docker**: os testes de `api-lite` usam o container local
  `travel-lite-postgres-test` (porta 55437, compose
  `infrastructure/docker-compose.travel-lite-test.yml`), subido
  automaticamente pelo helper de teste se não estiver saudável. Nenhum
  acesso a produção/staging; nenhum `.env` lido.
- **Ambiente**: no meio dos gates o NVM bloqueou `npm`/`npx` (NVM4306,
  identidade do script delegado mudou — efeito da atividade paralela);
  resolvido com `nvm reshim` (ação indicada pela própria ferramenta) e
  os gates foram re-executados com sucesso.

## 5. Documentação

`docs/travel-lite/product-experience/PLAN-CAPABILITIES.md`:

- `Status: API contract implemented (2026-10-02)`;
- seção *Contrato implementado (API, 2026-10-02)*: endpoint, regras do
  contrato (plano constante, informativo ≠ entitlement), tabela de
  derivação de status, exemplo de resposta, ordem das 9 keys, **guia de
  evolução para Pro/Full** (instância Pro/Full expõe sua constante de
  plano na mesma forma; `none` → `PRO_ONLY`/`FULL_ONLY` sem novo
  endpoint nem migration; limites numéricos entram aqui como fonte
  única; frontend substitui sua matriz local pela resposta) e os 8
  testes.

## 6. Fora de escopo / pendências

- **Frontend (sessão paralela)**: arquivos de UI do PX5
  (`planCapabilities.ts`, `planUi.tsx`, `PlanPage.tsx` etc.) não foram
  tocados por esta entrega; próximo passo é o frontend consumir
  `GET /plan/capabilities` e aposentar a matriz local
  (fonte única na API, como o próprio stub prevê).
- **Persistência de plano por tenant**: não implementada por regra do
  prompt. Se/ quando necessária, migration proposta:
  `ALTER TABLE tenants ADD COLUMN plan TEXT NOT NULL DEFAULT 'LITE'
  CHECK (plan IN ('LITE','PRO','FULL'))` — a ser aprovada antes de
  qualquer execução; até lá `CURRENT_PLAN` continua constante.
- **Pendências de produto da doc** (não inventadas, seguem abertas):
  limites numéricos do Lite, preço/plano comercial, se Pro existe antes
  do Full, quem aprova upgrade.
- Nenhum commit realizado (sem autorização); working tree também
  contém o WIP de frontend da sessão paralela.

## 7. Próximos passos sugeridos

1. Revisar/aprovar e commitar esta entrega (arquivos da seção 2 +
   `PLAN-CAPABILITIES.md`), coordenando com o commit do frontend PX5.
2. Frontend passa a buscar `GET /plan/capabilities` (mantendo
   fallback estático offline, se desejado).
3. Quando o produto definir limites numéricos, adicioná-los ao contrato
   em `capabilities.ts` antes de qualquer texto na UI.
