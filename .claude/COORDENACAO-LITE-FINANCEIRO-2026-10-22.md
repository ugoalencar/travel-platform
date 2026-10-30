# Coordenacao Travel Lite financeiro e CEP

Data: 2026-10-22.
Checkout inspecionado: D:/travel-platform.
Branch observada: wip/organizacao-2026-10-20. Nao e main.
Estado inicial observado: sem alteracoes no git status --short.

## Objetivo e limites

Preparar evolucao local do Travel Lite: motor de comissoes, aprovacoes de
alteracoes de vendas, controle salarial e consulta de CEP. Usuario encaminhara
os prompts aos agentes; este documento nao representa tarefas ja despachadas.
Nenhum deploy, acesso a banco remoto, migracao, leitura de .env, instalacao,
commit, push ou alteracao de main esta autorizado por este pacote.

Primeira rodada em paralelo: auditoria e especificacao, somente documentos
nos caminhos de cada agente. Implementacao depende da consolidacao do desenho
e aprovacao do usuario. Nao modificar arquivos fonte ou iniciar worktrees nesta
rodada. Nao executar suites Docker compartilhadas em paralelo.

Os HOLD-PX1 antigos permanecem intactos. Os novos prompts liberam apenas a
atividade documental descrita abaixo; nao liberam os trabalhos antigos.

## Responsabilidades e arquivos exclusivos

- Codex: desenho do motor de comissoes, perfil financeiro da agencia,
  aprovacao de vendas, seguranca e integracao entre frentes. Somente este
  arquivo nesta rodada; fonte, schema e interfaces compartilhadas reservados
  para a implementacao consolidada.
- Claude: leitura do Full e do Lite para especificar controle salarial.
  Entrada: .claude/NEXT-PROMPT-LITE-FOLHA-2026-10-22.md.
  Saida exclusiva: .claude/RELATORIO-LITE-FOLHA-2026-10-22.md.
- OpenCode: leitura do cadastro de clientes e pesquisa de CEP em fontes
  oficiais. Entrada: .opencode/NEXT-PROMPT-LITE-CEP-2026-10-22.md.
  Saida exclusiva: .opencode/RELATORIO-LITE-CEP-2026-10-22.md.

Nenhum agente edita o relatorio do outro, este coordenador, arquivos globais,
lockfiles, migracoes, inicializacao da API ou catalogo de permissoes.
Se surgir dependencia compartilhada, registrar proposta no proprio relatorio.
Ao concluir, permanecer em HOLD para implementacao ate consolidacao.

## Decisoes informadas pelo usuario

### Regras de comissao

Varias regras por vendedor, categoria e vigencia. Linha inicial com valor
padrao, percentual ou fixo; progressividade opcional revela os campos
necessarios para faixas, metas e incrementos. Aplicacao sobre o total por
padrao; aplicacao sobre excedente selecionavel. Incremento de 3% para 4%
significa um ponto percentual. Nao interpretar como aumento relativo de 1%.

Cada revisao deve registrar data de inicio da vigencia, data da revisao e
autor. Retroatividade exige previa dos afetados e das diferencas, motivo,
confirmacao explicita, reautenticacao e trilha de auditoria. Preservar regra
e calculo originais. Pagamentos anteriores nao serao sobrescritos; ajustes
devem ter lancamentos rastreaveis. O desenho devera tratar tambem obrigacoes
aprovadas, periodos fechados, cancelamentos, concorrencia e idempotencia.

### Forma de pagamento e configuracao geral

Por padrao, a venda confirmada gera a comissao conforme o ciclo existente.
Uma forma de pagamento pode exigir baixa efetiva do recebimento. Cartao,
Pix ou boleto nao impoem automaticamente esse comportamento: e configuracao.
O desenho apresentado inclui liberacao proporcional ou apos quitacao; deve
explicitar a politica de parcelas, estornos e recebimentos parciais antes de
implementar. Nao tratar vencimento de boleto como recebimento.

