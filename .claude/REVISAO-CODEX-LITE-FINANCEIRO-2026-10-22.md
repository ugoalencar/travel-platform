# Revisao Codex - Travel Lite financeiro

Data: 2026-10-22
Checkout: D:\travel-platform
Branch: wip/organizacao-2026-10-20
Entrada: .claude/RELATORIO-CODEX-LITE-FINANCEIRO-2026-10-22.md

## Veredito: NO-GO

O estado local revisado nao esta pronto para publicacao. Foram reproduzidos
problemas de interface, consistencia financeira e autorizacao. Nao foi feito
deploy, commit, push, acesso a banco remoto ou migracao de producao.
Esta revisao nao altera a implementacao do Claude nem corrige os problemas.
Os achados descrevem o estado atual, nao necessariamente regressões introduzidas
nesta entrega.

## Achados

### 1. P1 - Detalhe da venda derruba a interface

- Frontend: apps/travel-lite/src/pages/SalesPage.tsx:405 e :432.
- API: services/api-lite/src/routes/sales.ts:542, serializeSale em :73.
- A interface acessa detail.sale.customer.name e outros objetos relacionados.
  A resposta do detalhe retorna customer_id, mas nao o objeto customer.
  O serializador da listagem monta esses relacionamentos; o do detalhe nao.
- Reproducao real no Chrome: login, criacao de regra progressiva, criacao de
  venda pela interface. POST retorna 201; GET do detalhe retorna 200 sem
  customer; ocorre TypeError e a tela de vendas fica em branco.
- Impacto: o usuario nao consegue concluir o ciclo de venda pela interface.
- Necessario: alinhar o contrato de detalhe e cobrir criacao, abertura e
  confirmacao pela interface com teste de regressao.

### 2. P1 - Override de comissao aprovada permite pagamento acima do devido

- services/api-lite/src/routes/commissions.ts:234-245.
- services/api-lite/src/routes/cash-flow.ts:450-484.
- A alteracao aceita comissao APPROVED e modifica commission_amount, mas nao
  reconcilia a obrigacao financeira ja criada. Tambem substitui rule_snapshot
  por flags manuais, perdendo a memoria original do calculo nesse campo.
- Reproducao: venda de R$ 1.000,00, comissao de 10% = R$ 100,00; aprovar;
  ajustar para R$ 50,00; pagar. Override e pagamento retornam HTTP 200.
  Resultado: comissao de R$ 50,00, obrigacao de R$ 100,00, R$ 100,00 pagos,
  status PAID. Caso usa liberacao ON_SALE.
- Necessario: garantir consistencia transacional entre comissao, obrigacao e
  pagamento; preservar rastreabilidade e usar ajustes para historico quitado.

### 3. P1 - Rota legada contorna a permissao de gerenciar regras

- services/api-lite/src/routes/commission-rules.ts:293, :341, :369.
- services/api-lite/src/routes/sellers.ts:317, :389; criacao em :266, :296.
- services/api-lite/src/commission-engine.ts:359.
- A API especifica exige commissions.rules_manage. A edicao de vendedor
  exige apenas sellers.manage e chama mirrorSellerRule, criando uma versao.
- Reproducao: gerente de teste com revogacao explicita de rules_manage recebe
  HTTP 403 na rota de versoes. PATCH legado do vendedor recebe HTTP 200 e
  cria versao 2 com percentual 99.
- Necessario: aplicar a autorizacao especifica a todos os caminhos que
  escrevem regras, inclusive compatibilidade legada, com auditoria.

### 4. P1 - Estorno do recebimento nao gera recuperacao da comissao paga

- services/api-lite/src/finance.ts:340-366, calculo de liberacao.
- Reproducao: venda ON_RECEIPT, receber integralmente, pagar R$ 100,00 de
  comissao e estornar os recebimentos do cliente.
- Resultado: liberado R$ 0,00, pago R$ 100,00, comissao ainda PAID; nao existe
  tabela commission_adjustments no esquema testado. Nao foi observado um
  fluxo de recuperacao correspondente. O proprio relatorio adia essa fase.
- Necessario: registrar ajuste compensatorio/recuperacao ou bloquear com
  seguranca a operacao sem tratamento. Nao apagar o historico pago.

### 5. P2 - Arredondamento progressivo diverge da memoria de calculo

- services/api-lite/src/commission-engine.ts:199 e :211.
- O total arredonda a soma de parcelas ainda nao arredondadas. O snapshot
  arredonda cada parcela separadamente.
- Reproducao: base R$ 1,00; duas faixas de R$ 0,50 a 1% cada.
  Comissao final R$ 0,01; soma das parcelas registradas R$ 0,02.
- Necessario: politica unica de arredondamento ou ajuste explicito que permita
  reconciliar o total com a memoria de calculo.

## Escopo ainda pendente

O relatorio do Claude declara como nao implementados no Lite:

