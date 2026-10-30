# Revisao Codex: CEP-01 e CSV-01

Data: 2026-10-23. Fonte: `RELATORIO-PARIDADE-FULL-LITE-2026-10-23.md`.
Ambos sao desenhos, nao evidencias de funcionalidades implementadas/testadas.

## CEP: desenho aceito com delimitacoes tecnicas

- Consulta server-side autenticada; papel AGENT+ como enderecos do Full.
  Adaptacao futura ao SEC-01 deve usar o mesmo direito de criar/editar endereco.
- Mapear `neighborhood` para `district` explicitamente, sem alterar schema.
- Flag `TRAVEL_API_CEP_PROVIDER`: producao so habilita com `viacep` explicito;
  `disabled` desabilita; valor desconhecido nao pode habilitar silenciosamente.
  Dev/test sem configuracao podem seguir o comportamento Lite, com fetch falso
  em testes. Nao editar .env nem configuracao online.
- Preferir erro tipado do provider com traducao restrita na rota; nao ampliar
  genericamente a exposicao de mensagens 5xx em `errors.ts` para esta frente.
- Nao mudar persistencia de CEP nesta primeira etapa: o parser de PATCH nao
  recebe o valor anterior. `normalizeCustomerCep(value, previous)` nao pode
  preservar legado se `previous` vier do cliente ou nao tiver sido carregado.
  Normalizar a consulta e manter o contrato de gravacao existente; validacao
  persistida mais estrita e etapa separada com contexto server-side correto.
- Garantir no-store tambem nas respostas dos hooks de autenticacao, nao apenas
  no handler de sucesso, e validar privacidade dos logs existentes.
- Preservar reconsulta, campos manuais e descarte de respostas antigas.
  Cobrir troca para CEP generico apos CEP com rua, alem do caso inicial.

## CSV: aprovar somente entrega incremental, nao paridade encerrada

Codex iniciou a camada API para `/reports/sales` e
`/reports/financial/cash-flow`, sem mudar queries, JSON ou permissoes.
Demais endpoints, botao UI e conteudo equivalente ainda nao foram entregues.
Agregado nao substitui venda detalhada; mensal nao substitui diario;
`groupBy=employee` nao comprova equivalencia ao relatorio de vendedores.
Essas lacunas e o escopo proprio do vendedor permanecem no backlog.

- Protecao de formula deve incluir whitespace antes de `=,+,-,@`, LF e BOM;
  numeros negativos reais continuam numericos. O regex proposto nao cobre
  todos esses casos; testes devem caracterizar cada caso.
- A ausencia de protecao no CSV Lite foi confirmada em
  `services/api-lite/src/routes/reports.ts:31`. Tratar como pendencia de
  seguranca priorizada, nao como melhoria estetica a esquecer. Backport local
  apos validar o comportamento Full, sem deploy automatico.
- Headers snake_case exigem mapeamento explicito das propriedades camelCase
  do Full; nao usar acesso por nome do header para serializar essas linhas.
- O serializer nao deve registrar formula, nome de cliente ou dados de CSV.
- Nao acrescentar todos os endpoints so por usarem o mesmo serializer;
  testar contratos e filtros de cada um separadamente.

## Estado da etapa Codex

Criados `services/api/src/report-csv.ts`, testes puros e HTTP com relatorios
mockados, e integrados os dois endpoints acima. Nenhuma query real, banco,
migration ou ambiente online usado. As evidencias finais estao no plano de
alinhamento; nao confundir testes de transporte com teste integrado de RLS.

## Proxima tarefa externa

Implementacao local de CEP-01 esta delimitada em
`NEXT-PROMPT-IMPLEMENTAR-CEP-FULL-2026-10-23.md`. Nao tocar CSV, comissoes ou
arquivos de outros agentes. Nenhuma alteracao na Gadotti online.