DECISAO MAIS RECENTE: o efeito dessa exigencia sobre as metas e uma escolha
GERAL do perfil financeiro da agencia, nunca uma excecao por vendedor,
regra, venda ou usuario individual. Campo proposto, ainda sem contrato de API:

- META_E_LIBERACAO: a exigencia de recebimento da forma de pagamento afeta
  tanto o momento/valor elegivel para a meta como a liberacao da comissao.
- SOMENTE_LIBERACAO: as metas acompanham vendas confirmadas; a exigencia
  afeta apenas a disponibilidade da comissao para aprovacao.

O cadastro de forma de pagamento continua definindo SE ha exigencia de
recebimento. O perfil financeiro define globalmente O QUE essa exigencia
afeta. Nao criar override por linha para essa escolha geral.
Alteracao dessa escolha requer vigencia, impacto e auditoria; nao deve mudar
silenciosamente periodos ou comissoes existentes.

Pontos ainda a consolidar: periodo de meta e datas de competencia, tratamento
das vendas que atravessam faixas ou meses, arredondamentos monetarios,
acumulacao de bonus, teto e conflitos entre regras. Nao inventar respostas
como se ja tivessem sido aprovadas.

### Aprovacoes comerciais

Cancelamentos e alteracoes de produto vendido entram em solicitacoes.
Administradora da AGENCIA aprova/rejeita; pode delegar ao gerente por
permissoes explicitas. Nao confundir com superadmin global da plataforma.
Antes de aprovar, nada muda em venda, recebiveis, comissao ou financeiro.
Reautenticacao usa credencial propria do aprovador autorizado, nao senha
compartilhada da Patricia. Validacao e autorizacao no backend, isolamento
por tenant, motivo, antes/depois, solicitante, aprovador e timestamps.
Tratar venda modificada enquanto a solicitacao esta pendente e impedir
execucao repetida da mesma aprovacao.

### Controle salarial

Usuario solicitou fechamento de folha no Lite para visibilidade de custos
totais. Verificar e aproveitar conceitos do Full sem importar sua
infraestrutura nem acoplar os produtos. Propor folha GERENCIAL por competencia,
nao presumir folha legal, eSocial, calculos tributarios ou trabalhistas.
Salario, comissao, bonus, encargos e descontos devem ter origem rastreavel.
Comissao nao pode ser despesa ou pagamento duplicado por aparecer na folha.
Salarios requerem permissoes e visibilidade especificas; ser gerente nao
concede automaticamente acesso a remuneracao de toda a equipe.

### CEP

Usuario pediu consulta de CEP brasileiro para preencher endereco. Hoje o
campo do Lite e manual. Correios tem API oficial com contrato/servico e token;
nenhum acesso contratado foi confirmado. Nao anunciar consulta oficial
funcionando nem escolher outro provedor silenciosamente.
Numero/complemento manuais; rua/bairro/cidade/UF editaveis; falhas nao podem
impedir cadastro manual; nao sobrescrever alteracoes recentes ou resposta de
CEP antigo. Nao enviar dados pessoais de clientes a provedores.

## Evidencia inicial de codigo

- services/api-lite/src/routes/sales.ts: regra do vendedor lida na
  confirmacao; grava rule_snapshot em seller_commissions.
- services/api-lite/src/routes/commissions.ts: aprovacao gera payable;
  pagamento ligado a obrigacao financeira.
- apps/travel-lite/src/pages/CustomersPage.tsx: zip_code e endereco manuais.
- services/api/src/payroll.ts: generatePayrollEntry, approvePayrollEntry e
  payPayrollEntry; referencia do Full, nao contrato do Lite.
- apps/agency/src/pages/PayrollPage.tsx: tela de comissoes/folha existente.
- apps/agency/src/pages/DrePage.tsx: folha apresentada separada das comissoes
  com explicacao de evitar dupla contagem.

## Proxima consolidacao

