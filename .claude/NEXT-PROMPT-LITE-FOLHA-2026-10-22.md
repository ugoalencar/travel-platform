# Claude Controle salarial do Travel Lite

Leia D:/travel-platform/AGENTS.md, docs/AI_CONTEXT.md, QUALITY-GATES.md e
.claude/COORDENACAO-LITE-FINANCEIRO-2026-10-22.md antes de explorar.

## Missao desta rodada

Auditar o controle salarial/folha do Travel Platform Full e propor sua
adaptacao GERENCIAL ao Lite, integrada ao novo desenho de comissoes. O humano
solicitou dividir as tarefas e encaminhara este prompt pessoalmente.
Voce nao esta autorizado a implementar ainda: entregar especificacao com
evidencias para consolidacao e aprovacao antes da codificacao.

## Escopo de escrita exclusivo

Somente D:/travel-platform/.claude/RELATORIO-LITE-FOLHA-2026-10-22.md.
Nao editar este prompt, coordenacao, outros relatorios, codigo, testes,
migracoes, dependencias, .env, permisssoes ou arquivos globais.
Verificar cwd/branch/status; branch observada foi wip/organizacao-2026-10-20.
Se mudou, registrar o estado real sem checkout/reset/limpeza. Nao usar main
para alteracoes. Este prompt libera apenas analise e o relatorio; HOLDs
anteriores de implementacao continuam intactos para seus trabalhos antigos.

## Fontes iniciais de leitura

- services/api/src/payroll.ts e routes/commissions.ts.
- apps/agency/src/pages/PayrollPage.tsx, EmployeesPage.tsx, DrePage.tsx.
- packages/domain/types.ts e testes relevantes do Full.
- services/api-lite/src/routes/commissions.ts, payables.ts, payments.ts,
  sellers.ts; confirmar nomes reais e contratos antes de afirmar.
- Autorizacao, auditoria, financeiro e migracoes do Lite.
- ADRs e docs oficiais pertinentes; nao ler .env ou dados reais de salarios.

## Entrega obrigatoria

1. O que existe de fato no Full e no Lite, com arquivos e linhas verificadas.
   Distinguir funcionalidade implementada de texto ou mock de interface.
2. Proposta minima de folha mensal: salario-base, componentes adicionais,
   beneficios, bonus, descontos, adiantamentos e comissoes. Separar itens
   solicitados, conceitos existentes e propostas ainda nao aprovadas.
3. Ciclo de competencia: preparacao, revisao, aprovacao, obrigacao financeira,
   baixa e correcoes posteriores. Nao marcar PAID so por criar uma conta.
4. Modelo de vinculo entre funcionario, usuario e vendedor. Funcionarios
   sem login ou sem vendas tambem podem ter custo salarial; nao presumir que
   todos os usuarios sao funcionarios ou que todo vendedor e assalariado.
5. Contrato proposto de integracao com comissoes: origem, competencia,
   valor reconhecido, valor ja pago, saldo e identificadores unicos.
   Proibir nova comissao ou novo payable pelo mesmo direito ja contabilizado.
   Distinguir remuneracao bruta, liquido a pagar, despesas e fluxo de caixa.
6. Revisar criticamente a referencia Full: generatePayrollEntry soma
   comissoes APPROVED/PAYABLE/PAID; payPayrollEntry cria payable OPEN e marca
   folha PAID. Verificar implicacoes com o restante do fluxo e testes; nao
   copiar comportamento nem afirmar bug comprovado sem evidencias completas.
7. Isolamento por tenant, permissoes salariais separadas, auditoria,
   fechamento, bloqueio de alteracoes pagas, ajustes e concorrencia.
8. Plano de testes: fechamento repetido, ausencia de comissao duplicada,
   pagamento parcial/separado, estorno, periodo fechado, usuario sem
   permissao e tentativa de acesso a outra agencia. Usar cenarios sinteticos.
9. Lista exata de arquivos que uma implementacao futura precisaria alterar,
   dependencias do Codex e sequencia de integracao. Apenas PROPOR migracoes.
10. Perguntas de negocio realmente bloqueantes, alternativas e recomendacao.

## Limites financeiros

Nao criar calculos de INSS, FGTS, IRRF, ferias, 13o ou eSocial por suposicao.
Caso proponha requisitos legais, separar da folha gerencial e exigir
validacao especializada e fontes oficiais atuais. Nao coletar salarios reais.
Nao conceder acesso a salarios apenas porque um usuario e gerente.

## Encerramento

Relatorio com resumo, evidencias, proposta, riscos, testes e pendencias.
Sem implementar, instalar, executar migracoes, consultar banco remoto,
reiniciar ambiente em uso, commit, push ou deploy. Nao rodar suites com
Docker compartilhado em paralelo. Ao terminar, indicar caminho e HOLD para
implementacao. Nao enviar mensagens a outros agentes: o humano encaminhara.
