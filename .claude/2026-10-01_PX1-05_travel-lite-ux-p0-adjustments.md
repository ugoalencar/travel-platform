# PX1-05 — Ajustes pontuais após a revisão da UX P0 (Travel Lite)

- **Data/hora:** 2026-10-01 16:32
- **Autorização:** "Autorizado" (ajuste pontual recomendado em `.claude/2026-10-01_PX1-05_travel-lite-ux-p0-review.md`)
- **Worktree:** `D:\travel-platform\.worktrees\travel-lite` (`feature/travel-lite`, base `e19db89`)
- **Estado:** ajustes aplicados e verificados. **Nada commitado, enviado ou mergeado.** O commit continua dependendo de autorização explícita.

## 1. O que foi ajustado

| Achado | Ajuste | Arquivos |
|---|---|---|
| **M1** teste do checklist sem proteção | O teste "hides the first-run checklist when the base is already populated" agora espera as 4 chamadas (`/financial-accounts`, `/categories`, `/sellers`, `/customers`), deixa as respostas assentarem e só então afirma a ausência do card | `App.test.tsx` |
| **M2** sucesso e erro juntos | 23 blocos `catch` de ação passam a fazer `setNotice(null)` antes de mostrar o erro, em Vendas, Comissões, Clientes, Vendedores, Financeiro, Configurações, Cadastros e Importações. Os `catch` de carregamento ficaram de fora, assim como o do modal de permissões (que não tem a nota) | 8 páginas em `apps/travel-lite/src/pages/` |
| **L1** FAQ: quem cancela venda | "exige permissão para editar todas as vendas (administrador ou gerente)" | `HelpPage.tsx` |
| **L2** FAQ: "Paga" × "Pago" | Passou a "Pago" (venda e comissão), igual ao badge | `HelpPage.tsx` |
| **L7** testes que faltavam | 5 testes novos (abaixo) | `App.test.tsx` |

**Correção ao relatório de revisão:** no M2, o caso "erro antigo ao lado de um sucesso novo" quase não ocorre, porque as ações que dão certo recarregam a lista e a recarga já limpa o erro. O defeito real era o inverso: a nota de sucesso ficava na tela quando a ação seguinte falhava. O ajuste cobre esse lado.

### Testes novos (`App.test.tsx`)
1. `/ajuda` por URL direta (autenticado) e redirecionamento ao login quando anônimo.
2. SELLER vê só o passo do checklist que pode executar (cliente) e o app não chama `/financial-accounts`, `/categories` nem `/sellers`.
3. Endpoint do checklist falhando (404): o dashboard continua, a linha da conta financeira some e nenhum `.lite-error` aparece.
4. Usuário com `sellers.read` sem `sellers.manage`: lista vazia mostra só a mensagem, sem "Novo vendedor".
5. Sucesso seguido de falha: "Cliente desativado." some quando o próximo PATCH devolve erro.

### Os testes novos de M1 e M2 de fato protegem
Verifiquei por mutação temporária (revertida em seguida):
- removendo a regra que esconde o checklist com a base completa → o teste de M1 **falhou**;
- removendo o `setNotice(null)` do `catch` de Clientes → o teste de M2 **falhou**.
Com o código restaurado, 22/22 passam.

## 2. Gates

| Gate | Resultado |
|---|---|
| `@travel-platform/travel-lite` testes | **22/22** (eram 17) |
| `lint` (travel-lite e api-lite) | OK, 0 erros; 4 warnings `react-refresh` pré-existentes |
| `typecheck` (travel-lite e api-lite) | OK |
| `build` (travel-lite e api-lite) | OK (6/6 tarefas no turbo) |
| `npx tsc -p tsconfig.json --noEmit` (raiz do worktree) | OK |
| `@travel-platform/api-lite` testes | **97/97** (13 arquivos), rodados depois que o Docker Desktop foi religado |

**Histórico:** a primeira execução do `api-lite` falhou porque o Docker Desktop estava fora do ar (`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`; 8 testes passaram e 89 foram pulados nos 11 arquivos que sobem Postgres). Nada a ver com estas mudanças, que não tocam em backend. Com o Docker religado, `npx turbo run test --filter=@travel-platform/api-lite --force` passou: **13 arquivos, 97/97**, usando o container próprio `travel-lite-postgres-test` (porta 55437), sem tocar nos demais.

## 3. Escopo
- Alterado só em `apps/travel-lite/src` (`App.test.tsx`, `HelpPage.tsx` e as 8 páginas), mais os arquivos que já estavam alterados pela entrega do Opencode.
- Sem mudança em `services/api-lite`, `services/api`, Import Center do Full, Prisma, migrations, `.env`, staging ou produção.
- Sem dependência instalada.
- Um log temporário de gates foi gravado por engano na raiz do checkout principal e removido logo em seguida (confirmado: `git status` do checkout principal sem esse arquivo).

## 4. Itens da revisão que ficaram para o backlog (não ajustados)
- **L3** VIEWER vê passo do checklist sem botão;
- **L4** checklist para SELLER conta só a própria carteira;
- **L5** nota de sucesso não some ao trocar de aba, filtro ou página;
- **L6** texto do dry-run quando não há pendência;
- teste "Estornar não abre `window.confirm`" e mais testes de mutação feliz por página.

## 5. Próximos passos
1. ~~Rodar o teste do api-lite~~ (feito: 97/97).
2. Smoke visual rápido: `/ajuda`, cancelar venda com confirm, checklist vazio, acesso negado.
3. Com o smoke ok, **liberar o commit** (14 modificados + 3 novos, todos em `apps/travel-lite` e `docs/travel-lite`), mediante autorização explícita.

## 6. Commit (2026-10-01 16:48)

Commit local `0f07870` em `feature/travel-lite` (17 arquivos, todos em `apps/travel-lite` e `docs/travel-lite`), após autorização explícita do usuário. Worktree limpo depois do commit. **Sem push, sem PR e sem merge.** O smoke visual não foi feito antes do commit. As mudanças ficaram em um único commit (e não um por item, como a spec sugeria), porque `ui.tsx` e as páginas são tocados por vários itens ao mesmo tempo.