Receber os dois relatorios, separar fatos de propostas e pendencias, aprovar
o desenho com o usuario e produzir especificacoes/ADRs oficiais nos caminhos
do repositorio. Definir contratos compartilhados e ordem das migracoes antes
de liberar agentes para codificar em checkouts isolados. A rodada local de
validacao nao autoriza a publicacao online. Depois da aprovacao funcional,
consolidar principio reutilizavel para outros sistemas, sem refatoracao
multissistema antecipada.

## Recebimento e revisao Codex do relatorio Claude

Relatorio recebido: .claude/RELATORIO-LITE-FOLHA-2026-10-22.md.
Conferido nesta rodada por leitura de fonte; nenhum teste executado e nenhum
defeito observado em dados reais. Claude entregou auditoria/especificacao,
nao implementacao. Seu arquivo nao foi alterado pelo Codex.

Pontos confirmados no checkout atual:

- Full payroll.ts: generatePayrollEntry inclui comissoes APPROVED/PAYABLE/PAID
  no liquido; payPayrollEntry cria payable OPEN e escreve folha PAID. Esse
  ciclo nao deve ser copiado para o Lite.
- Lite routes/cash-flow.ts: pagamento define corretamente payable PAID ou
  PARTIALLY_PAID, mas o bloco de commission_id tenta marcar comissao PAID
  independentemente da quitacao. Corrigir com teste de pagamento parcial antes
  de depender desse estado na folha.
- Lite routes/cash-flow.ts: POST /payables aceita commission_id. Necessario
  validar o caminho unico e as restricoes antes da nova integracao da folha.
- Lite audit-log.ts: falha de insercao de auditoria e recuperada por savepoint
  e nao impede operacao. Eventos financeiros sensiveis precisam de desenho
  de auditoria obrigatoria com rollback, sem mudar silenciosamente todas as
  outras operacoes.
- Busca nos testes Full por PayrollEntry/generatePayrollEntry/
  approvePayrollEntry/payPayrollEntry/payroll-entries nao encontrou cobertura
  direta. Isso nao prova ausencia de todo teste indireto.

Ajustes necessarios na proposta Claude antes de virar contrato aprovado:

1. A unicidade da referencia na folha nao pode se limitar a commission_id em
   todos os cenarios: liberacao proporcional e ajustes podem ocorrer em
   competencias distintas. Propor identificador unico de lancamento/evento
   de reconhecimento ou liberacao, mantendo commission_id como origem e
   impedindo dupla contagem/pagamento. Contrato final ainda nao aprovado.
2. Nao aceitar balance_amount = recognized - paid sempre >= 0 como invariante
   universal: retroatividade/cancelamento apos pagamento pode gerar credito
   da empresa ou recuperacao. Separar historico pago, saldo devido e ajustes
   a recuperar; nao truncar diferenca nem apagar pagamento anterior.
3. Politica geral de efeito do recebimento, data de reconhecimento, periodo
   da meta e data da baixa sao conceitos distintos. A escolha geral ja foi
   solicitada como campo configuravel; nao pedir novamente uma escolha fixa
   por vendedor nem inferir competencia somente de created_at/aprovacao.
4. MASTER da agencia com acesso integral ja e requisito do usuario. Nao
   reabrir essa decisao. Permissoes delegaveis e leitura salarial precisam
   respeitar a concessao explicita e a semantica real de master_only; nenhum
   gerente recebe salarios de toda a equipe por simples hierarquia.
5. Separacao de preparador e aprovador e sugestao, nao exigencia aprovada;
   nao impedir Patricia de operar sozinha por um padrao novo nao solicitado.
6. Proposta recomendada, ainda sujeita a aceite: folha mostra salario,
   adicionais, descontos e comissoes em demonstrativo unico; comissoes mantem
   obrigacao propria, e liquido da folha exclui comissoes ja tratadas no
   contas a pagar. Interface deve explicitar remuneracao total, pagamentos
   separados e saldo, evitando interpretar o liquido salarial como total
   geral de remuneracao.

