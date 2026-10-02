# Travel Lite — Lite, Pro e Full Capabilities

Status: API contract implemented (2026-10-02)

## Objetivo

Preparar diferenciação de planos sem tornar a interface confusa. O Lite deve ser útil por si só, mas deixar claro quando uma capacidade pertence ao Pro ou Full.

## Princípios

- Bloqueios reais devem ser server-side.
- UI pode sinalizar upgrade, mas nunca ser a única barreira.
- Mensagens devem explicar valor, não punir o usuário.
- Recursos indisponíveis não devem atrapalhar tarefas do Lite.

## Matriz inicial

| Capacidade | Lite | Pro | Full |
|---|---|---|---|
| Clientes | Sim | Sim | Sim |
| Vendas | Sim | Sim | Sim |
| Financeiro básico | Sim | Sim | Sim |
| Importação CSV/XLSX | Sim, limitada | Sim | Sim |
| Dashboard | Essencial | Avançado | Completo |
| Mobile | Consulta + cliente rápido | Operação ampliada | Completo |
| Branding | Básico | Avançado | Completo |
| Integrações | Preparado | Parcial | Completo |
| Migração para Full | Readiness | Assistida | Nativo |

## Mensagens de upgrade

Quando algo não estiver disponível:

- explicar a capacidade;
- informar que está disponível no Pro/Full;
- oferecer contato ou solicitação de upgrade;
- não expor detalhes técnicos.

## Pendências de produto

- Definir limites numéricos do Lite.
- Definir preço/plano comercial.
- Definir se Pro existe antes do Full.
- Definir quem aprova upgrade.

## Critérios de aceite

- Usuário entende diferenças sem documentação externa.
- Limites futuros têm fonte única na API.
- O Lite continua limpo e operacional.

## Contrato implementado (API, 2026-10-02)

Endpoint somente leitura, estático (sem banco, sem migration):

- `GET /plan/capabilities` (e `GET /api/plan/capabilities`), em
  `services/api-lite/src/routes/plan.ts`, com `protectedHooks` —
  qualquer usuário autenticado lê; anônimo recebe 401.
- Núcleo: `services/api-lite/src/capabilities.ts`
  (`CAPABILITIES` + `buildPlanCapabilities()`), espelho tipado da matriz
  acima, com as mesmas keys que o frontend usa
  (`apps/travel-lite/src/planCapabilities.ts`).

### Regras do contrato

- **Plano atual é constante de servidor** (`CURRENT_PLAN = 'LITE'`):
  nunca vem de query string, body, header ou coluna de tenant. Por isso
  não há persistence — gravar plano por tenant exigiria migration, que
  deve ser proposta antes de implementada (regra PX5).
- **Informativo, não entitlement**: a resposta nunca concede, substitui
  ou enfraquece `requirePermission`; limites reais continuam server-side
  e a autorização existente não muda.
- **Derivação de status** (por capability, a partir do plano atual):

  | Nível no plano atual | `status` |
  | --- | --- |
  | `full` | `AVAILABLE` |
  | `partial` | `LIMITED` |
  | `none` + existe no Pro | `PRO_ONLY` |
  | `none` + só no Full (ou nunca) | `FULL_ONLY` |

  - `minPlan`: primeiro plano com nível `full` (`null` se nenhum).
  - `upgradeTarget`: `null` para `AVAILABLE`; `PRO` para `PRO_ONLY`;
    `FULL` para `FULL_ONLY`; para `LIMITED`, primeiro plano acima do
    atual com nível `full`.
  - `reason`: motivo estático quando a capacidade é reduzida no plano
    atual; `null` quando `AVAILABLE`.

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

As 9 capabilities da matriz, na ordem da tabela: `clientes`, `vendas`,
`financeiro`, `importacao`, `dashboard`, `mobile`, `branding`,
`integracoes`, `migracao`. Hoje nenhuma usa `none` (nenhuma capability é
exclusiva de Pro/Full nesta matriz); o nível `none` e os status
`PRO_ONLY`/`FULL_ONLY` já são suportados pela derivação e cobertos por
teste, prontos para capabilities futuras.

### Evolução para Pro/Full (sem quebrar Lite)

- Uma edição Pro/Full passa a expor a própria constante de plano na sua
  instância da API; a resposta é a mesma forma, só muda `plan` e os
  `status` derivados. Nenhum campo muda de nome.
- Para tornar algo `PRO_ONLY`/`FULL_ONLY`, basta publicar a capability
  com nível `none` no plano Lite — sem endpoint novo e sem migration.
- Limites numéricos (pendência de produto), quando definidos, entram
  neste contrato como fonte única antes de virarem texto na UI.
- O frontend adota a resposta substituindo seu `CURRENT_PLAN`/matriz
  estática local pelo retorno do endpoint (fonte única na API).

### Testes

`services/api-lite/tests/plan-capabilities.test.ts` (8): contrato
completo e status derivados; mesmo corpo para MASTER/MANAGER/VIEWER/
SELLER; 401 anônimo e prefixo `/api`; `?plan=FULL` é ignorado (plano
continua `LITE`); mesmo contrato para dois tenants sem nenhum dado de
tenant na resposta; derivação pura de `AVAILABLE`/`LIMITED`/`PRO_ONLY`/
`FULL_ONLY`, `minPlan` e `upgradeTarget` com níveis sintéticos `none`.
