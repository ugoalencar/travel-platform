# Vistoria de paridade funcional Full / Lite

Data: 2026-10-23. Branch verificada: `wip/organizacao-2026-10-20`.
Base: codigo local, incluindo alteracoes ainda nao commitadas. Nao e uma
certificacao de producao nem uma confirmacao de quais alteracoes estao online.

## Parecer

**Ha discrepancias: o Lite nao e atualmente um subconjunto funcional
comprovado do Full.** Foram identificados nove pontos de nao equivalencia
nos fluxos examinados. Nao sao nove modulos inteiros ausentes: comissoes,
financeiro, relatorios, clientes, dashboard e importacoes existem no Full,
mas alguns recursos e regras avancaram apenas no Lite.

A diretriz [DEC-007](../decisions/DEC-007-full-first-lite-parity.md) passa a
exigir Full primeiro. A regularizacao do legado nao foi implementada nesta
vistoria; nao remover funcionalidades ou dados do Lite.

## Diferencas comprovadas no codigo examinado

### 1. Comissao progressiva e sobre excedente - prioridade alta

Lite: `services/api-lite/src/commission-engine.ts:159` calcula faixas sobre
acumulado mensal, divide a venda que cruza faixas e aceita excedente nas
regras nao progressivas. `apps/travel-lite/src/pages/CommissionRulesPage.tsx`
oferece a configuracao e `routes/sales.ts:334` executa o motor ao confirmar.

Full: `services/api/src/commissions.ts:210` calcula apenas percentual sobre
venda, percentual sobre margem ou valor fixo; o ramo default rejeita outros
tipos. `apps/agency/src/pages/CommissionPlansPage.tsx:31` declara
`TIERED_TARGET` com `supported: false`. Ter o tipo cadastravel nao significa
que haja motor de metas funcionando. A comissao por produto do Full tambem
calcula percentual ou fixo (`services/api/src/employee-commissions.ts:327`).

### 2. Heranca de regras e revisoes append-only - prioridade alta

Lite: `services/api-lite/src/commission-engine.ts:79` resolve vendedor +
categoria, vendedor, padrao da agencia + categoria e padrao da agencia;
`appendRuleVersion` em `:306` grava revisoes com motivo e vigencia.

Full: `services/api/src/employee-commission-rules.ts:40` exige funcionario e
produto. O Full ja preserva historico por novas regras/vigencia e snapshots;
nao foi encontrado o mesmo mecanismo de defaults hierarquicos e revisoes
append-only do Lite. Nao classificar preservacao historica como ausente.

### 3. Liberacao de comissao por recebimento - prioridade alta

Lite: `services/api-lite/src/routes/sales.ts:327` congela `ON_SALE` ou
`ON_RECEIPT` conforme `payment_methods.requires_receipt`;
`services/api-lite/src/finance.ts:393` calcula o valor proporcional liberado.
Ha protecao contra estorno que deixaria comissao paga acima do liberado.

Full: `services/api/src/commissions.ts` aprova/gera contas a pagar e
`services/api/src/financial.ts` registra pagamentos, mas nao foi encontrado
controle equivalente de compensacao da venda limitando o pagamento da
comissao. A existencia de baixas financeiras nao prova essa equivalencia.

### 4. Permissoes concedidas/revogadas por usuario - prioridade alta

Lite: `services/api-lite/src/access.ts:121` combina defaults por papel com
`GRANT`/`REVOKE` por usuario; `services/api-lite/src/routes/users.ts:396`
permite configurar overrides com limites de delegacao.

Full: `services/api/src/permission-restrictions.ts:1` restringe por papel e
somente retira permissoes da hierarquia base; nao concede novos privilegios
individualmente. O mecanismo do Lite nao e apenas outra tela do mesmo RBAC.
Qualquer convergencia deve preservar o comportamento fail-closed do Full.

### 5. Importacao de vendas e conciliacao por linha - prioridade alta

Lite: `services/api-lite/src/routes/imports.ts:502` permite vincular/criar
cliente, corrigir ou ignorar linha; `:671` importa vendas a partir dos
registros conciliados. Existe estado `UNLINKED` para cliente nao resolvido.

Full: `services/api/src/import/types.ts:28` enumera CUSTOMER, SUPPLIER,
EMPLOYEE, TAG, WISH, OFFER e PROPOSAL, sem SALES. O centro de importacao
generico existe, mas nao equivale a esse fluxo de vendas do Lite.

### 6. Backup operacional criptografado na interface - prioridade alta

Lite: `apps/travel-lite/src/pages/SettingsPage.tsx:481` inclui BackupSection;
`services/api-lite/src/routes/backup.ts:34` exporta mediante reautenticacao e
senha de arquivo; `tenant-backup.ts` implementa criptografia do snapshot.

