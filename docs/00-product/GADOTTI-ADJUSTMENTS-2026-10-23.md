# Ajustes Gadotti: proxima etapa apos alinhamento Full / Lite

Estado: **aguardando conclusao e validacao do alinhamento**.
Recebido em 2026-10-23. Fonte original, preservada sem reescrita:
[AJUSTES-23-10-2026-GADOTTI.MD](../AJUSTES-23-10-2026-GADOTTI.MD).

## Sequencia obrigatoria

1. Concluir os itens aplicaveis do [plano de alinhamento](FULL-LITE-ALIGNMENT-PLAN.md),
   corrigir os bloqueios e comprovar equivalencia funcional Full/Lite.
2. Consolidar estes ajustes em especificacoes, esclarecer regras ambiguas e
   aprovar desenho e testes antes de implementar.
3. Implementar e validar primeiro no Full; depois disponibilizar no Lite.
4. Validar localmente com o usuario. Deploy, migrations e qualquer operacao
   na Gadotti online exigem autorizacao especifica.

Receber este documento nao libera implementacao antecipada. Tambem nao
autoriza migrar a Gadotti para o Full nem alterar suas credenciais.

## Frentes registradas a partir da fonte

| Frente | Necessidade a especificar |
| --- | --- |
| Selecao de cliente na venda | Autocomplete por nome e busca ao colar CPF, respeitando permissoes e sem expor clientes fora do escopo |
| Configuracao de cadastro | Administrador habilita/desabilita campos de cliente e define obrigatoriedade; preservar campos obrigatorios de integridade/seguranca |
| Produto, fornecedor e categoria | Vincular produto ao fornecedor e configurar bases/regras de receita da agencia; formularios de venda configuraveis conforme categoria |
| Condicoes de pagamento | Parcelas, parcela minima, entrada obrigatoria e vencimento relativo ao embarque, com valores configuraveis |
| Baixas e saldos | Registrar pagamentos parciais, reconciliar saldo e refletir a quitacao sem depender de parcelas rigidas para todo caso |
| Receita/comissao da agencia | Percentual sobre total ou componentes elegiveis, ou fixo por passageiro; prever direito, liberacao e recebimento efetivo |
| Comissao do funcionario | Regra distinta da receita da agencia, com vinculo rastreavel, sem misturar credito da agencia com obrigacao ao funcionario |
| Quitacao e recebimento de comissao | Configurar recebimento por pacote quitado, lotes ou janelas; distinguir cartao, parcelamento do viajante e liquidacao real do fornecedor |
| Relatorios/projecoes | Filtros e previsoes de recebimento, saldos, fornecedores e comissoes, incluindo data da venda, origem e destino |
| Organizacao da configuracao | Abas identificadas para configurar regras e selecionar na venda quais serao aplicadas, sem hardcode para Gadotti |

## Exemplos de negocio a preservar, nao generalizar

- Excursao de R$ 1.000,00: cartao em ate 10 vezes, parcela minima de R$ 100,00.
- Na alternativa parcelada por boleto/Pix: entrada de 30%, saldo de R$ 700,00
  com pagamentos parciais e limite de quitacao 15 dias antes do embarque.
- Comissao da agencia de 7% nesse exemplo, vinculada a quitacao, com regra
  especifica a esclarecer para cartao tratado comercialmente como a vista.
- Outros exemplos: fixo por passageiro em onibus intermunicipal; cruzeiro
  com base somente nas taxas mencionadas; aereo com varios fornecedores e
  percentuais distintos. Confirmar componentes e contratos antes de calcular.

Esses valores sao exemplos informados pelo usuario, nao defaults aprovados
para todos os clientes, exigencias legais ou comprovacao de fluxo financeiro.

## Pontos para a especificacao posterior

- Separar valor bruto vendido/meta, componentes do pacote, receita da agencia,
  repasse ao fornecedor e comissao de funcionario; evitar dupla contagem.
- Definir evento de direito, disponibilidade e liquidacao da receita da
  agencia, sem presumir que aprovacao de cartao significa dinheiro recebido.
- Esclarecer calendario, lotes, janelas, estornos/cancelamentos, inadimplencia,
  alteracoes de embarque e efeito de mudancas de regra em vendas existentes.
- Investigar campos de venda por modalidade em fontes primarias de turismo,
  como solicitado na fonte, e confrontar com os formularios Full existentes.
  **Pesquisa ainda nao realizada nesta etapa.**
- Incluir contratos compativeis com futura migracao entre bancos separados,
  snapshots historicos, autorizacao server-side, auditoria e testes de valores.

Nenhuma funcionalidade desta lista foi implementada ou homologada por este
registro. Os detalhes comerciais ainda nao definidos nao devem ser inventados.