- Folha salarial/fechamento gerencial.
- Fila de aprovacao para cancelamento e alteracao de produto vendido.
- Revisao retroativa com previa, reautenticacao e ajustes.
- Bonus por meta, teto e recuperacao negativa.

Cancelamento segue como operacao direta em
services/api-lite/src/routes/sales.ts:701, protegido por permissao, mas sem a
fila de aprovacao solicitada. Correcao de folha no Full nao entrega folha no Lite.

A escolha financeira global solicitada nesta conversa precisa ser reconciliada
com a especificacao atual, que a descarta e considera metas na confirmacao.
O relatorio menciona aprovacao posterior em outra conversa; essa aprovacao nao
foi verificada nesta revisao. Nao restaurar nem descartar a escolha por suposicao.

docs/adr/ADR-LITE-COMMISSION-001-motor-de-comissoes.md:3 ainda esta como Proposta.
A especificacao tambem mistura cabecalho de nao implementado com secoes de
implementacao. Consolidar decisao e escopo antes de declarar entrega completa.

## Testes executados

| Verificacao | Resultado |
| --- | --- |
| Suite completa API Lite | 220 passaram; 2 falharam; 25 arquivos |
| Suite completa frontend Lite | 128 passaram; 10 arquivos |
| Full: financial.test.ts + financial-http.test.ts | 19 passaram; 2 arquivos |
| Typecheck API Lite, frontend Lite, API Full e agency | Passou |
| Lint nos mesmos quatro workspaces | Passou com avisos |
| Build nos mesmos quatro workspaces | Passou com avisos de tamanho de bundle |
| Diagnostico independente HTTP/DB/Chrome | 3 passaram; 4 falharam |
| git diff --check | Passou |

As duas falhas da suite oficial Lite sao expectativas de mensagens em ingles
contra respostas em portugues: tests/catalog.test.ts:86 e
tests/customers.test.ts:56. As traducoes ja existem no HEAD; a inconsistencia
precede o trabalho nao commitado, mas a suite atual nao esta integralmente verde.

Os quatro testes independentes que falharam verificam: detalhe de venda pela
interface, override com sobrepagamento, desvio de permissao e arredondamento.
O teste de estorno registra a inconsistencia como observacao; seu sucesso nao
significa que o comportamento financeiro seja seguro.

## O que funcionou nos cenarios testados

- Por HTTP real: venda, calculo, recebimento, liberacao proporcional, aprovacao,
  pagamento parcial e quitacao de comissao; duplicidade de pagamento rejeitada.
- Viewer bloqueado, recurso de outra agencia retornando 404 e isolamento RLS
  entre as duas agencias sinteticas nos casos exercitados.
- No navegador: login, criacao de regra progressiva e aprovacao de comissao
  de venda criada pela API. Essa verificacao restrita passou em desktop e
  mobile de 390px, sem overflow horizontal de pagina observado.
- O teste ampliado criando a venda pela interface NAO passou. Portanto nao ha
  aprovacao do ciclo completo do navegador.

## Ambiente e reproducao

Fixtures descartaveis: travel-lite-postgres-test, 127.0.0.1:55600,
banco travel_lite_test. API Fastify real em porta local efemera.
Chrome acessou Vite em 127.0.0.1:5181/tenant-a; apenas /api foi encaminhado
para a API real de teste. Nao foram simuladas respostas financeiras.
Dados e usuarios sao sinteticos; Patricia e contas reais nao foram usados.

Artefatos locais ignorados pelo Git:

- .tmp/lite-financial-audit.config.ts
- .tmp/lite-financial-audit.test.ts
- .tmp/lite-financial-audit-observations.json
- .tmp/financial-audit-desktop.png e financial-audit-mobile.png
- .tmp/financial-audit-browser-failure.png

Com LITE_TEST_ADMIN_URL e LITE_TEST_RUNTIME_URL apontando exclusivamente para
o banco descartavel acima, a reproducao independente usa:

```powershell
npx vitest run --config .tmp/lite-financial-audit.config.ts
```

Nao executar essa fixture contra banco com dados a preservar: ela reinicializa
o esquema de teste. Os screenshots desktop/mobile mostram o fluxo restrito;
o screenshot browser-failure mostra a falha do fluxo ampliado.

## Condicoes para nova avaliacao de publicacao

1. Corrigir e adicionar regressao para os cinco achados.
2. Decidir explicitamente o escopo pendente e reconciliar especificacao/ADR.
3. Ter suite oficial verde e repetir o ciclo completo pela interface.
4. Revisar separadamente os artefatos Full e Lite: migracoes Lite 008-011 e
   Full 099 pertencem a esquemas distintos; nao aplicar indiscriminadamente.
5. Somente com autorizacao, validar ambiente de destino, backup, preflight de
   unicidade, configuracao privada, migracoes, saude HTTPS e login no hosting.

Nao foram verificados nesta etapa configuracao remota, TLS, plano contratado,
backup remoto, duplicidades no banco real ou aplicacao das migracoes online.
Build local e testes locais nao comprovam prontidao do ambiente publicado.
