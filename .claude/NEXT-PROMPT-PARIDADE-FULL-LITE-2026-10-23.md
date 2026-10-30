# Claude: alinhamento de comissoes Full / Lite

Trabalhe em `D:/travel-platform`. Leia `AGENTS.md`, `docs/AI_CONTEXT.md`,
`QUALITY-GATES.md` e `docs/00-product/FULL-LITE-ALIGNMENT-PLAN.md` primeiro.
Confirme cwd, branch, worktree e diff; preserve todo trabalho existente.

## Missao desta rodada

Especificar COM-01, COM-02 e COM-03: levar ao Full as capacidades que hoje
existem apenas no Lite, sem eliminar capacidades mais completas do Full.
Entregar contrato implementavel e plano por fases para revisao do Codex.
Esta rodada e documental, nao uma autorizacao para alterar codigo/schema.

Pode escrever somente:
`.claude/RELATORIO-PARIDADE-FULL-LITE-2026-10-23.md`.
Nao editar o coordenador, fontes, outros relatorios, migrations ou lockfiles.
Nao fazer deploy, acesso online, leitura de .env, instalacao, commit/push,
reset de banco, prisma ou execucao de migrations. Nao usar dados da Gadotti.

## Leitura direcionada

- `docs/travel-lite/FULL-LITE-PARITY-AUDIT-2026-10-23.md`.
- `docs/travel-lite/COMMISSION-ENGINE-SPEC.md`, especialmente secao 12.
- `.claude/COORDENACAO-LITE-FINANCEIRO-2026-10-22.md`.
- `services/api-lite/src/commission-engine.ts`, `finance.ts`,
  `routes/commission-rules.ts`, `routes/commissions.ts`, `routes/sales.ts`.
- `services/api/src/commission-plans.ts`, `commissions.ts`,
  `employee-commission-rules.ts`, `employee-commissions.ts`, `payroll.ts`,
  `financial.ts`, `routes/commissions.ts`.
- `apps/agency/src/pages/CommissionPlansPage.tsx`, `EmployeeDetailPage.tsx`,
  `PayrollPage.tsx` e testes correspondentes. Nao assumir falta de tela sem ler.
- Schemas/migrations vigentes e `packages/domain/types.ts`, somente leitura.

## Entrega exigida

1. Matriz por capacidade: codigo Lite, equivalente Full, lacuna e proposta
   minima. Distinguir defaults/revisoes, calculo e liberacao de pagamento.
2. Reutilizacao dos dominios Full existentes; interfaces propostas exatas,
   arquivos a tocar, compatibilidade e necessidade de ADR/migration futura.
3. Selecao de regra e vigencia, acumulado, estorno/cancelamento, arredondamento,
   concorrencia, idempotencia e snapshots. Nenhum recalculo historico implicito.
4. Integracao com regras por produto/passageiro/bilhete e folha do Full.
5. Casos numericos esperados, incluindo fixo, bruto/margem, excedente,
   cruzamento de faixa, recebimento parcial, reversao e comissao paga.
6. Plano de testes Vitest por etapa e arquivos, sem executar fixtures que
   recriam bancos nesta rodada. Explicitar o que nao foi testado.
7. Pareamento conceitual Lite -> Full para migracao futura, sem copiar dados.
8. Lista de decisoes humanas pendentes. Nao inventar descarte do perfil
   financeiro global nem equivalencia entre progressao marginal e total.

Separar comportamento atual verificado de requisitos ainda nao entregues.
IMP-01 e uma rodada posterior: nao iniciar importacao de vendas agora.

## Conclusao

Entregar relatorio com resumo, contratos, plano, arquivos, testes e bloqueios.
Permanecer em HOLD para implementacao ate consolidacao do Codex e aprovacao
das decisoes aplicaveis. Relatorio nao significa tarefa funcional concluida.
Gadotti permanece no Lite; bancos seguem separados; migracao nao autorizada.
