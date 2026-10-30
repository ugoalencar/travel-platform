# NEXT PROMPT - PX1-03 UX P0 IMPLEMENTATION

Agente: Opencode / Mimo v2.6

Status: liberado pelo Codex apos validacao focada do patch de seguranca do Import Center.

Este prompt substitui o HOLD anterior apenas para a frente UX P0 do Travel Lite.

## Contexto

O patch de seguranca do Import Center foi implementado pelo Claude e os testes focados passaram:

- `tests/security/import-allowlist.test.ts`: 7 testes passaram.
- `services/api/tests/import-routes-http.test.ts`: 16 testes passaram.

A suite completa `npm run test` nao teve sinal verde total por conflito de infraestrutura Docker:

- varios testes tentaram criar o mesmo container `travel-platform-postgres-local` em paralelo;
- falha observada como conflito de nome de container;
- nao ha evidencia direta de regressao no patch de Import Center.

Mesmo assim, esta frente esta liberada porque deve atuar somente na UX do Travel Lite em worktree isolado, sem tocar na API/import.

## Escopo autorizado

Implementar o P0 de UX do Travel Lite conforme o seu relatorio/spec anterior:

- `.opencode/Auditoria-UX-Travel-Lite-checklist-PX1-2026-10-01-1035.md`
- `.opencode/PX1-02-UX-P0-implementation-spec-2026-10-01.md`
- plano mestre: `docs/superpowers/plans/2026-10-01-px1-master-coordination.md`

Prioridade:

1. Corrigir problemas P0 de usabilidade e fluxo.
2. Preservar comportamento existente.
3. Manter mudancas pequenas, revisaveis e alinhadas ao design atual.
4. Nao iniciar refatoracoes amplas.

## Area de trabalho obrigatoria

Use somente o worktree do Travel Lite:

```text
D:\travel-platform\.worktrees\travel-lite
```

Nao editar o checkout principal:

```text
D:\travel-platform
```

## Proibido

- Nao tocar em `services/api/src/routes/import.ts`.
- Nao tocar em `services/api/src/import/service.ts`.
- Nao tocar nos testes de import.
- Nao mexer em autorizacao, tenant isolation, RLS, Prisma ou migrations.
- Nao executar `prisma migrate`, `prisma db push` ou `prisma generate`.
- Nao instalar dependencias.
- Nao fazer commit, push, merge ou PR.
- Nao acessar `.env` real.
- Nao acessar producao/staging.

## Arquivos esperados

Antes de editar, confirme no relatorio quais arquivos Travel Lite sao afetados.

Se precisar ampliar o escopo de arquivos alem do que ja foi mapeado no seu spec, registre o motivo no relatorio final.

## Verificacao minima esperada

Execute os gates relevantes do Travel Lite conforme scripts existentes no worktree.

Se houver app frontend:

- rodar teste/lint/typecheck especifico quando existir;
- quando viavel, iniciar preview/dev server local;
- validar o fluxo corrigido manualmente ou com teste automatizado;
- registrar qualquer limitacao.

Nao rode a suite completa global agora; ela esta bloqueada por conflito Docker conhecido.

## Relatorio final obrigatorio

Ao terminar, criar:

```text
.opencode/2026-10-01_PX1-03_UX-P0-implementation-report.md
```

O relatorio deve conter:

- resumo do que foi implementado;
- arquivos alterados;
- problemas P0 resolvidos;
- problemas que ficaram fora do escopo;
- comandos de verificacao executados e resultado;
- riscos/remanescentes;
- se tocou em algum arquivo fora do escopo inicialmente previsto, explicar por que.

## Criterio de pronto

Considere pronto apenas quando:

- as alteracoes UX P0 estiverem implementadas;
- os gates relevantes forem executados ou a impossibilidade estiver documentada;
- o relatorio final existir;
- o worktree `D:\travel-platform\.worktrees\travel-lite` estiver em estado coerente para revisao pelo Codex.