O relatorio do OpenCode tambem esta presente. Apenas leitura inicial feita
nesta rodada; nao confundir recebimento do arquivo com revisao completa.
As frentes permanecem em HOLD de implementacao ate consolidacao e aceite do
desenho. Nenhuma migracao ou mudanca de codigo foi liberada nesta revisao.

## Revisao Codex do relatorio OpenCode

Relatorio lido integralmente: .opencode/RELATORIO-LITE-CEP-2026-10-22.md.
Conferidos o input manual em CustomersPage.tsx e a assimetria de validacao
POST/PATCH em routes/customers.ts. Fontes Correios e ViaCEP consultadas
novamente nesta rodada. Nenhum teste ou consulta a dados de cliente executado.

Desenho tecnicamente adequado como base: consulta no backend, endereco de
provedor fixo, autenticacao/autorizacao, timeout, limite de consultas, resposta
validada, protecao contra respostas antigas e manutencao do cadastro manual.
Nao requer nova dependencia nem migracao para preencher os campos existentes.

Ajustes antes da implementacao:

- Escolha do provedor exige aceite humano. Correios exige contrato com o
  servico e credenciais; ViaCEP e alternativa gratuita de terceiro, nao API
  oficial dos Correios. Nenhum provedor esta aprovado nesta etapa.
- O tipo de CEP nao basta para concluir que uma resposta nao tem logradouro.
  Normalizar os campos efetivamente presentes, preservando resposta parcial;
  nao descartar rua valida por uma classificacao simplificada. Endpoint e
  taxonomia Correios precisam de contrato confirmado antes de implementar.
- Nao registrar CEP bruto ligado a usuario/cliente nos logs por padrao. Log
  operacional precisa apenas de provedor, status, duracao e correlacao tecnica
  sem identificadores pessoais. O fato de enviar somente CEP nao autoriza
  afirmar ausencia absoluta de risco de privacidade.
- Definir um contrato coerente para not_found e generic; o documento mistura
  not_found em HTTP 200 com erro HTTP 404. Proposta: sucesso e resposta parcial
  200, inexistente 404, entrada invalida 400, falha de provedor 502/503/504
  conforme categoria. Nao expor corpo remoto, token ou detalhes internos.
- CEP deve coincidir com o solicitado e UF deve pertencer ao conjunto valido;
  validar tamanho do corpo remoto e limitar cache para evitar crescimento
  ilimitado. Nao normalizar letras removendo-as e aceitar um CEP diferente.
- Apertar validacao deve preservar edicao de clientes legados: distinguir CEP
  novo/alterado de valor antigo sem mudanca. Nao impedir toda edicao de cliente
  por um CEP legado nem alterar importacao em massa nesta rodada.
- Nao exigir rua e bairro simultaneamente para considerar resposta util:
  campos ausentes precisam de preenchimento parcial, sem apagar dados manuais.

Pendencias humanas ativas: aceite da fonte CEP e aceite do desenho salarial
com obrigacoes de comissao separadas. Parametros tecnicos de timeout/cache e
rate-limit serao documentados como configuracao, nao novas regras de negocio.
Ambas as entregas sao especificacoes; nenhuma funcionalidade foi instalada.

## Liberacao CEP pelo usuario

Em 2026-10-22 o usuario respondeu "pode continuar e pode usar o via cep".
Isso libera a implementacao e o teste LOCAL do desenho de CEP com ViaCEP.
Codex executa essa frente; nao ha tarefa de fonte simultanea para OpenCode.
Plano: docs/superpowers/plans/2026-10-22-lite-cep.md.
Decisao: docs/adr/ADR-CEP-001-travel-lite-viacep.md.
Nao e autorizacao de deploy, migracoes, compra ou alteracoes no Full.
As partes acima descrevem o estado na data de cada revisao; a implementacao
local de CEP as sucede, sem significar entrega de folha ou comissoes.
