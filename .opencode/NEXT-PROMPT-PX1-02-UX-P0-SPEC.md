# Próximo prompt Opencode/Mimo — PX1-02 Especificação UX P0 Travel Lite

Você é um agente auxiliar trabalhando na worktree `D:\travel-platform\.worktrees\travel-lite`.

## Contexto

Você entregou a auditoria:

`.opencode/Auditoria-UX-Travel-Lite-checklist-PX1-2026-10-01-1035.md`

O Claude está em uma frente separada de segurança do Full (`services/api/src/routes/import.ts`). Para evitar conflito, **não trabalhe em `D:\travel-platform\services\api`, `.claude` nem na matriz Full nesta rodada**.

## Tarefa

Transforme os itens P0 da auditoria UX em uma especificação objetiva de implementação para a Travel Lite, ainda **sem implementar código**.

## Regras obrigatórias

- Não editar código-fonte.
- Não editar testes.
- Não rodar deploy.
- Não rodar migrations.
- Não rodar `prisma migrate`, `prisma db push` ou `prisma generate`.
- Não ler arquivos `.env` reais, incluindo `.env.travel-lite`.
- Não acessar produção ou staging.
- Pode criar apenas o relatório `.md` solicitado abaixo.

## Itens P0 a especificar

- `PX1-01` Página `/ajuda` básica.
- `PX1-02` Feedback de sucesso + confirmação destrutiva.
- `PX1-03` Checklist de primeiro acesso no Dashboard.
- `PX1-04` CTAs nos empty states.
- `PX1-05` Redirecionamento com mensagem quando faltar permissão.
- `PX1-06` Especificação de Plan Capabilities, somente documento/decisão.

## Leia no mínimo

- `.opencode/Auditoria-UX-Travel-Lite-checklist-PX1-2026-10-01-1035.md`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\App.tsx`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\Layout.tsx`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\menu.ts`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\ui.tsx`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\pages\DashboardPage.tsx`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\pages\CustomersPage.tsx`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\pages\SalesPage.tsx`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\pages\FinancePage.tsx`
- `D:\travel-platform\.worktrees\travel-lite\docs\travel-lite\ACCESS-CONTROL.md`
- `D:\travel-platform\.worktrees\travel-lite\docs\travel-lite\INTEGRATION-MAPPING.md`

## Entregue em novo arquivo `.md`

Salve o relatório em:

`.opencode/PX1-02-UX-P0-implementation-spec-2026-10-01.md`

O relatório deve conter:

1. Objetivo de PX1 P0.
2. Escopo exato, separando o que entra e o que fica fora.
3. Para cada item P0:
   - comportamento esperado;
   - telas/arquivos prováveis;
   - mensagens em pt-BR sugeridas;
   - estados vazios/sucesso/erro;
   - testes mínimos recomendados.
4. Ordem de implementação recomendada.
5. Riscos de conflito entre arquivos.
6. Gates a rodar depois.
7. Pontos que precisam de decisão humana antes de codar.

## Importante

Esta rodada ainda é especificação. Não implemente a UX.
