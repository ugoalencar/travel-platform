# PX1-05 — Smoke visual da UX P0 (Travel Lite) e pendência do container (Full)

- **Data/hora:** 2026-10-01 16:52
- **Pedido:** "pode realizar os dois" (smoke visual e remoção do container órfão com nova execução dos 13 testes do Full)
- **Commit verificado:** `0f07870` em `feature/travel-lite` (worktree limpo antes e depois)

## 1. Smoke visual: concluído

**Como foi feito:** subi o app do worktree com o Vite (porta 5180) e uma **API de mentira local** com dados fictícios (porta 4011), e abri no navegador do app. Não usei credenciais reais nem toquei no banco do piloto: a sessão fictícia foi gravada no `localStorage` do navegador e limpa ao final. Os dois servidores foram encerrados e o worktree continua limpo.

| Verificação | Resultado |
|---|---|
| Topbar com **Ajuda** e **Sair** | OK |
| `/ajuda` abre pelo link do topbar; FAQ com a copy corrigida ("Pago"; cancelar venda: administrador ou gerente) | OK |
| Checklist **Prepare sua agência** com a base vazia (MASTER): 4 passos com botões | OK |
| Checklist para **SELLER**: só o passo "primeiro cliente" | OK |
| **Cancelar venda** com confirmação respondida **Não**: o texto do confirm veio certo ("Cancelar a venda VND-0001? Esta ação não pode ser desfeita.") e **nenhuma requisição de cancelamento** chegou à API | OK |
| Mesma ação com **Sim**: aparece "Venda cancelada." em verde e o status da venda muda para Cancelada | OK |
| **Acesso negado**: SELLER abrindo `/financeiro` por URL direta vê "Acesso restrito", a URL é mantida, o menu lateral só mostra o que ele pode usar, e "Voltar ao dashboard" funciona | OK |

### Achados novos do smoke (baixa severidade, nada bloqueante)
1. **Flash do empty state com CTA durante o carregamento.** Ao abrir `/vendas`, por um instante a lista mostra "Nenhuma venda encontrada." com o botão "Nova venda" antes de os dados chegarem, porque a lista começa vazia. O texto já piscava antes; o botão novo torna o piscar mais visível. Vale o mesmo para as demais listas com empty state. *Sugestão:* guardar um estado "carregando" e só mostrar o empty state depois do primeiro carregamento.
2. **Links com aparência de botão continuam sublinhados** ("Ajuda", "Voltar ao dashboard" e os "Ir para…" do checklist). Cosmético. *Sugestão:* `text-decoration: none` em `a.btn`.

Ambos entram no backlog junto com L3 a L6 da revisão.

## 2. Remoção do container órfão e novos testes do Full (PX1-04): NÃO REALIZADO

Tentei remover o container `travel-platform-postgres-local` (projeto compose `travel-platform-sale-item-routes-postgres`, `postgres:15`, porta 55432, banco descartável de teste). **O Claude Code bloqueou o comando** (`docker rm -f`) com a razão "Interfere with Workloads". Respeitei o bloqueio: **não tentei contornar** por outro meio. Nada foi removido, parado ou alterado em containers.

Consequência: os 13 arquivos de teste com Postgres do `npm run test` do Full continuam sem execução, e o gate de testes do PX1-04 segue **não concluído** (resultado anterior: 87 de 100 arquivos passaram, 1402 testes ok, 0 falhas de asserção; os 13 restantes falharam no setup por causa do nome fixo do container).

### O que é preciso para fechar
Uma das opções, a critério do usuário:
- **Remover o container você mesmo**, por exemplo `docker rm -f travel-platform-postgres-local` (só apaga o banco descartável de teste; nada de produção), ou
- **Liberar a permissão** para o Claude Code executar essa remoção, e então eu removo e rodo os 13 arquivos em serial a partir de `services/api`.

## 3. Estado final
- `feature/travel-lite`: commit `0f07870`, worktree limpo, **sem push, PR ou merge**.
- `codex/px1-import-security` (checkout principal): alterações do PX1-04 ainda sem commit.
- Containers: nenhum alterado.
