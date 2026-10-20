# NEXT PROMPT - PX1-05 Travel Lite UX P0 Review

Agente: Claude

Status: revisar a entrega do Opencode/Mimo v2.6 antes de qualquer commit/merge.

## Contexto

O Opencode implementou o P0 de UX do Travel Lite no worktree:

```text
D:\travel-platform\.worktrees\travel-lite
```

Relatorio da entrega:

```text
.opencode/PX1-03-UX-P0-Implementation-Report-2026-10-01-1516.md
```

Prompt usado pelo Opencode:

```text
.opencode/NEXT-PROMPT-PX1-03-UX-P0-IMPLEMENTATION.md
```

Plano mestre:

```text
docs/superpowers/plans/2026-10-01-px1-master-coordination.md
```

## Validacao ja executada pelo Codex

No worktree `D:\travel-platform\.worktrees\travel-lite`, o Codex reexecutou:

```powershell
npx turbo run lint typecheck test build --filter=@travel-platform/api-lite --filter=@travel-platform/travel-lite --force
```

Resultado:

- 8 tarefas ok.
- `@travel-platform/travel-lite`: 17/17 testes passaram.
- `@travel-platform/api-lite`: 97/97 testes passaram.
- lint sem erros; 4 warnings existentes de `react-refresh/only-export-components`.

Tambem executou:

```powershell
npx tsc -p tsconfig.json --noEmit
```

Resultado: ok, sem erro.

## Escopo da revisao

Fazer uma revisao tecnica e de produto das mudancas do Opencode, sem implementar alteracoes ainda.

Foque em:

1. Se a entrega cumpre os itens P0 da spec:
   - `.opencode/PX1-02-UX-P0-implementation-spec-2026-10-01.md`
2. Se os fluxos de permissao do Travel Lite continuam fail-closed.
3. Se os empty states, success notes, confirms e rota `/ajuda` estao coerentes e sem regressao.
4. Se o checklist de primeira execucao no dashboard nao quebra usuarios com permissoes diferentes.
5. Se os testes adicionados cobrem os riscos principais.
6. Se houve alguma mudanca fora do escopo combinado.
7. Se existe algum risco visual, de acessibilidade, copy, ou fluxo que precise ajuste antes de commit/merge.

## Arquivos alterados esperados

No worktree `D:\travel-platform\.worktrees\travel-lite`, os arquivos esperados sao:

```text
apps/travel-lite/src/App.test.tsx
apps/travel-lite/src/App.tsx
apps/travel-lite/src/Layout.tsx
apps/travel-lite/src/pages/CatalogPage.tsx
apps/travel-lite/src/pages/CommissionsPage.tsx
apps/travel-lite/src/pages/CustomersPage.tsx
apps/travel-lite/src/pages/DashboardPage.tsx
apps/travel-lite/src/pages/FinancePage.tsx
apps/travel-lite/src/pages/ImportDataPage.tsx
apps/travel-lite/src/pages/SalesPage.tsx
apps/travel-lite/src/pages/SellersPage.tsx
apps/travel-lite/src/pages/SettingsPage.tsx
apps/travel-lite/src/styles.css
apps/travel-lite/src/ui.tsx
apps/travel-lite/src/pages/HelpPage.tsx
apps/travel-lite/src/ui.test.tsx
docs/travel-lite/PLAN-CAPABILITIES.md
```

## Proibido nesta etapa

- Nao editar codigo.
- Nao corrigir problemas ainda.
- Nao commitar, pushar, mergear ou abrir PR.
- Nao tocar no checkout principal `D:\travel-platform`, exceto para ler os relatorios em `.opencode` e `.claude`.
- Nao tocar em `services/api`, Import Center, Prisma, migrations, `.env`, staging ou producao.
- Nao rodar a suite global `npm run test`; ela ainda tem conflito conhecido de Docker/container fixo.

## Saida obrigatoria

Criar este relatorio:

```text
.claude/2026-10-01_PX1-05_travel-lite-ux-p0-review.md
```

O relatorio deve conter:

- veredito: `APROVAR`, `APROVAR COM AJUSTES PEQUENOS`, ou `BLOQUEAR`;
- achados por severidade, com arquivo e linha quando possivel;
- riscos de UX/permissao/teste;
- confirmacao se o escopo foi respeitado;
- recomendacao do proximo passo:
  - liberar commit;
  - pedir ajustes ao Opencode;
  - ou fazer ajuste pontual pelo Codex/Claude.

Se encontrar problema bloqueante, explique o menor ajuste necessario.
