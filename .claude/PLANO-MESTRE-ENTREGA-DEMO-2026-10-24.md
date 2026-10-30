# Plano mestre até a entrega para teste local do demo

Data: 2026-10-24. Autonomia concedida pelo usuário: concluir todas as solicitações
até a fase de entrega para teste local do demo, sem parar para decisões, usando a
opção mais recomendável. Limites que permanecem: nenhum deploy online, nenhuma
alteração na Gadotti em produção, DNS, Supabase, Render ou Vercel; nenhuma ação
destrutiva; nada de commit/push em branch principal; migrations só em banco local
descartável.

## Princípios
- Full primeiro, validado; Lite recebe do Full o contrato aprovado, sem função a mais.
- Lite mantém banco separado e contrato compatível com migração futura para o Full.
- Um escritor por arquivo e um escritor por vez no checkout principal; desenhos em
  paralelo só em arquivos de documentação próprios.
- Cada onda: testes antes, Full backend e UI, gates (lint, typecheck, test, test:db,
  build), revisão Codex somente leitura (`D:\tools\codex\codex.cmd exec --sandbox
  read-only -m gpt-6.1-sol`), depois Lite com os mesmos gates.
- O Codex também pode implementar partes de arquivos disjuntos (`--sandbox
  workspace-write`), sempre com diff revisado e gates rodados por quem integra.

## Decisões já tomadas (padrões adotados)
- D1–D7 da especificação aceitos nos padrões propostos. F1, F3, F4 aceitas. F2
  dissolvida: a forma de pagamento define SE exige recebimento; o perfil financeiro
  global define COMO afeta metas e liberação. Sem política configurada, o recurso
  fica bloqueado (nunca ON_SALE por padrão).
- Q4: só administradores configuram categorias de venda. A2: importação ignora
  obrigatoriedade e marca a venda como "a completar".
- ADRs 006, 007 e 008 aceitos.

## Ondas e estado
| Onda | Conteúdo | Estado |
| --- | --- | --- |
| Fase 0 | Proteções de comissão (canal único, migration 100) | Feita, validada, não commitada |
| A | Busca de cliente por nome e CPF, Full e Lite | Feita, validada, integrada local, demo testado |
| B | Categoria, campos de venda, produto (migrations 101, 102 e 012) | Feita; gates verdes; precisão e cancelamento corrigidos via Codex; nova revisão do Codex pendente |
| B2 | Limpeza CEP/CSV + botão CSV Full | Feita (suíte completa do Full a cargo da integração final) |
| Desenho | SEC-01, BAK-01, DASH-01 | Feito (`DESENHO-SEC01-BAK01-DASH01-2026-10-24.md`) |
| 2 | Frente 2 (campos de cliente) + SEC-01 (migrations 103, 104 e 013) | Feita; duas rodadas do Codex |
| C | Condições de pagamento, cronograma, baixas e saldos | Backend do Full em implementação pelo Codex (migration 105+) |
| D | Receita da agência (+ vínculo comissão do funcionário) | Pendente |
| E | COM-01/02/03 e quitação/recebimento da comissão | Pendente |
| F | Relatórios e projeções; BAK-01, DASH-01, IMP-01 | Pendente |
| Final | Integração, gates, Codex, demo local, relatório | Pendente |

## Pontos não verificados que acompanham o plano
- Ressalvas conhecidas da suíte do Full: MFA (429 em vez de 401) e timeout de
  `proposal-routes`.
- Textos legais da pesquisa de campos por modalidade só parcialmente confirmados.
- Nenhum commit foi feito no `wip`; tudo está como alteração local no checkout.
