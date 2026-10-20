# PX7 — Manual do usuário do Travel Lite

- **Data/hora:** 2026-10-02 06:10
- **Prompt:** `.claude/NEXT-PROMPT-PX7-USER-MANUAL.md`
- **Onde:** checkout principal `D:\travel-platform`, branch nova `docs/px7-user-manual` (criada a partir da `main` em `2ac3395`). **Só documentação**, em `docs/travel-lite/product-experience/`.
- **Estado:** manual escrito como **rascunho para revisão**. **Nada commitado, enviado ou publicado.**

## 1. O que foi entregue

| Arquivo | Mudança |
|---|---|
| `docs/travel-lite/product-experience/USER-MANUAL.md` | **Novo.** Manual principal, 22 capítulos, 786 linhas, em português simples para usuários de agência |
| `docs/travel-lite/product-experience/USER-MANUAL-PLAN.md` | **Atualizado.** Status do manual, mapa "estrutura proposta → capítulos" e o estado de cada entregável (PDF e folha impressa seguem pendentes) |

Nenhum código da aplicação foi alterado.

### Estrutura do manual
1. Antes de começar: perfis e permissões (com tabela do que cada perfil faz por padrão)
2. Acesso e primeiro login (inclui o link por agência e a identidade na tela de login)
3. Primeiros passos: preparar a agência (checklist "Prepare sua agência")
4. Dashboard · 5. Clientes · 6. Vendedores · 7. Cadastros · 8. Vendas, custos e margem · 9. Financeiro · 10. Comissões · 11. Relatórios · 12. Importação de planilhas
13. Usuários e permissões · 14. Identidade visual da agência
15. Uso no celular e app instalável
16. Ajuda, busca e dúvidas frequentes · 17. Recursos do plano Lite/Pro/Full · 18. Prontidão para migrar do Lite para o Full
19. Boas práticas · 20. Solução de problemas comuns (tabela)
21. **O que ainda depende da empresa ou do produto**
22. Anexos: checklist rápido (para imprimir) e glossário

Cada capítulo de tela segue o padrão pedido: **para que serve, quem pode acessar, passo a passo, exemplo preenchido, erros comuns e resultado esperado**. As permissões são citadas por perfil, e o que é só informativo (Ajuda, checklist, tela de planos) está marcado como tal, sem alterar autorização.

## 2. Como foi auditado

Li os documentos indicados no prompt (`USER-MANUAL-PLAN`, `HELP-CENTER`, `ONBOARDING`, `MOBILE-PWA`, `PLAN-CAPABILITIES`, `UPGRADE-TO-FULL`, `MIGRATION-READINESS`, `ACCESS-CONTROL`) e `helpContent.ts`. Como os documentos podem estar à frente ou atrás do produto, **conferi no código** os pontos que o manual afirma:

- rótulos das telas e botões (Relatórios, Cadastros, Financeiro, Importações, Vendedores, Comissões, Vendas, Clientes, mobile, planos);
- etapas reais do checklist (vendedores, conta, categorias, cliente, primeira venda, ajuda);
- títulos dos 12 indicadores do dashboard;
- permissões padrão por perfil (matriz do `ACCESS-CONTROL` e migração `005`);
- regras da identidade visual (limites de texto, contraste, formatos e tamanho do logo);
- duração da sessão (24 horas), senha mínima (8 caracteres), formatos de importação aceitos (`.csv` e `.xlsx`);
- que **nenhum limite de plano é imposto** pela aplicação (busca no `api-lite` sem nenhum bloqueio por plano);
- que a prontidão de migração é **só um endpoint técnico, sem tela**.

## 3. Verificações feitas

| Verificação | Resultado |
|---|---|
| `git diff --check` (incluindo o arquivo novo, com `git add -N` desfeito em seguida) | **OK**, sem espaços ao fim de linha |
| Tabulações no manual | nenhuma |
| Links internos do sumário (28) | **todos resolvem** para um título existente |
| Rótulos de interface citados (39, por exemplo "Novo cliente", "Validar dry-run", "Copiar resumo para o responsável") | **todos existem no código** do app |
| Preços ou limites com números | **nenhum** (a única ocorrência de "R$" é o valor fictício de um exemplo de venda) |

Não rodei lint, testes nem build, porque não houve mudança de código.

## 4. Discrepâncias encontradas durante a auditoria

Não alterei o produto; registrei aqui e tratei no manual:

1. **Mensagens em inglês na interface.** O login mostra "Invalid credentials" e a importação mostra "Only CSV or XLSX uploads are allowed". O manual explica o significado de cada uma (capítulos 2 e 20). Vale traduzir no produto.
2. **`ONBOARDING.md` fala em 8 etapas** do checklist; o app implementa **6** (o próprio documento registra o desvio). O manual segue o app.
3. **Prontidão de migração sem tela.** Só existe o endpoint somente leitura (MASTER). O manual diz isso com clareza e não promete botão nem exportação.
4. **Dependência operacional da identidade visual.** O editor depende da tabela de branding (migração `006`). Se faltar em algum ambiente, o editor mostra "Não foi possível carregar a identidade visual atual" (já previsto na tabela de problemas).

## 5. Pendências de produto/empresa (também no capítulo 21 do manual)

Limites numéricos do Lite · preço e condições comerciais · se o Pro existe antes do Full · quem aprova um upgrade · redefinição de senha por e-mail · tela e exportação do relatório de prontidão · agendamento e execução da migração · identidade visual avançada, integrações, ícone por agência e notificações · validação em aparelhos reais · PDF e folha impressa.

## 6. Limites desta entrega

- É um **rascunho**: precisa de revisão de produto e de uma leitura por alguém da operação (ex.: um MASTER e uma vendedora) para confirmar que as tarefas comuns funcionam seguindo só o texto.
- Descreve o produto **no estado da `main` de 2026-10-02**; qualquer mudança de tela exige atualizar o manual.
- Sem capturas de tela (o manual é só texto, versionável). Sem PDF, DOCX ou PPT, como pedido.
- Parte do conteúdo (exemplos, status, passo a passo) **repete a Ajuda do sistema** de propósito; se uma mudar, a outra precisa acompanhar. Há risco de divergência com o tempo.

## 7. Confirmações

- Não li `.env`; não acessei produção nem staging; não rodei migrations nem Prisma; não instalei dependências.
- Não inventei telas, fluxos, preços, limites numéricos ou recursos: o que não existe aparece como pendência.
- **Sem commit, push, PR ou merge.**

## 8. Próximos passos

1. **Decisão:** autorizar o commit do PX7 na branch `docs/px7-user-manual` (e depois PR e merge).
2. Revisão do manual por produto e por um usuário real (MASTER e SELLER).
3. Traduzir as mensagens em inglês da interface, se desejado.
4. Depois da estabilização visual: gerar o PDF e a folha impressa do checklist.