Full: nao foram localizados painel e endpoints equivalentes em
`apps/agency/src` e `services/api/src`. Rotinas administrativas de backup de
infraestrutura nao equivalem ao autosservico por agencia. No Lite, o proprio
endpoint de status retorna backup automatico nao configurado: nao contar
backup diario como funcionalidade pronta nem restauracao self-service.

### 7. Consulta CEP e preenchimento de endereco - prioridade media

Lite: `apps/travel-lite/src/CustomerCepField.tsx:46` consulta
`/cep/lookup`; `services/api-lite/src/routes/cep.ts:8` implementa o endpoint,
com provedor ViaCEP em `cep.ts`. O campo e integrado ao cadastro de cliente.

Full: `services/api/src/customers.ts` aceita endereco estruturado em JSON,
mas nao foi localizada consulta ViaCEP ou equivalente no cadastro de cliente
de `apps/agency/src`. Campo CEP de funcionario nao e busca de endereco.

### 8. Dashboard configuravel por agencia - prioridade media

Lite: `services/api-lite/src/routes/dashboard.ts:310` persiste ordem e
habilitacao de widgets; `apps/travel-lite/src/pages/DashboardPage.tsx:124`
oferece editor e a API filtra dados conforme acesso.

Full: `apps/agency/src/pages/DashboardPage.tsx` renderiza paineis definidos
no componente; nao foi localizado editor persistido equivalente no backend
Full. Ter dashboard e graficos em ambos nao elimina esta diferenca.

### 9. Download CSV dos relatorios - prioridade media

Lite: `services/api-lite/src/routes/reports.ts:28` trata `format=csv`;
`apps/travel-lite/src/pages/ReportsPage.tsx:100` inicia o download.

Full: `services/api/src/routes/reports.ts:40` entrega relatorios JSON;
`apps/agency/src/pages/ReportsPage.tsx` e `DetailedReportsPage.tsx` nao
oferecem exportacao equivalente. Esta conclusao e sobre CSV: nao confundir
com impressao/PDF pronto, que nao foi comprovado nesses fluxos.

## Funcoes existentes no Full que nao devem ser reinventadas

- Regras por funcionario/produto, percentual ou fixo, vigencia, snapshot e
  consulta de comissoes proprias: `employee-commission-rules.ts`,
  `employee-commissions.ts`, `routes/commissions.ts` e
  `services/api/tests/employee-commission-rules.test.ts`.
- Contas a pagar/receber, baixas e relatorios financeiros:
  `services/api/src/financial.ts` e `routes/financial.ts`.
- Folha, salario e descontos: `services/api/src/payroll.ts`,
  `routes/commissions.ts` e `apps/agency/src/pages/PayrollPage.tsx`.
  Nao localizada rota/pagina de folha no Lite; e diferenca na direcao permitida
  pela nova diretriz, nao uma funcao exclusiva do Lite.
- Cadastro de clientes e centro de importacao generico ja existem no Full.

## Origem da divergencia

Os pontos de entrada sao independentes: `services/api/src/app.ts` registra
os modulos Full e `services/api-lite/src/app.ts:116` registra os modulos Lite.
As migrations tambem sao separadas. Os recursos novos do Lite nao aparecem
automaticamente no Full. Isso explica a possibilidade de divergencia, mas
nao obriga uma fusao arquitetural sem analise e ADR.

## Verificacao realizada e limites

- Leitura cruzada de menus, rotas registradas, modelos, regras de calculo,
  telas e testes relacionados nos caminhos ativos, nao em dist/arquivos antigos.
- Testes puros executados sem iniciar fixture de banco:
  `npm.cmd run test --workspace=@travel-platform/api-lite -- tests/commission-rules.test.ts tests/commission-progressive.test.ts -t "calculateCommission"`.
- Resultado: **9 aprovados, 15 ignorados pelo filtro; 2 arquivos aprovados**.
  Os testes de integracao foram intencionalmente excluidos; nao houve reset
  de banco, migration, leitura de .env ou acesso online nesta vistoria.
- Nao houve teste de ponta a ponta de todos os fluxos, auditoria de seguranca
  completa ou validacao de paridade monetaria entre os dois motores. Ausencia
  indicada significa equivalente nao encontrado nos caminhos examinados.
- Folha Lite, aprovacao de cancelamentos e reprocessamento retroativo nao
  sao considerados prontos apenas porque foram pedidos ou documentados.

## Regularizacao proposta, ainda nao executada

1. Evoluir o dominio de comissoes Full existente para absorver faixas,
   excedente, defaults/revisoes e liberacao por recebimento, com contratos e
   casos numericos comuns aos dois produtos e preservacao do historico.
2. Planejar delegacao por usuario no Full sem enfraquecer RBAC e isolamento.
3. Incorporar importacao de vendas e backup operacional ao Full.
4. Levar CEP, configuracao de dashboard e CSV ao Full, reaproveitando padroes.
5. Validar cada entrega primeiro no Full e depois o recorte Lite. Nenhum
   deploy ou migracao e autorizado por esta lista.
